import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { AppError } from "../errors/AppError";
import { ERROR_STATUS } from "../errors/codes";
import { errorEnvelope } from "../errors/envelope";
import { logger } from "../log";
import { getRequestId, requestLogger } from "./requestLogger";

let original: typeof process.stdout.write;
let captured: string[];

const installCapture = (): void => {
  captured = [];
  original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    captured.push(text);
    return true;
  }) as typeof process.stdout.write;
};

const restoreCapture = (): void => {
  process.stdout.write = original;
};

const parseLines = <T = Record<string, unknown>>(): T[] =>
  captured
    .join("")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);

describe("requestLogger", () => {
  beforeEach(() => {
    installCapture();
  });
  afterEach(() => {
    restoreCapture();
  });

  it("emits two JSON log lines that share the same requestId", async () => {
    const app = new Elysia().use(requestLogger()).get("/x", () => "hello");
    const res = await app.handle(new Request("http://localhost/x"));
    expect(res.status).toBe(200);

    const lines = parseLines<{
      msg: string;
      requestId: string;
      method?: string;
      path?: string;
      ip?: string;
      status?: number;
      durationMs?: number;
      ts: number;
    }>();
    const events = lines.filter((l) => l.msg === "request" || l.msg === "response");
    expect(events).toHaveLength(2);
    const [entry, exit] = events;
    if (!entry || !exit) throw new Error("missing entry/exit log");
    expect(entry.msg).toBe("request");
    expect(exit.msg).toBe("response");
    expect(entry.requestId).toBe(exit.requestId);
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/x");
    expect(typeof entry.ip).toBe("string");
    expect(exit.status).toBe(200);
    expect(typeof exit.durationMs).toBe("number");
    expect(exit.durationMs ?? -1).toBeGreaterThanOrEqual(0);
    expect(exit.ts).toBeGreaterThanOrEqual(entry.ts);
  });

  it("resolveIp uses the first comma-separated X-Forwarded-For entry", async () => {
    const app = new Elysia().use(requestLogger()).get("/x", () => "hi");
    await app.handle(
      new Request("http://localhost/x", {
        headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
      }),
    );
    const lines = parseLines<{ msg: string; ip?: string }>();
    const entry = lines.find((l) => l.msg === "request");
    expect(entry?.ip).toBe("203.0.113.5");
  });

  it("falls back to 'unknown' when no X-Forwarded-For header is present", async () => {
    const app = new Elysia().use(requestLogger()).get("/x", () => "hi");
    await app.handle(new Request("http://localhost/x"));
    const lines = parseLines<{ msg: string; ip?: string }>();
    const entry = lines.find((l) => l.msg === "request");
    expect(entry?.ip).toBe("unknown");
  });

  it("entry log and AppError envelope share the same requestId", async () => {
    const app = new Elysia()
      .use(requestLogger())
      .onError(({ error, request, set }) => {
        const requestId = getRequestId(request);
        if (!requestId) throw new Error("expected requestId");
        if (error instanceof AppError) {
          set.status = ERROR_STATUS[error.code];
          logger.warn("app error", { requestId, errorCode: error.code });
          return errorEnvelope(error.code, error.message, requestId, error.details);
        }
        return undefined;
      })
      .get("/boom", () => {
        throw new AppError("not_found", "missing");
      });

    const res = await app.handle(new Request("http://localhost/boom"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string }; requestId: string };

    const lines = parseLines<{ msg: string; requestId?: string }>();
    const entry = lines.find((l) => l.msg === "request");
    expect(entry?.requestId).toBeDefined();
    expect(body.requestId).toBe(entry?.requestId ?? "");
  });

  it("getRequestId returns undefined for a Request that never went through onRequest", () => {
    const orphan = new Request("http://localhost/orphan");
    expect(getRequestId(orphan)).toBeUndefined();
  });
});

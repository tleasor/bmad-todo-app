import { type AnyElysia, Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AppError } from "./errors/AppError";
import { registerOnError } from "./onError";
import { requestLogger } from "./middleware/requestLogger";

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

const buildApp = (envOverride: { isDev: boolean }): AnyElysia => {
  const app = new Elysia().use(requestLogger());
  registerOnError(app, envOverride);
  return app;
};

const parseLines = <T = Record<string, unknown>>(): T[] =>
  captured
    .join("")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);

describe("onError envelope", () => {
  beforeEach(() => {
    installCapture();
  });
  afterEach(() => {
    restoreCapture();
  });

  it("AppError is enveloped with the right status, code, and requestId", async () => {
    const app = buildApp({ isDev: false }).get("/boom", () => {
      throw new AppError("not_found", "thing missing", { id: 42 });
    });
    const res = await app.handle(new Request("http://localhost/boom"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown };
      requestId: string;
    };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("thing missing");
    expect(body.error.details).toEqual({ id: 42 });
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId.length).toBeGreaterThan(0);
  });

  it("AppError without details omits the details field", async () => {
    const app = buildApp({ isDev: false }).get("/c", () => {
      throw new AppError("id_conflict", "dupe");
    });
    const res = await app.handle(new Request("http://localhost/c"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: Record<string, unknown> };
    expect(Object.hasOwn(body.error, "details")).toBe(false);
  });

  it("Elysia VALIDATION error is mapped to validation_error 400", async () => {
    const { t } = await import("elysia");
    const app = buildApp({ isDev: false }).post("/v", () => "ok", {
      body: t.Object({ title: t.String() }),
    });
    const res = await app.handle(
      new Request("http://localhost/v", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown };
      requestId: string;
    };
    expect(body.error.code).toBe("validation_error");
    expect(body.error.message).toBe("Request validation failed");
    expect(typeof body.requestId).toBe("string");
  });

  it("unknown errors are mapped to internal_error 500 and stack is logged", async () => {
    const app = buildApp({ isDev: false }).get("/k", () => {
      throw new Error("kapow");
    });
    const res = await app.handle(new Request("http://localhost/k"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown };
      requestId: string;
    };
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe("Internal server error");
    expect(Object.hasOwn(body.error, "details")).toBe(false);

    const lines = parseLines<{ msg: string; stack?: unknown; errorCode?: string }>();
    const errLine = lines.find((l) => l.msg === "unhandled error");
    expect(errLine).toBeDefined();
    expect(errLine?.errorCode).toBe("internal_error");
    expect(typeof errLine?.stack).toBe("string");
    expect((errLine?.stack as string | undefined)?.length ?? 0).toBeGreaterThan(0);
  });

  it("in dev mode, unknown error envelope includes the original message in details", async () => {
    const app = buildApp({ isDev: true }).get("/k", () => {
      throw new Error("kapow-dev");
    });
    const res = await app.handle(new Request("http://localhost/k"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: { message?: string } };
    };
    expect(body.error.details).toEqual({ message: "kapow-dev" });
  });

  it("non-Error throwables are stringified in dev details", async () => {
    const app = buildApp({ isDev: true }).get("/s", () => {
      throw "string-thrown";
    });
    const res = await app.handle(new Request("http://localhost/s"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: { details?: { message?: string } };
    };
    expect(body.error.details?.message).toBe("string-thrown");
  });
});

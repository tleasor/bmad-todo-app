import { type AnyElysia, Elysia } from "elysia";
import { describe, expect, it } from "bun:test";
import { registerOnError } from "../onError";
import { bodySize } from "./bodySize";
import { requestLogger } from "./requestLogger";

const buildApp = (): AnyElysia => {
  const app = new Elysia()
    .use(requestLogger())
    .use(bodySize())
    .post("/api/echo", () => "ok")
    .get("/health", () => ({ status: "ok" }));
  registerOnError(app, { isDev: true });
  return app;
};

describe("bodySize middleware", () => {
  it("allows POST bodies at 9 KB (under the 10 KB cap)", async () => {
    const app = buildApp();
    const body = "x".repeat(9 * 1024);
    const res = await app.handle(
      new Request("http://localhost/api/echo", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(body.length),
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("rejects POST bodies over 10 KB with 413 + payload_too_large envelope", async () => {
    const app = buildApp();
    const body = "x".repeat(11 * 1024);
    const res = await app.handle(
      new Request("http://localhost/api/echo", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(body.length),
        },
      }),
    );
    expect(res.status).toBe(413);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
    const envelope = (await res.json()) as {
      error: { code: string; message: string; details?: unknown };
      requestId: string;
    };
    expect(envelope.error.code).toBe("payload_too_large");
    expect(envelope.error.message.length).toBeGreaterThan(0);
    expect(envelope.requestId.length).toBeGreaterThan(0);
  });

  it("passes through GET requests with no Content-Length", async () => {
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/health", { method: "GET" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("exempts /health even when a fabricated oversized Content-Length is supplied", async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/health", {
        method: "GET",
        headers: { "content-length": "99999" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("ignores non-finite Content-Length headers (defensive pass-through)", async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/api/echo", {
        method: "POST",
        body: "ok",
        headers: { "content-length": "not-a-number", "content-type": "text/plain" },
      }),
    );
    expect(res.status).toBe(200);
  });
});

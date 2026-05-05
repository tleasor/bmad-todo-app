import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AnyElysia, Elysia } from "elysia";
import { setDbFailed, setDbReady } from "../storage/db";
import { healthRoute } from "./health";

const buildApp = (): AnyElysia => new Elysia().use(healthRoute);

describe("GET /health (ready)", () => {
  beforeEach(() => {
    setDbReady();
  });

  afterEach(() => {
    setDbReady();
  });

  it("returns 200 with status ok and a numeric uptime", async () => {
    const res = await buildApp().handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptime: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("responds with JSON content-type", async () => {
    const res = await buildApp().handle(new Request("http://localhost/health"));
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
  });
});

describe("GET /health when migrations have failed", () => {
  beforeEach(() => {
    setDbFailed(new Error("test failure"));
  });

  afterEach(() => {
    setDbReady();
  });

  it("returns 503 with the service_unavailable error envelope", async () => {
    const res = await buildApp().handle(new Request("http://localhost/health"));
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: { message?: string } };
      requestId: string;
    };
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId.length).toBeGreaterThan(0);
  });

  it("echoes the failure message in details when running in dev", async () => {
    const res = await buildApp().handle(new Request("http://localhost/health"));
    const body = (await res.json()) as {
      error: { details?: { message?: string } };
    };
    expect(body.error.details?.message).toBe("test failure");
  });

  it("flips back to 200 when setDbReady is called (state is not write-once)", async () => {
    const failed = await buildApp().handle(new Request("http://localhost/health"));
    expect(failed.status).toBe(503);
    setDbReady();
    const ready = await buildApp().handle(new Request("http://localhost/health"));
    expect(ready.status).toBe(200);
  });
});

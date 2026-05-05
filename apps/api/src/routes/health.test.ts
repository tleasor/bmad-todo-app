import { describe, expect, it } from "bun:test";
import { type AnyElysia, Elysia } from "elysia";
import { healthRoute } from "./health";

const buildApp = (): AnyElysia => new Elysia().use(healthRoute);

describe("GET /health", () => {
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

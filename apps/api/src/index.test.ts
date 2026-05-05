import { describe, expect, it } from "bun:test";
import { app } from "./index";

describe("health", () => {
  it("returns 200 ok with uptime", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptime: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });
});

describe("api 404", () => {
  it("returns 404 for unknown api routes", async () => {
    const res = await app.handle(new Request("http://localhost/api/unknown"));
    expect(res.status).toBe(404);
  });
});

describe("spa fallback in dev", () => {
  it("returns 404 for non-api paths when running in dev (Vite owns SPA serving)", async () => {
    const res = await app.handle(new Request("http://localhost/some/path"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for the root in dev", async () => {
    const res = await app.handle(new Request("http://localhost/"));
    expect(res.status).toBe(404);
  });
});

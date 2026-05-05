import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { __resetBucketsForTests } from "./middleware/rateLimit";
import { app, serveSpa } from "./index";

let TMP_DIST: string;

// health route owned by routes/health.ts; see health.test.ts
//
// The rate-limit module is module-level singleton state shared with the
// production app; reset it in beforeEach so test order across files cannot
// trip the rate limit on a shared fixture IP (see Story 1.4 dev notes).
beforeEach(() => {
  __resetBucketsForTests();
});

describe("boot integration", () => {
  it("/health returns 200 after boot-time migrations have applied", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});

describe("tasks api smoke", () => {
  it("GET /api/tasks returns 200 with a JSON array (route is wired)", async () => {
    const res = await app.handle(new Request("http://localhost/api/tasks"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("api 404", () => {
  it("returns 404 for unknown api routes", async () => {
    const res = await app.handle(new Request("http://localhost/api/unknown"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for the bare /api path", async () => {
    const res = await app.handle(new Request("http://localhost/api"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for /api with a trailing slash", async () => {
    const res = await app.handle(new Request("http://localhost/api/"));
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

describe("serveSpa in production", () => {
  beforeAll(() => {
    TMP_DIST = mkdtempSync(join(tmpdir(), "spa-test-"));
    mkdirSync(join(TMP_DIST, "assets"), { recursive: true });
    writeFileSync(join(TMP_DIST, "index.html"), "<!doctype html><title>t</title>");
    writeFileSync(join(TMP_DIST, "assets", "app.js"), "console.warn('hi')");
  });
  afterAll(() => {
    rmSync(TMP_DIST, { recursive: true, force: true });
  });

  it("serves index.html for the root path", async () => {
    const res = serveSpa(new Request("http://localhost/"), {
      isDev: false,
      spaDist: TMP_DIST,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("serves a real asset file when it exists", async () => {
    const res = serveSpa(new Request("http://localhost/assets/app.js"), {
      isDev: false,
      spaDist: TMP_DIST,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.warn('hi')");
  });

  it("sets a JavaScript MIME on .js assets so Chrome's strict module check passes", async () => {
    const res = serveSpa(new Request("http://localhost/assets/app.js"), {
      isDev: false,
      spaDist: TMP_DIST,
    });
    expect(res.headers.get("content-type")).toContain("text/javascript");
  });

  it("falls back to index.html for an unknown SPA route", async () => {
    const res = serveSpa(new Request("http://localhost/some/deep/route"), {
      isDev: false,
      spaDist: TMP_DIST,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<!doctype html>");
  });

  it("returns 404 when the dist directory has no index.html", async () => {
    const res = serveSpa(new Request("http://localhost/"), {
      isDev: false,
      spaDist: "/nonexistent/path",
    });
    expect(res.status).toBe(404);
  });
});

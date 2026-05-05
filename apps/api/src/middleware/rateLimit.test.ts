import { type AnyElysia, Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { RATE_LIMIT_BURST, RATE_LIMIT_REFILL_PER_SEC } from "../constants";
import { registerOnError } from "../onError";
import { __getBucketsForTests, __resetBucketsForTests, consumeToken, rateLimit } from "./rateLimit";
import { requestLogger } from "./requestLogger";

const buildApp = (): AnyElysia => {
  const app = new Elysia()
    .use(requestLogger())
    .use(rateLimit())
    .get("/health", () => ({ status: "ok" }))
    .get("/api/test", () => "ok");
  registerOnError(app, { isDev: true });
  return app;
};

describe("consumeToken", () => {
  beforeEach(() => {
    __resetBucketsForTests();
  });

  afterEach(() => {
    __resetBucketsForTests();
  });

  it("allows up to RATE_LIMIT_BURST consecutive consumes from the same IP at t=0", () => {
    for (let i = 0; i < RATE_LIMIT_BURST; i += 1) {
      const result = consumeToken("a", 0);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(RATE_LIMIT_BURST - 1 - i);
    }
  });

  it("denies the 21st consume from the same IP at t=0", () => {
    for (let i = 0; i < RATE_LIMIT_BURST; i += 1) {
      consumeToken("a", 0);
    }
    const result = consumeToken("a", 0);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSec).toBe(1);
  });

  it("refills at RATE_LIMIT_REFILL_PER_SEC over time", () => {
    for (let i = 0; i < RATE_LIMIT_BURST; i += 1) {
      consumeToken("a", 0);
    }
    expect(consumeToken("a", 0).allowed).toBe(false);
    const refill1 = consumeToken("a", 1000);
    expect(refill1.allowed).toBe(true);
    expect(refill1.remaining).toBe(1);
    const refill2 = consumeToken("a", 1000);
    expect(refill2.allowed).toBe(true);
    expect(refill2.remaining).toBe(0);
    expect(consumeToken("a", 1000).allowed).toBe(false);
  });

  it("caps refill at RATE_LIMIT_BURST regardless of elapsed time", () => {
    consumeToken("a", 0);
    const result = consumeToken("a", 10_000_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMIT_BURST - 1);
  });

  it("evicts buckets idle longer than RATE_LIMIT_BUCKET_TTL_MS via the sweep", () => {
    consumeToken("old", 0);
    expect(__getBucketsForTests().has("old")).toBe(true);
    consumeToken("new", 11 * 60 * 1000);
    expect(__getBucketsForTests().has("old")).toBe(false);
    expect(__getBucketsForTests().has("new")).toBe(true);
  });

  it("retryAfterSec floors at 1 when bucket tokens are below 1", () => {
    for (let i = 0; i < RATE_LIMIT_BURST; i += 1) {
      consumeToken("a", 0);
    }
    const denied = consumeToken("a", 0);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("resetUnixSec advances toward full bucket time", () => {
    consumeToken("a", 0);
    const second = consumeToken("a", 0);
    expect(second.resetUnixSec).toBeGreaterThan(0);
    expect(Number.isFinite(second.resetUnixSec)).toBe(true);
  });

  it("resetUnixSec reflects the post-consume bucket state", () => {
    const now = 100_000;
    const result = consumeToken("a", now);
    const expectedMsToFull = (1 / RATE_LIMIT_REFILL_PER_SEC) * 1000;
    expect(result.remaining).toBe(RATE_LIMIT_BURST - 1);
    expect(result.resetUnixSec).toBe(Math.ceil((now + expectedMsToFull) / 1000));
  });
});

describe("rateLimit middleware integration", () => {
  beforeEach(() => {
    __resetBucketsForTests();
  });

  afterEach(() => {
    __resetBucketsForTests();
  });

  it("/health is exempt from rate limiting and never carries rate-limit headers", async () => {
    const app = buildApp();
    for (let i = 0; i < 25; i += 1) {
      const res = await app.handle(
        new Request("http://localhost/health", {
          headers: { "x-forwarded-for": "9.9.9.9" },
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("x-ratelimit-limit")).toBeNull();
    }
    expect(__getBucketsForTests().has("9.9.9.9")).toBe(false);
  });

  it("21st request to /api/* returns 429 with all four rate-limit headers and the envelope", async () => {
    const app = buildApp();
    for (let i = 0; i < RATE_LIMIT_BURST; i += 1) {
      const res = await app.handle(
        new Request("http://localhost/api/test", {
          headers: { "x-forwarded-for": "1.1.1.1" },
        }),
      );
      expect(res.status).toBe(200);
    }
    const limited = await app.handle(
      new Request("http://localhost/api/test", {
        headers: { "x-forwarded-for": "1.1.1.1" },
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("x-ratelimit-limit")).toBe(String(RATE_LIMIT_BURST));
    expect(limited.headers.get("x-ratelimit-remaining")).toBe("0");
    const reset = limited.headers.get("x-ratelimit-reset");
    expect(reset).not.toBeNull();
    expect(Number.isFinite(Number(reset))).toBe(true);
    expect(limited.headers.get("retry-after")).toBe("1");
    expect(limited.headers.get("content-type") ?? "").toContain("application/json");
    const envelope = (await limited.json()) as {
      error: { code: string; message: string };
      requestId: string;
    };
    expect(envelope.error.code).toBe("rate_limited");
    expect(envelope.error.message.length).toBeGreaterThan(0);
    expect(envelope.requestId.length).toBeGreaterThan(0);
  });

  it("falls back to 'unknown' when X-Forwarded-For is absent", async () => {
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/api/test"));
    expect(res.status).toBe(200);
    expect(__getBucketsForTests().has("unknown")).toBe(true);
  });

  it("reads the first entry of a comma-separated X-Forwarded-For", async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/api/test", {
        headers: { "x-forwarded-for": "5.5.5.5, 6.6.6.6, 7.7.7.7" },
      }),
    );
    expect(res.status).toBe(200);
    expect(__getBucketsForTests().has("5.5.5.5")).toBe(true);
    expect(__getBucketsForTests().has("6.6.6.6")).toBe(false);
  });
});

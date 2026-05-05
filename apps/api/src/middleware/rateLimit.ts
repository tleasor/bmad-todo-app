import { type AnyElysia, Elysia } from "elysia";
import {
  RATE_LIMIT_BUCKET_TTL_MS,
  RATE_LIMIT_BURST,
  RATE_LIMIT_REFILL_PER_SEC,
  RATE_LIMIT_SWEEP_INTERVAL_MS,
} from "../constants";
import { AppError } from "../errors/AppError";

type BucketState = { tokens: number; lastRefillMs: number };

const buckets = new Map<string, BucketState>();
let lastSweepMs = 0;

const resolveIp = (request: Request): string => {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
};

const sweepIdleBuckets = (now: number): void => {
  if (now - lastSweepMs < RATE_LIMIT_SWEEP_INTERVAL_MS) return;
  lastSweepMs = now;
  for (const [ip, state] of buckets) {
    if (now - state.lastRefillMs > RATE_LIMIT_BUCKET_TTL_MS) {
      buckets.delete(ip);
    }
  }
};

export type ConsumeResult = {
  allowed: boolean;
  remaining: number;
  resetUnixSec: number;
  retryAfterSec: number;
};

export const consumeToken = (ip: string, now: number): ConsumeResult => {
  sweepIdleBuckets(now);
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_BURST, lastRefillMs: now };
    buckets.set(ip, bucket);
  }
  const elapsedSec = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(
    RATE_LIMIT_BURST,
    bucket.tokens + elapsedSec * RATE_LIMIT_REFILL_PER_SEC,
  );
  bucket.lastRefillMs = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    const tokensToFull = RATE_LIMIT_BURST - bucket.tokens;
    const resetUnixSec = Math.ceil(
      (now + (tokensToFull / RATE_LIMIT_REFILL_PER_SEC) * 1000) / 1000,
    );
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetUnixSec,
      retryAfterSec: 0,
    };
  }
  const tokensToFull = RATE_LIMIT_BURST - bucket.tokens;
  const resetUnixSec = Math.ceil((now + (tokensToFull / RATE_LIMIT_REFILL_PER_SEC) * 1000) / 1000);
  const deficit = 1 - bucket.tokens;
  const retryAfterSec = Math.max(1, Math.ceil(deficit / RATE_LIMIT_REFILL_PER_SEC));
  return { allowed: false, remaining: 0, resetUnixSec, retryAfterSec };
};

export const rateLimit = (): AnyElysia =>
  new Elysia({ name: "rateLimit" }).onRequest(({ request, set }) => {
    if (new URL(request.url).pathname === "/health") return;
    const now = Date.now();
    const ip = resolveIp(request);
    const result = consumeToken(ip, now);
    set.headers["x-ratelimit-limit"] = String(RATE_LIMIT_BURST);
    set.headers["x-ratelimit-remaining"] = String(result.remaining);
    set.headers["x-ratelimit-reset"] = String(result.resetUnixSec);
    if (!result.allowed) {
      set.headers["retry-after"] = String(result.retryAfterSec);
      throw new AppError("rate_limited", "Too many requests");
    }
  });

export const __getBucketsForTests = (): ReadonlyMap<string, BucketState> => buckets;
export const __resetBucketsForTests = (): void => {
  buckets.clear();
  lastSweepMs = 0;
};

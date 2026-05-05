import { describe, expect, it } from "bun:test";
import { parseRetryAfter } from "./retryAfter";

describe("parseRetryAfter", () => {
  it("returns undefined for null", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("   ")).toBeUndefined();
  });

  it("parses delta-seconds digits to milliseconds", () => {
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("1")).toBe(1000);
    expect(parseRetryAfter("60")).toBe(60_000);
    expect(parseRetryAfter("  30  ")).toBe(30_000);
  });

  it("parses HTTP-date format relative to now", () => {
    const future = new Date(Date.now() + 5_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeDefined();
    expect(ms!).toBeGreaterThanOrEqual(0);
    expect(ms!).toBeLessThanOrEqual(5_500);
  });

  it("clamps past HTTP-date to zero", () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it("returns undefined for unparseable strings", () => {
    expect(parseRetryAfter("nonsense")).toBeUndefined();
    expect(parseRetryAfter("12abc")).toBeUndefined();
  });
});

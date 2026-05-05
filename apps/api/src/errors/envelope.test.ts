import { describe, expect, it } from "bun:test";
import { errorEnvelope, type ErrorEnvelope } from "./envelope";

describe("errorEnvelope", () => {
  it("returns the canonical envelope shape", () => {
    const env = errorEnvelope("not_found", "missing", "req-1");
    expect(env).toEqual({
      error: { code: "not_found", message: "missing" },
      requestId: "req-1",
    });
  });

  it("includes details when provided", () => {
    const env = errorEnvelope("validation_error", "bad", "req-2", { field: "title" });
    expect(env.error.details).toEqual({ field: "title" });
  });

  it("omits details when not provided", () => {
    const env = errorEnvelope("internal_error", "boom", "req-3");
    expect(Object.hasOwn(env.error, "details")).toBe(false);
  });

  it("preserves requestId verbatim", () => {
    const id = "01900000-0000-7000-8000-000000000001";
    const env = errorEnvelope("rate_limited", "slow down", id);
    expect(env.requestId).toBe(id);
  });

  it("produces a value matching ErrorEnvelope", () => {
    const env: ErrorEnvelope = errorEnvelope("id_conflict", "dupe", "req-4");
    expect(env.error.code).toBe("id_conflict");
  });
});

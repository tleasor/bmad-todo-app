import { describe, expect, it } from "bun:test";
import { AppError } from "./AppError";

describe("AppError", () => {
  it("is an instance of both Error and AppError", () => {
    const err = new AppError("not_found", "missing");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it("preserves code, message, and details", () => {
    const err = new AppError("validation_error", "bad input", { field: "title" });
    expect(err.code).toBe("validation_error");
    expect(err.message).toBe("bad input");
    expect(err.details).toEqual({ field: "title" });
  });

  it("leaves details undefined when not provided", () => {
    const err = new AppError("internal_error", "boom");
    expect(err.details).toBeUndefined();
  });

  it("sets name to AppError", () => {
    const err = new AppError("rate_limited", "slow down");
    expect(err.name).toBe("AppError");
  });
});

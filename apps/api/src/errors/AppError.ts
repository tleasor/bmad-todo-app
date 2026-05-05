import type { ErrorCode } from "./codes";

export class AppError extends Error {
  public override readonly name = "AppError";
  public readonly code: ErrorCode;
  public readonly details: unknown;

  public constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

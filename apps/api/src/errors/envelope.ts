import type { ErrorCode } from "./codes";

export type ErrorEnvelope = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};

export const errorEnvelope = (
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope => {
  const error: ErrorEnvelope["error"] = { code, message };
  if (details !== undefined) error.details = details;
  return { error, requestId };
};

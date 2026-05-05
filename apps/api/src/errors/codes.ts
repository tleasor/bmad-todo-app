export type ErrorCode =
  | "validation_error"
  | "not_found"
  | "id_conflict"
  | "payload_too_large"
  | "rate_limited"
  | "internal_error"
  | "service_unavailable";

export const ERROR_STATUS = Object.freeze({
  validation_error: 400,
  not_found: 404,
  id_conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
} as const) satisfies Record<ErrorCode, number>;

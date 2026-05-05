import type { AnyElysia } from "elysia";
import { AppError } from "./errors/AppError";
import { ERROR_STATUS, type ErrorCode } from "./errors/codes";
import { errorEnvelope, type ErrorEnvelope } from "./errors/envelope";
import { logger } from "./log";
import { getRequestId } from "./middleware/requestLogger";

type ValidationLike = {
  all?: unknown;
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const registerOnError = (app: AnyElysia, env: { isDev: boolean }): AnyElysia =>
  app.onError(({ error, code, set, request }) => {
    let requestId = getRequestId(request);
    if (!requestId) {
      requestId = Bun.randomUUIDv7();
      logger.warn("requestId fallback", {
        method: request.method,
        path: new URL(request.url).pathname,
      });
    }

    if (error instanceof AppError) {
      set.status = ERROR_STATUS[error.code];
      logger.warn("app error", {
        requestId,
        errorCode: error.code,
        message: error.message,
      });
      return errorEnvelope(error.code, error.message, requestId, error.details);
    }

    if (code === "VALIDATION") {
      const status: ErrorCode = "validation_error";
      set.status = ERROR_STATUS[status];
      const details = (error as ValidationLike).all;
      logger.warn("validation error", { requestId, errorCode: status });
      return errorEnvelope(status, "Request validation failed", requestId, details);
    }

    const status: ErrorCode = "internal_error";
    set.status = ERROR_STATUS[status];
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("unhandled error", {
      requestId,
      errorCode: status,
      stack,
      raw: messageOf(error),
    });
    const details: ErrorEnvelope["error"]["details"] = env.isDev
      ? { message: messageOf(error) }
      : undefined;
    return errorEnvelope(status, "Internal server error", requestId, details);
  });

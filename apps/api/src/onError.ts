import type { AnyElysia } from "elysia";
import { AppError } from "./errors/AppError";
import { ERROR_STATUS, type ErrorCode } from "./errors/codes";
import { errorEnvelope, type ErrorEnvelope } from "./errors/envelope";
import { logger } from "./log";
import { getRequestId, getRequestStartTs } from "./middleware/requestLogger";

type ValidationLike = {
  all?: unknown;
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const emitResponseLog = (
  request: Request,
  requestId: string,
  status: number,
  startTs: number | undefined,
): void => {
  logger.info("response", {
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    durationMs: startTs === undefined ? 0 : Math.round(performance.now() - startTs),
  });
};

export const registerOnError = (app: AnyElysia, env: { isDev: boolean }): AnyElysia =>
  app.onError(({ error, code, set, request }) => {
    let requestId = getRequestId(request);
    if (!requestId) {
      // Defensive: requestLogger's onRequest should have populated the WeakMap.
      // This branch is uncovered by tests intentionally — forcing it would
      // require contriving a Request that bypasses onRequest, which is not
      // worth the surface-area cost. The warn line is the production symptom.
      requestId = Bun.randomUUIDv7();
      logger.warn("requestId fallback", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
      });
    }
    const startTs = getRequestStartTs(request);

    if (error instanceof AppError) {
      const status = ERROR_STATUS[error.code];
      set.status = status;
      logger.warn("app error", {
        requestId,
        errorCode: error.code,
        message: error.message,
      });
      emitResponseLog(request, requestId, status, startTs);
      return errorEnvelope(error.code, error.message, requestId, error.details);
    }

    if (code === "VALIDATION") {
      const errorCode: ErrorCode = "validation_error";
      const status = ERROR_STATUS[errorCode];
      set.status = status;
      const details = (error as ValidationLike).all;
      logger.warn("validation error", { requestId, errorCode });
      emitResponseLog(request, requestId, status, startTs);
      return errorEnvelope(errorCode, "Request validation failed", requestId, details);
    }

    const errorCode: ErrorCode = "internal_error";
    const status = ERROR_STATUS[errorCode];
    set.status = status;
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("unhandled error", {
      requestId,
      errorCode,
      stack,
      raw: messageOf(error),
    });
    const details: ErrorEnvelope["error"]["details"] = env.isDev
      ? { message: messageOf(error) }
      : undefined;
    emitResponseLog(request, requestId, status, startTs);
    return errorEnvelope(errorCode, "Internal server error", requestId, details);
  });

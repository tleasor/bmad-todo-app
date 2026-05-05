import { type AnyElysia, Elysia } from "elysia";
import { logger } from "../log";

const REQUEST_IDS = new WeakMap<Request, string>();
const START_TIMES = new WeakMap<Request, number>();

export const getRequestId = (request: Request): string | undefined => REQUEST_IDS.get(request);

export const getRequestStartTs = (request: Request): number | undefined => START_TIMES.get(request);

const resolveIp = (request: Request): string => {
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
};

const ensureRequestId = (request: Request): string => {
  let requestId = REQUEST_IDS.get(request);
  if (!requestId) {
    requestId = Bun.randomUUIDv7();
    REQUEST_IDS.set(request, requestId);
    logger.warn("requestId fallback", {
      method: request.method,
      path: new URL(request.url).pathname,
    });
  }
  return requestId;
};

export const requestLogger = (): AnyElysia =>
  new Elysia({ name: "requestLogger" })
    .onRequest(({ request }) => {
      const requestId = Bun.randomUUIDv7();
      REQUEST_IDS.set(request, requestId);
      START_TIMES.set(request, performance.now());
      logger.info("request", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        ip: resolveIp(request),
      });
    })
    .derive({ as: "global" }, ({ request }) => ({
      requestId: ensureRequestId(request),
    }))
    .onAfterHandle({ as: "global" }, ({ request, set, response }) => {
      const requestId = ensureRequestId(request);
      const startTs = START_TIMES.get(request) ?? performance.now();
      const status =
        response instanceof Response
          ? response.status
          : typeof set.status === "number"
            ? set.status
            : 200;
      logger.info("response", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        durationMs: Math.round(performance.now() - startTs),
      });
    });

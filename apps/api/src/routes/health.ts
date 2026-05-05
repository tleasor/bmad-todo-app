// Story 1.4: this route must be exempt from rateLimit middleware.
import { Elysia } from "elysia";
import { env } from "../env";
import { errorEnvelope } from "../errors/envelope";
import { getRequestId } from "../middleware/requestLogger";
import { getDbStatus } from "../storage/db";

export const healthRoute = new Elysia().get("/health", ({ request, set }) => {
  const status = getDbStatus();
  if (status.ready) return { status: "ok", uptime: process.uptime() };
  set.status = 503;
  const requestId = getRequestId(request) ?? Bun.randomUUIDv7();
  return errorEnvelope(
    "service_unavailable",
    "Database migrations have not completed",
    requestId,
    env.IS_DEV ? { message: status.error?.message } : undefined,
  );
});

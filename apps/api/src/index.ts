import { statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { Elysia } from "elysia";
import { env } from "./env";
import { logger } from "./log";
import { bodySize } from "./middleware/bodySize";
import { rateLimit } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/requestLogger";
import { registerOnError } from "./onError";
import { healthRoute } from "./routes/health";
import { tasksRoute } from "./routes/tasks";
import { db, setDbFailed, setDbReady } from "./storage/db";
import { runMigrations } from "./storage/migrations/runner";

// Boot-time migration: runs on every module import (including tests) so
// /health reflects the real readiness state. The listening side-effect
// remains gated by import.meta.main below.
try {
  const result = runMigrations(db());
  setDbReady();
  if (result.applied.length > 0) {
    logger.info("migrations applied", { applied: result.applied });
  }
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  setDbFailed(error);
  logger.error("migrations failed", { stack: error.stack, message: error.message });
}

const SPA_DIST = resolve(import.meta.dir, "..", "..", "web", "dist");

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

export const serveSpa = (
  request: Request,
  options: { isDev: boolean; spaDist?: string },
): Response => {
  if (options.isDev) return new Response("Not Found", { status: 404 });
  const dist = options.spaDist ?? SPA_DIST;
  const indexPath = join(dist, "index.html");
  if (!isFile(indexPath)) return new Response("Not Found", { status: 404 });
  const url = new URL(request.url);
  const candidate = resolve(dist, `.${normalize(url.pathname)}`);
  if (candidate.startsWith(`${dist}/`) && isFile(candidate)) {
    return new Response(Bun.file(candidate));
  }
  return new Response(Bun.file(indexPath), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

const baseApp = new Elysia().use(requestLogger()).use(bodySize()).use(rateLimit()).use(healthRoute);
registerOnError(baseApp, { isDev: env.IS_DEV });

export const app = baseApp
  .use(tasksRoute)
  .get("/api", () => new Response("Not Found", { status: 404 }))
  .get("/api/", () => new Response("Not Found", { status: 404 }))
  .get("/api/*", () => new Response("Not Found", { status: 404 }))
  .get("/*", ({ request }) => serveSpa(request, { isDev: env.IS_DEV }));

export type App = typeof app;
export type { Task } from "./storage/tasks";

if (import.meta.main) {
  app.listen({ port: env.PORT, maxRequestBodySize: 1024 * 1024 });
  logger.info("listening", { port: env.PORT });
}

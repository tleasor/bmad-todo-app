import { statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { Elysia } from "elysia";
import { env } from "./env";
import { logger } from "./log";
import { requestLogger } from "./middleware/requestLogger";
import { registerOnError } from "./onError";
import { healthRoute } from "./routes/health";

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

const baseApp = new Elysia().use(requestLogger()).use(healthRoute);
registerOnError(baseApp, { isDev: env.IS_DEV });

export const app = baseApp
  .get("/api", () => new Response("Not Found", { status: 404 }))
  .get("/api/", () => new Response("Not Found", { status: 404 }))
  .get("/api/*", () => new Response("Not Found", { status: 404 }))
  .get("/*", ({ request }) => serveSpa(request, { isDev: env.IS_DEV }));

export type App = typeof app;

if (import.meta.main) {
  app.listen(env.PORT);
  logger.info("listening", { port: env.PORT });
}

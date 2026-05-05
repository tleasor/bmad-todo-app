import { statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { Elysia } from "elysia";
import { env } from "./env";

const SPA_DIST = resolve(import.meta.dir, "..", "..", "web", "dist");
const SPA_INDEX = join(SPA_DIST, "index.html");

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

export const app = new Elysia()
  .get("/health", () => ({ status: "ok", uptime: process.uptime() }))
  .get("/api/*", () => new Response("Not Found", { status: 404 }))
  .get("/*", ({ request }) => {
    if (env.IS_DEV) return new Response("Not Found", { status: 404 });
    if (!isFile(SPA_INDEX)) return new Response("Not Found", { status: 404 });
    const url = new URL(request.url);
    const candidate = resolve(SPA_DIST, "." + normalize(url.pathname));
    if (candidate.startsWith(SPA_DIST + "/") && isFile(candidate)) {
      return new Response(Bun.file(candidate));
    }
    return new Response(Bun.file(SPA_INDEX), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });

export type App = typeof app;

if (import.meta.main) {
  app.listen(env.PORT);
  // Story 1.2 replaces this with the structured logger.
  console.warn(JSON.stringify({ level: "info", msg: "listening", port: env.PORT, ts: Date.now() }));
}

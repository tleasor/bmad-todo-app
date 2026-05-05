// Story 1.4: this route must be exempt from rateLimit middleware.
import { Elysia } from "elysia";

export const healthRoute = new Elysia().get("/health", () => ({
  status: "ok",
  uptime: process.uptime(),
}));

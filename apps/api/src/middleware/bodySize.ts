import { type AnyElysia, Elysia } from "elysia";
import { MAX_REQUEST_BODY_BYTES } from "../constants";
import { AppError } from "../errors/AppError";

export const bodySize = (): AnyElysia =>
  new Elysia({ name: "bodySize" }).onRequest(({ request }) => {
    if (new URL(request.url).pathname === "/health") return;
    const header = request.headers.get("content-length");
    if (!header) return;
    const bytes = Number.parseInt(header, 10);
    if (!Number.isFinite(bytes)) return;
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      throw new AppError("payload_too_large", "Request body exceeds 10 KB limit");
    }
  });

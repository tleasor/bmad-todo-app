# Story 1.2: Backend Plumbing — Logger, Error Envelope, Request Middleware, Health Endpoint

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer building the backend,
I want shared logging, error envelope, and request-correlation primitives in place,
so that every subsequent endpoint emits structured logs, returns consistent error responses, and is correlated by `requestId`.

## Acceptance Criteria

1. **Logger module (`apps/api/src/log.ts`)** — exports `logger.info(msg, fields?)`, `logger.warn(msg, fields?)`, `logger.error(msg, fields?)`. Each call writes a single newline-terminated JSON object to `process.stdout` containing the fields `level: "info" | "warn" | "error"`, `msg: string`, `ts: number` (`Date.now()`), and any caller-supplied fields merged in (e.g. `requestId`, `errorCode`, `stack`, `method`, `path`, `status`, `durationMs`, `ip`). Field order matches D8's table; `level`, `msg`, `ts` are always present (NFR-R4).
2. **Error contract (`apps/api/src/errors/{AppError.ts, codes.ts, envelope.ts}`)** — `codes.ts` exports `ErrorCode` as a closed string-literal union (`"validation_error" | "not_found" | "id_conflict" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable"`) plus a frozen `ERROR_STATUS` map (`{ validation_error: 400, not_found: 404, id_conflict: 409, payload_too_large: 413, rate_limited: 429, internal_error: 500, service_unavailable: 503 }`). `AppError.ts` exports an `AppError` class extending `Error` with public readonly fields `code: ErrorCode`, `message: string`, `details?: unknown`. `envelope.ts` exports `errorEnvelope(code, message, requestId, details?)` returning `{ error: { code, message, details? }, requestId }` — `details` omitted from the response when undefined (FR30).
3. **Env module unchanged in scope** — `apps/api/src/env.ts` already validates and re-exports `PORT`, `DATABASE_PATH`, `NODE_ENV` per Story 1.1; this story does not modify it. Confirm no other module reads `Bun.env` (boundary rule).
4. **Request-logger middleware (`apps/api/src/middleware/requestLogger.ts`)** — exports a function (e.g. `requestLogger()`) returning an Elysia plugin that: (a) on every request, generates a UUIDv7 `requestId` via `Bun.randomUUIDv7()` and attaches it to the request context so handlers can read it; (b) emits an `info` log line on entry with `requestId`, `method`, `path`, `ip`; (c) emits an `info` log line on exit with `requestId`, `method`, `path`, `status`, `durationMs`. `ip` resolution: first comma-separated entry of `X-Forwarded-For` if present, else `request.ip` / Elysia's `server.requestIP` fallback, else the literal string `"unknown"`. The same `requestId` MUST appear on entry, exit, and any error log line for the same request.
5. **Global `onError` envelopes errors** — wired in `apps/api/src/index.ts` (or a small `onError` plugin). For an `AppError` instance, set `set.status` to `ERROR_STATUS[err.code]` and return `errorEnvelope(err.code, err.message, requestId, err.details)`. For Elysia's built-in `code === "VALIDATION"` error, map to `validation_error` (400) with `message: "Request validation failed"` and `details: err.all` (Elysia's structured validation detail array). For any other thrown value, map to `internal_error` (500), log at `error` level with the `stack` field set, and return the envelope with a generic `message: "Internal server error"` (do NOT leak the original message to clients in production; in `IS_DEV` you may include the original message in `details`).
6. **`requestId` echoed on errors even when thrown pre-`derive`** — Elysia's `derive` values are `undefined` in `onError` for errors that fire before `derive` (e.g. `NOT_FOUND`, `PARSE`). Story 1.2 must mitigate this so the envelope's `requestId` is never empty: generate the `requestId` in an `onRequest` hook (fires first) and store it on the request via a module-scoped `WeakMap<Request, string>`; both the request-logger derive AND the global `onError` read from this WeakMap. If the lookup misses (defensive fallback), generate a fresh UUIDv7, log at `warn` with `msg: "requestId fallback"`, and use it.
7. **`GET /health` returns `{ status: "ok", uptime }` JSON** — handler in `apps/api/src/routes/health.ts` (extracted out of `index.ts` per architecture's per-package src layout). Returns HTTP 200 with body `{ status: "ok", uptime: process.uptime() }` (FR31). The route does NOT need to be exempt from rate-limiting in this story (rate-limit middleware does not exist yet — Story 1.4 introduces it and is responsible for the exemption); leave a one-line `// Story 1.4: this route must be exempt from rateLimit` comment at the top of `health.ts` so the future implementer cannot miss it.
8. **Health smoke test (`apps/api/src/routes/health.test.ts`)** — a `bun:test` exercises `app.handle(new Request("http://localhost/health"))` and asserts: HTTP status `200`; response JSON has `status === "ok"`; `typeof body.uptime === "number"` and `body.uptime >= 0`; the `Content-Type` header is JSON. Story 1.1's `apps/api/src/index.test.ts` already covers a subset of these; this story replaces or extends them — do not let the suite have two competing health tests after this story lands. (Move the existing health assertions out of `index.test.ts` if `health.ts` becomes the new owner.)
9. **Per-request log correlation proven by test** — an integration test in `apps/api/src/middleware/requestLogger.test.ts` registers a tiny Elysia app with the middleware, captures `process.stdout` writes (e.g. monkey-patch `process.stdout.write` in a `beforeEach`/`afterEach`), fires a single `app.handle(...)` call, and asserts: exactly two log lines emitted; both parse as JSON; both share the same `requestId`; the entry line contains `method` + `path` + `ip`; the exit line contains `status` + `durationMs >= 0`; the second line's `ts >= first.ts`.
10. **`onError` envelope shape proven by test** — a `bun:test` (`apps/api/src/errors/envelope.test.ts` plus an integration test wiring `onError` to a route that throws `new AppError("validation_error", "bad")`) asserts: HTTP status matches `ERROR_STATUS[code]`; body shape is exactly `{ error: { code, message, details? }, requestId }` with `requestId` populated and `details` absent when not provided; the `code` round-trips correctly for at least one of each: `AppError`, Elysia `VALIDATION`, and an unknown thrown value (mapped to `internal_error` with stack logged, original message NOT in the response body when `NODE_ENV === "production"`).
11. **Coverage gate stays green** — `bun run check:full` passes after this story: `bun scripts/check-coverage.ts` reports aggregate `% Funcs >= 70` AND `% Lines >= 70` across `apps/web` + `apps/api` (NFR-M1). The new modules (`log.ts`, `errors/*`, `middleware/requestLogger.ts`, `routes/health.ts`) MUST contribute meaningful tests — count synthetically-driven lines (e.g. `logger.info("x")` invocations from a single test) toward coverage, but each public function must have at least one behavioral assertion (not just "doesn't throw").
12. **Implementation patterns honored** — named exports only (no `export default`); `import type` for the `ErrorCode` import inside `envelope.ts` and `AppError.ts`; `describe`/`it` (not `test`); no `console.log` outside `log.ts` itself (`log.ts` is the ONLY production module allowed to write to `process.stdout` directly); no `any` (use `unknown` and narrow); no magic numbers (`ERROR_STATUS` map is the single source of HTTP status codes); explicit return types on exported functions (oxlint enforces).

## Tasks / Subtasks

- [ ] **Task 1 — Implement structured logger** (AC: #1, #11, #12)
  - [ ] Create `apps/api/src/log.ts`. Single export: `export const logger = { info, warn, error }` where each function has signature `(msg: string, fields?: Record<string, unknown>) => void`.
  - [ ] Write to `process.stdout.write(JSON.stringify({ level, msg, ts: Date.now(), ...fields }) + "\n")`. JSON serialization MUST handle undefined values (drop them) and Error instances (serialize via `{ name, message, stack }`); the easiest path is a small `serialize(fields)` helper that strips undefined and replaces `Error` instances before passing to `JSON.stringify`.
  - [ ] Field-order note: `JSON.stringify` preserves insertion order; the spread of caller fields comes LAST so callers cannot accidentally overwrite `level`, `msg`, or `ts`.
  - [ ] Add `apps/api/src/log.test.ts`. Capture `process.stdout.write` via monkey-patch in `beforeEach`/`afterEach`. Assert: each level emits exactly one JSON line; all three required fields are present; caller-supplied fields appear; an `Error` field is serialized (not `[object Object]`); `undefined` fields are stripped; level cannot be overridden by caller.
  - [ ] Replace the placeholder `process.stdout.write(JSON.stringify({...listening...}))` in `apps/api/src/index.ts` with `logger.info("listening", { port: env.PORT })`. Delete the `// Story 1.2 replaces this with the structured logger.` comment.

- [ ] **Task 2 — Implement error envelope module** (AC: #2, #5, #10, #12)
  - [ ] Create `apps/api/src/errors/codes.ts`. Export `type ErrorCode = "validation_error" | "not_found" | "id_conflict" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable"`. Export `const ERROR_STATUS: Readonly<Record<ErrorCode, number>>` with the mapping from D4. Use `as const` + `Object.freeze` to lock the map at module load.
  - [ ] Create `apps/api/src/errors/AppError.ts`. `export class AppError extends Error { constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) { super(message); this.name = "AppError"; } }`. Mark with `import type { ErrorCode } from "./codes"`.
  - [ ] Create `apps/api/src/errors/envelope.ts`. `export type ErrorEnvelope = { error: { code: ErrorCode; message: string; details?: unknown }; requestId: string }`. `export const errorEnvelope = (code, message, requestId, details?) => { const error: ErrorEnvelope["error"] = { code, message }; if (details !== undefined) error.details = details; return { error, requestId }; }`. Explicit return type on the exported function (oxlint requirement).
  - [ ] Add `apps/api/src/errors/envelope.test.ts`. Cases: returns shape with `details` when supplied; omits `details` when not supplied; `requestId` is preserved verbatim; `message` is preserved verbatim; type-level — verify via a `satisfies ErrorEnvelope` assertion in a non-emitted test that the shape is exhaustive.
  - [ ] Add `apps/api/src/errors/AppError.test.ts`. Cases: instance is `instanceof Error` AND `instanceof AppError`; `code`, `message`, `details` round-trip; `name === "AppError"`.

- [ ] **Task 3 — Implement request-logger middleware with WeakMap-based requestId** (AC: #4, #6, #9, #12)
  - [ ] Create `apps/api/src/middleware/requestLogger.ts`. Define `const REQUEST_IDS = new WeakMap<Request, string>()` at module scope. Export `getRequestId(request: Request): string | undefined` so `onError` can retrieve it without depending on the Elysia plugin shape.
  - [ ] Export the plugin: `export const requestLogger = () => new Elysia({ name: "requestLogger" }).onRequest(({ request }) => { REQUEST_IDS.set(request, Bun.randomUUIDv7()); }).derive(({ request }) => ({ requestId: REQUEST_IDS.get(request) ?? Bun.randomUUIDv7(), startTs: performance.now() })).onBeforeHandle(({ requestId, request }) => { logger.info("request", { requestId, method: request.method, path: new URL(request.url).pathname, ip: resolveIp(request) }); }).onAfterResponse(({ requestId, request, set, startTs }) => { logger.info("response", { requestId, method: request.method, path: new URL(request.url).pathname, status: typeof set.status === "number" ? set.status : 200, durationMs: Math.round(performance.now() - startTs) }); })`. Adjust hook names to match Elysia 1.4's actual lifecycle if the names differ — the contract is "log on entry before handler, log on exit after response".
  - [ ] Implement `resolveIp(request: Request): string`: read `X-Forwarded-For`, take the first comma-separated entry trimmed; if absent, return the literal `"unknown"`. (Elysia's `server.requestIP` is exposed via the handler context, not the bare `Request`; if the dev agent finds a clean way to inject it, great — otherwise `"unknown"` is acceptable for MVP per the architecture's single-container, single-IP-source assumption.)
  - [ ] Add `apps/api/src/middleware/requestLogger.test.ts`. Capture stdout. Mount the plugin on a tiny Elysia app with one route. Fire `app.handle(...)` once. Assert two lines emitted with matching `requestId`s; entry line has `method`/`path`/`ip`; exit line has `status`/`durationMs >= 0`; `durationMs` is a finite non-negative number; line ordering is entry-before-exit.
  - [ ] Add a second test case that throws `new AppError("not_found", "x")` from the route (after `onError` is wired in Task 4) and asserts the entry log + the error envelope share the same `requestId`.

- [ ] **Task 4 — Wire global `onError` to the envelope** (AC: #5, #6, #10)
  - [ ] In `apps/api/src/index.ts`, attach `.use(requestLogger())` BEFORE the `.onError(...)` registration so the WeakMap is populated. Add `.onError(({ error, code, set, request }) => { ... })`:
    - Resolve `requestId` from `getRequestId(request)`. If missing, generate a fresh UUIDv7 + `logger.warn("requestId fallback", { method: request.method, path: new URL(request.url).pathname })`.
    - If `error instanceof AppError`: `set.status = ERROR_STATUS[error.code]`; `logger.warn("app error", { requestId, errorCode: error.code, message: error.message })`; return `errorEnvelope(error.code, error.message, requestId, error.details)`.
    - Else if Elysia's `code === "VALIDATION"`: `set.status = 400`; `logger.warn("validation error", { requestId, errorCode: "validation_error" })`; return `errorEnvelope("validation_error", "Request validation failed", requestId, error.all ?? undefined)`. (Elysia's `VALIDATION` error exposes `error.all` — confirm with the local installed `elysia@1.4.28` types if signature drifts.)
    - Else: `set.status = 500`; `logger.error("unhandled error", { requestId, errorCode: "internal_error", stack: error instanceof Error ? error.stack : undefined, raw: error instanceof Error ? error.message : String(error) })`; return `errorEnvelope("internal_error", "Internal server error", requestId, env.IS_DEV ? { message: error instanceof Error ? error.message : String(error) } : undefined)`.
  - [ ] Add `apps/api/src/index.test.ts` cases (or a new `apps/api/src/onError.test.ts` if the file is getting crowded): for each of the three branches, mount a route that throws and assert status, body shape, and `requestId` echoed. The `internal_error` test asserts the response body has NO `details` when `NODE_ENV === "production"` and DOES have `details.message` in dev.

- [ ] **Task 5 — Extract `/health` to `routes/health.ts`** (AC: #7, #8)
  - [ ] Create `apps/api/src/routes/health.ts`. Top of file: `// Story 1.4: this route must be exempt from rateLimit middleware.` Export `const healthRoute = new Elysia().get("/health", () => ({ status: "ok", uptime: process.uptime() }))` (named, no plugin name needed since the route is unique).
  - [ ] In `apps/api/src/index.ts`, replace the inline `.get("/health", ...)` call with `.use(healthRoute)`. Order: `.use(requestLogger()).use(healthRoute).onError(...).get("/api", ...)...` — confirm the request-logger plugin still wraps `/health` (entry/exit logs MUST appear on `/health` requests too).
  - [ ] Create `apps/api/src/routes/health.test.ts`. Cases: status 200; body `status === "ok"`; `typeof body.uptime === "number"` and `>= 0`; `Content-Type` includes `application/json`. Move the existing health assertion out of `apps/api/src/index.test.ts` so the suite has exactly one health test owner; replace the moved-out block in `index.test.ts` with a one-line note `// health route owned by routes/health.ts; see health.test.ts` (oxlint allows `//` comments).

- [ ] **Task 6 — Verify all check scripts pass** (AC: #11)
  - [ ] Run `bun run check` (oxlint + oxfmt + tsgo + dep-count) — green.
  - [ ] Run `bun run check:full` — green; `scripts/check-coverage.ts` reports both `% Funcs >= 70` and `% Lines >= 70` across both packages. If coverage drops because new files added without enough assertions, ADD assertions; do NOT lower the threshold.
  - [ ] Run `bun run check:release` — green (Playwright multi-browser smoke + Lighthouse). The smoke spec hits `/health`, so the request-logger emits two JSON lines per request — verify nothing in the spec depends on the old plain log shape.
  - [ ] `docker compose up --build` — `docker compose logs` shows structured JSON lines from real requests (entry + exit on `/health`). The startup `listening` line is now a `logger.info` call.

- [ ] **Task 7 — Quick review pass against architecture** (AC: #12)
  - [ ] Re-read `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md` § "Backend handler discipline" + "Logging" + "Anti-Patterns". Confirm: no `console.log` in production code; `logger` is the single stdout writer; every log line emitted from inside a request context carries `requestId` (search `apps/api/src/**/*.ts` for `logger.` calls and verify); no `export default`; no `any`; no `// @ts-ignore`.
  - [ ] Re-read `_bmad-output/planning-artifacts/architecture/core-architectural-decisions.md` § D4 + D8. Confirm `ErrorCode` exhausts the union; `ERROR_STATUS` matches the doc; D8's log fields all appear at least once across the suite.

## Dev Notes

### Critical context for the dev agent

This is **Story 1.2 of 30** — the SECOND implementation story, building on Story 1.1's bare scaffold. The repo already has a working Elysia hello-world with `/health` inline in `index.ts`, an `index.test.ts` covering it, the `serveSpa` SPA-fallback handler, and the `process.stdout.write(JSON.stringify({...listening...}))` placeholder log line that THIS story is responsible for replacing with the real `logger.info("listening", ...)` call.

**This story is plumbing — it does NOT introduce business logic**. Out-of-scope work this story must NOT do:

- ❌ Rate-limiting middleware (Story 1.4 owns `middleware/rateLimit.ts`).
- ❌ Body-size limit middleware (Story 1.4 owns it).
- ❌ Tasks routes / repository / migrations (Stories 1.3, 1.4).
- ❌ Frontend changes — none.
- ❌ Modifying `apps/api/src/env.ts` — Story 1.1 already finalized it; the existing schema (`PORT`, `DATABASE_PATH`, `NODE_ENV`, `IS_DEV`) is exactly what this story needs.

The scope is: logger module + error contract + request-logger middleware + global `onError` + `/health` extracted to its own route file + tests for all of the above. Nothing more.

### Locked architectural decisions (non-negotiable)

| Concern | Decision | Source |
|---|---|---|
| Logger | Hand-rolled structured JSON to stdout, no `pino`/`winston` | core-architectural-decisions.md → D8 |
| Log fields | `level`, `msg`, `ts`, `requestId`, `method`, `path`, `status`, `durationMs`, `ip`, `errorCode`, `stack` | D8 table |
| Log levels at MVP | `info`, `warn`, `error`. No `debug`. No `LOG_LEVEL` env var | D8 |
| Error envelope shape | `{ error: { code, message, details? }, requestId }` | D4 |
| Error codes | Closed string-literal union of 7 codes | D4 |
| Status mapping | Closed `ERROR_STATUS` map (no per-route status decisions) | D4 |
| `requestId` generator | UUIDv7 — use `Bun.randomUUIDv7()` (native to Bun 1.1.34+; we are on 1.3.11) | D8 + Bun runtime |
| `requestId` echo | Generated in middleware, attached to all log lines, echoed in error responses | D4 + D8 |
| `onError` is single | One global `onError` handler in `apps/api/src/index.ts`; routes throw `AppError` and never return error envelopes manually | D5 + Implementation Patterns "Backend handler discipline" |
| Health endpoint | `GET /health` returns 200 `{ status: "ok", uptime }`; lives in `routes/health.ts`; outside `/api/*` | D3 + project-structure-boundaries.md |
| Single Elysia app | Routes mounted via `app.use(...)`. No nested apps | Implementation Patterns |

### `Bun.randomUUIDv7()` — use the native API

D8 says "UUIDv7 generated in middleware". Story 1.1's epic mentioned a hand-rolled generator (~30 LOC). **DO NOT hand-roll it.** Bun 1.1.34+ ships `Bun.randomUUIDv7()` natively, returning a sortable UUIDv7 string. We are on Bun 1.3.11 — the API is available. The hand-rolled generator stays planned for the FRONTEND only (`apps/web/src/data/uuid.ts`, owned by Story 1.5+) because the frontend cannot depend on `Bun.*`. The backend uses the native call.

Reference: [Bun.randomUUIDv7 docs](https://bun.com/reference/bun/randomUUIDv7).

### The pre-`derive` `onError` gotcha (load-bearing)

Elysia's `derive(...)` runs AFTER the router. For errors that fire BEFORE `derive` (router `NOT_FOUND`, body `PARSE` errors), the `requestId` you would put on the context via `derive` is `undefined` in `onError`. This is a known Elysia issue (see [elysiajs/elysia#1467](https://github.com/elysiajs/elysia/issues/1467)).

**Mitigation locked by AC #6:** generate the `requestId` in `onRequest` (which fires before everything, including the router) and stash it in a module-scoped `WeakMap<Request, string>`. Both the request-logger middleware AND the global `onError` resolve `requestId` via `getRequestId(request)`. WeakMap entries are GC'd when the `Request` object is collected, so there is no memory leak.

If the WeakMap lookup misses (defensive fallback — should never happen if `onRequest` ran), generate a fresh UUIDv7 and emit a `logger.warn("requestId fallback", ...)` so the symptom is observable in logs.

### Elysia 1.4 lifecycle — hook names to use

The contract is "log on entry, log on exit". The Elysia 1.4 hook names that match this contract:

- `onRequest` — fires first, before routing. Use this to populate the `WeakMap` with a fresh `requestId`.
- `derive` — runs after routing, before the handler. Use this to expose `requestId` and `startTs` on the context object so handlers can read them.
- `onBeforeHandle` — runs after `derive`, before the handler body. Emit the entry log here so `requestId` is guaranteed available on the context.
- `onAfterResponse` — runs after the response has been sent. Emit the exit log here so the response `status` is final.
- `onError` — runs when any of the above (or the handler) throws.

If the dev agent confirms a cleaner hook combination by reading the installed `elysia@1.4.28` source / types, that is fine — the AC is "two log lines, same `requestId`, entry has method/path/ip, exit has status/durationMs". The hook names are guidance, not contract.

Reference: [Elysia Lifecycle docs](https://elysiajs.com/essential/life-cycle).

### File structure to create / modify

**Files this story creates:**

```
apps/api/src/log.ts                          + .test.ts
apps/api/src/errors/AppError.ts              + .test.ts
apps/api/src/errors/codes.ts
apps/api/src/errors/envelope.ts              + .test.ts
apps/api/src/middleware/requestLogger.ts     + .test.ts
apps/api/src/routes/health.ts                + .test.ts
```

**Files this story modifies:**

- `apps/api/src/index.ts` — replace inline `/health` handler with `.use(healthRoute)`; add `.use(requestLogger())`; add `.onError(...)`; replace placeholder `process.stdout.write(...)` with `logger.info("listening", { port: env.PORT })`. The static-SPA `serveSpa` handler and the `/api` 404 routes are untouched.
- `apps/api/src/index.test.ts` — move the health assertions OUT (to `routes/health.test.ts`); keep the `/api` 404 tests and the `serveSpa` tests as-is. Replace the moved block with a one-line comment marker.

**Files this story must NOT modify:**

- `apps/api/src/env.ts` — locked by Story 1.1.
- `apps/api/src/constants.ts` — empty placeholder; ignore.
- `.gitkeep` files in `errors/`, `middleware/`, `routes/`, `storage/migrations/` — delete them as you create the real files in those directories.
- Anything in `apps/web/`.

### Concrete code shapes (recommended)

**`apps/api/src/log.ts`:**

```ts
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const serialize = (fields: Fields | undefined): Fields => {
  const out: Fields = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (v instanceof Error) {
      out[k] = { name: v.name, message: v.message, stack: v.stack };
      continue;
    }
    out[k] = v;
  }
  return out;
};

const emit = (level: Level, msg: string, fields?: Fields): void => {
  const line = JSON.stringify({ level, msg, ts: Date.now(), ...serialize(fields) });
  process.stdout.write(`${line}\n`);
};

export const logger = {
  info: (msg: string, fields?: Fields): void => { emit("info", msg, fields); },
  warn: (msg: string, fields?: Fields): void => { emit("warn", msg, fields); },
  error: (msg: string, fields?: Fields): void => { emit("error", msg, fields); },
} as const;
```

Why a `serialize` helper? Plain `JSON.stringify` drops `undefined` values silently for object fields BUT serializes `Error` instances as `{}` (because `name`/`message`/`stack` are non-enumerable). The helper makes both behaviors explicit and testable.

**`apps/api/src/errors/codes.ts`:**

```ts
export type ErrorCode =
  | "validation_error"
  | "not_found"
  | "id_conflict"
  | "payload_too_large"
  | "rate_limited"
  | "internal_error"
  | "service_unavailable";

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  validation_error: 400,
  not_found: 404,
  id_conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
});
```

**`apps/api/src/errors/AppError.ts`:**

```ts
import type { ErrorCode } from "./codes";

export class AppError extends Error {
  public override readonly name = "AppError";
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
```

(`override` is correct on `name` — `Error.prototype.name` exists.)

**`apps/api/src/errors/envelope.ts`:**

```ts
import type { ErrorCode } from "./codes";

export type ErrorEnvelope = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};

export const errorEnvelope = (
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope => {
  const error: ErrorEnvelope["error"] = { code, message };
  if (details !== undefined) error.details = details;
  return { error, requestId };
};
```

**`apps/api/src/middleware/requestLogger.ts`** (skeleton — adjust hook names as needed):

```ts
import { Elysia } from "elysia";
import { logger } from "../log";

const REQUEST_IDS = new WeakMap<Request, string>();

export const getRequestId = (request: Request): string | undefined =>
  REQUEST_IDS.get(request);

const resolveIp = (request: Request): string => {
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
};

export const requestLogger = (): Elysia =>
  new Elysia({ name: "requestLogger" })
    .onRequest(({ request }) => {
      REQUEST_IDS.set(request, Bun.randomUUIDv7());
    })
    .derive(({ request }) => ({
      requestId: REQUEST_IDS.get(request) ?? Bun.randomUUIDv7(),
      startTs: performance.now(),
    }))
    .onBeforeHandle(({ requestId, request }) => {
      logger.info("request", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        ip: resolveIp(request),
      });
    })
    .onAfterResponse(({ requestId, request, set, startTs }) => {
      logger.info("response", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status: typeof set.status === "number" ? set.status : 200,
        durationMs: Math.round(performance.now() - startTs),
      });
    });
```

**`apps/api/src/routes/health.ts`:**

```ts
// Story 1.4: this route must be exempt from rateLimit middleware.
import { Elysia } from "elysia";

export const healthRoute = new Elysia().get("/health", () => ({
  status: "ok",
  uptime: process.uptime(),
}));
```

### Anti-patterns to actively avoid

- ❌ Hand-rolling a UUIDv7 generator on the backend — `Bun.randomUUIDv7()` exists.
- ❌ Adding `pino`, `winston`, `bunyan`, `loglevel`, or any logging dep — D8 locks zero deps.
- ❌ Adding `cors`, `helmet`, `body-parser` — Elysia handles them; not needed at MVP.
- ❌ A second `onError` per route — there is ONE global `onError` in `index.ts`.
- ❌ Routes returning `{ error: { code: ... } }` directly — they throw `AppError`; the `onError` envelopes.
- ❌ `console.log` / `console.warn` / `console.error` outside `log.ts` itself — even tests should not use them. (`log.test.ts` may temporarily monkey-patch `process.stdout.write` to capture lines; that's fine.)
- ❌ Storing `requestId` on a global `let` or module-scope mutable — use the `WeakMap` keyed by `Request`.
- ❌ Using `crypto.randomUUID()` (returns UUIDv4, not v7 — wrong sort order) when `Bun.randomUUIDv7()` is what D8 specifies.
- ❌ Logging `Bun.env` keys directly — `env.ts` is the only consumer and the `logger.info("listening", ...)` line should not include secrets (we don't have any at MVP, but the principle is locked for forward).
- ❌ Adding `@types/uuid` or any UUID npm package.

### Previous story intelligence (Story 1.1)

What Story 1.1 left in the repo that this story builds on:

- **`apps/api/src/index.ts:35`** — inline `.get("/health", () => ({ status: "ok", uptime: process.uptime() }))`. Replace with `.use(healthRoute)`.
- **`apps/api/src/index.ts:46-48`** — `process.stdout.write(JSON.stringify({ level: "info", msg: "listening", port: env.PORT, ts: Date.now() }) + "\n")` with the comment `// Story 1.2 replaces this with the structured logger.`. Replace with `logger.info("listening", { port: env.PORT })`. Delete the comment.
- **`apps/api/src/index.test.ts:9-17`** — `describe("health", ...)` block. Move to `apps/api/src/routes/health.test.ts`. Keep the `/api` 404 and `serveSpa` describe blocks untouched.
- **`apps/api/src/env.ts`** — already exposes `env.IS_DEV` (boolean, `NODE_ENV !== "production"`). Use `env.IS_DEV` for the dev-only `details` echo in the catch-all `onError` branch. Do NOT read `Bun.env.NODE_ENV` directly.
- **`scripts/check-coverage.ts`** — runs `bun test --coverage` and parses the "All files" summary (note: it streams stdout/stderr in real time as of the Round 2 patches). It enforces `% Funcs >= 70` AND `% Lines >= 70`. New files without sufficient assertions WILL drop the aggregate; budget tests accordingly.
- **Lint config (`.oxlintrc.json`)** — `no-console: ["error", { allow: ["warn", "error"] }]`. Tests can use `console.warn` / `console.error` if absolutely necessary, but production code uses `logger.*`. The lint rule does NOT block `process.stdout.write` — that is the escape hatch the logger uses.
- **Test idiom** — `describe(...)` + `it(...)` (Story 1.1 used this; keep consistent).
- **The Round 2 `process.stdout.write` for user-facing success in `scripts/check-coverage.ts`** — that's a SCRIPT, not production app code. Don't replicate that pattern in app code; use `logger.*`.

Coverage budget reality from Story 1.1: the suite currently reports `~92.86% funcs / ~85.77% lines` per the Change Log. After this story adds ~6 new modules + ~6 new test files, expect the aggregate to dip; the gate is `>= 70%` so there is comfortable headroom, but each new public function MUST have at least one behavioral test.

### Git intelligence — recent commits

Recent activity (from `git log --oneline -10`): all of Story 1.1's review patches landed in `21c0d23 Review story 1.1`. The repo is clean. No conflicts to resolve. The architecture-locked dep versions (Elysia 1.4.28, Bun 1.3.11) are pinned exact in `apps/api/package.json` and `bun.lock` — do NOT bump them in this story.

### Project Structure Notes

**Alignment:** every file this story creates is at the path the architecture's *Project Structure & Boundaries* section pre-declares:

- `apps/api/src/log.ts` — ✓
- `apps/api/src/errors/{AppError,codes,envelope}.ts` — ✓
- `apps/api/src/middleware/requestLogger.ts` — ✓
- `apps/api/src/routes/health.ts` — ✓ (replaces the inline handler)

**Detected variances:**

- The architecture's directory tree lists `routes/health.ts + .test.ts`. Story 1.1 placed the health handler inline in `index.ts` and the health test in `index.test.ts` (acceptable for the scaffold story). This story corrects that placement — the architecture wins.
- The architecture mentions `requestLogger` "assigns requestId" but does not specify HOW to expose it to `onError` for pre-`derive` errors. The `WeakMap<Request, string>` pattern is THIS story's resolution; document it inline in `requestLogger.ts` if the dev agent finds a cleaner native-Elysia pattern.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-1-2] — story BDD acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#api-communication-patterns] — D3 (REST), D4 (error envelope), D5 (validation)
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#infrastructure-deployment] — D8 (logger fields table)
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#cross-cutting-conventions] — logging, constants, env vars, comments
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#anti-patterns-forbidden] — `console.log` ban, `any` ban, default exports ban
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#per-package-src-layout-backend] — file paths for `log.ts`, `errors/`, `middleware/`, `routes/`
- [Source: _bmad-output/planning-artifacts/architecture/architecture-validation-results.md#gaps-found-and-resolved] — Gap 2 (env var inventory; not modified by this story)
- [Source: _bmad-output/planning-artifacts/prd.md] FR30 (error contract), FR31 (health endpoint), FR33 (logs visible via `docker compose logs`); NFR-R4 (structured JSON logs), NFR-R5 (health-check ready ≤ 5s, returns 200 when ready), NFR-M1 (≥70% coverage)
- [Bun.randomUUIDv7 reference](https://bun.com/reference/bun/randomUUIDv7) — native UUIDv7 API; available since Bun 1.1.34
- [Elysia Lifecycle docs](https://elysiajs.com/essential/life-cycle) — onRequest / derive / onBeforeHandle / onAfterResponse / onError ordering
- [Elysia issue #1467 — derive undefined in onError for pre-derive errors](https://github.com/elysiajs/elysia/issues/1467) — motivates the WeakMap mitigation in AC #6

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

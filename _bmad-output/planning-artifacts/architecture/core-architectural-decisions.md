# Core Architectural Decisions

## Decision Priority Analysis

**Critical decisions (block implementation):** D1 task ID strategy; D2 schema + migration approach; D3 API design; D4 error contract; D5 validation strategy; D6 rate-limiting policy.

**Important decisions (shape architecture):** D7 frontend data layer; D8 backend logging; D9 frontend error reporting; D10 quality-gate execution strategy; D11 container topology; D12 lockfile format.

**Deferred decisions (post-MVP):** centralized observability (OpenTelemetry, Sentry), CI/CD platform, multi-process logging (Pino), migration framework (Drizzle / Kysely), libsql / Turso sync, RFC 9457 problem-details envelope, the unified Vite+ toolchain.

## Already Decided by Prior Steps

- **Topology:** SPA + REST API, single-page client, no SSR/WS/SW/offline at MVP.
- **Languages & Runtime:** TypeScript everywhere; Bun 1.3.11 as runtime, package manager, test runner, and SQLite client. Container `oven/bun:1.3.11-alpine` (patch-pinned).
- **Frontend framework:** SolidJS 1.9.12 (no Solid Router, no SolidStart at MVP).
- **Backend framework:** Elysia 1.4.28 on `Bun.serve`.
- **Build tool:** Vite 8.0.10 (Rolldown bundler).
- **Styling:** UnoCSS 66.6.8 with `presetMini` and custom rules expressing the UX-spec design tokens.
- **Theme:** OS-driven via `prefers-color-scheme`, no user toggle.
- **State management (UI):** Solid signals + component-local stores per UX spec.
- **Authentication:** none at MVP.
- **FR10 delete safety:** immediate delete + 5s UndoSnackbar + Cmd/Ctrl+Z (UX spec).

## Data Architecture

**D1 — Task ID generation: client-side UUIDv7, hand-rolled generator, stored as `TEXT PRIMARY KEY`.**

Time-ordered prefix gives `ORDER BY id DESC` newest-first sort for free; idempotency on retry via `INSERT OR IGNORE` on PK. Hand-rolled generator (~30 LOC, `crypto.getRandomValues()` + `Date.now()`) — zero deps versus the `uuid` npm package's ~10 KB.

**D2 — SQLite schema and migrations: single `tasks` table; schema-on-boot plus hand-rolled migration runner; forward-only migrations.**

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY NOT NULL,
  text        TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 500),
  completed   INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  created_at  INTEGER NOT NULL,    -- unix ms
  updated_at  INTEGER NOT NULL     -- unix ms
);
```

PRAGMAs on connection open: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`. Numbered SQL migrations in `apps/api/src/storage/migrations/` applied in order at boot; tracked via a `schema_versions(version INTEGER PRIMARY KEY, applied_at INTEGER)` table. Up-migration tests are mandatory (apply against fresh in-memory DB, assert post-state, verify second run is a no-op). No down migrations — forward-only, recovery via filesystem backup of the SQLite file.

## API & Communication Patterns

**D3 — REST API:**

| Method | Path | Purpose | Status codes |
|---|---|---|---|
| `GET` | `/api/tasks` | List newest-first | 200 |
| `POST` | `/api/tasks` | Create with client UUIDv7 | 201, 200 (idempotent retry), 400, 409, 429 |
| `PATCH` | `/api/tasks/:id` | Toggle completion (target state, not action) | 200, 404, 400, 429 |
| `DELETE` | `/api/tasks/:id` | Delete (idempotent) | 204, 429 |
| `GET` | `/health` | Liveness/readiness, outside `/api` | 200, 503 |

JSON keys are camelCase; storage layer translates to snake_case columns at the boundary. `POST` with existing-id-and-matching-text returns 200; existing-id-with-different-text returns 409 (`id_conflict`). `DELETE` of a nonexistent ID returns 204 (idempotent). `PATCH` body is target state (`{ completed: boolean }`), not action — retries do not flip back.

**D4 — Error contract (FR30):** custom envelope across all error responses.

```ts
type ErrorResponse = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;        // server-generated UUIDv7
};

type ErrorCode =
  | "validation_error"     // 400
  | "not_found"            // 404
  | "id_conflict"          // 409
  | "payload_too_large"    // 413
  | "rate_limited"         // 429
  | "internal_error"       // 500
  | "service_unavailable"; // 503
```

`message` is dev-facing and goes to logs; the frontend maps `code` to user-facing copy via a single `errorMessages` map. Closed TypeScript enum gives compile-time exhaustiveness — adding a new error code is a deliberate change the compiler enforces. `requestId` is generated in middleware on every request, attached to all log lines, and echoed in error responses for log correlation.

A single Elysia `onError` handler maps `AppError` instances and Elysia's own `VALIDATION` errors to this envelope. Status codes are derived from the `code` via a closed map (no per-route status decisions).

**D5 — Validation:** schemas defined inline in `apps/api/src/routes/*.ts` using Elysia's `t` namespace (TypeBox bundled in Elysia — no separate `@sinclair/typebox` direct dep). Eden Treaty client on the frontend (`@elysiajs/eden`) consumes the `App` type via `import type`, so route bodies, params, response shapes, and error shapes all flow into the frontend automatically. Frontend pre-flight is `text.trim().length > 0` only — UX spec doesn't require structural pre-flight.

**D6 — Rate limiting:** token bucket per IP, **burst 20 / refill 2 tokens per second**, in-memory `Map<string, BucketState>`, 10-minute idle-bucket eviction. Implemented as Elysia middleware (~80 LOC, no external dep). 429 responses include `Retry-After` plus `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers. `/health` excluded; everything under `/api/*` rate-limited.

If horizontal scaling is ever required (Vision-phase, multi-user), the in-memory bucket becomes Redis-backed with the same algorithm.

## Frontend Architecture

**D7 — Server-state cache: `@tanstack/solid-query`.**

Eden Treaty handles the typed fetch; TanStack Query handles cache, optimistic-mutation lifecycle, retry-with-backoff, and invalidation. Configuration locks:

| Setting | Value | Why |
|---|---|---|
| `staleTime` (tasks query) | `Infinity` | List doesn't go stale via passage of time; only by mutations — which invalidate explicitly |
| `gcTime` (tasks query) | `Infinity` | Single query for the whole app; no need to GC |
| `refetchOnWindowFocus` | `false` | The list is the source of truth in this tab; multi-tab editing is out of scope at MVP |
| `refetchOnReconnect` | `true` | Converges with server when network returns |
| `retry` (queries) | `2` | Initial fetch; if it fails after 2 retries, show the FR6 error state |
| `retry` (mutations) | per-mutation, function form | 429 → up to 4 retries honouring `Retry-After`; 5xx → up to 3; other 4xx → fail-fast |
| `retryDelay` | `Math.min(1000 * 2 ** attempt + jitter, 30_000)` | Exponential with jitter, cap 30s; protects against thundering herd (NFR-R1) |

**Critical non-default usage:** `onError` does **NOT** roll back the optimistic update. Per UX spec (Journey 4), failed writes surface row-local sync-pending or retry-exhausted state — the optimistic row stays in place. We use TanStack Query's primitives but configure away its rollback default.

## Infrastructure & Deployment

**D8 — Backend logging: hand-rolled structured JSON to stdout.**

~30 LOC logger module + ~20 LOC Elysia request-logging middleware. Standard fields:

| Field | Type | Always present | Note |
|---|---|---|---|
| `level` | `"info" \| "warn" \| "error"` | yes | |
| `msg` | string | yes | Short human-readable summary |
| `ts` | number (unix ms) | yes | |
| `requestId` | string (UUIDv7) | per-request lines | Generated in middleware |
| `method` | string | per-request lines | |
| `path` | string | per-request lines | |
| `status` | number | per-request lines | |
| `durationMs` | number | per-request lines | |
| `ip` | string | per-request lines | First entry of `X-Forwarded-For`, falls back to `request.ip` |
| `errorCode` | string | error lines | The `ErrorCode` from D4 |
| `stack` | string | error lines (unhandled only) | |

No external dep. No `LOG_LEVEL` env var at MVP — all levels emitted to stdout. Pino is the migration target if multi-process aggregation or transport routing becomes a need.

**D9 — Frontend error reporting: console-only.**

Top-level Solid `<ErrorBoundary>` catches render errors and shows an inline FR6-style fallback ("Something went wrong. Refresh to try again."), preventing white-screen. Global `window.error` and `unhandledrejection` handlers log structured JSON to `console.error` with the same field shape as the backend logger, so a developer copy-pasting from devtools to a bug report gets parseable output. No `/api/errors` route, no SaaS, no OpenTelemetry. Migration to centralized observability is a Vision-phase concern.

**D10 — Quality gates: developer-invoked scripts only.** No git hooks, no CI.

Three escalating scripts in root `package.json`:

- **`bun run check`** (~5s) — oxlint format + lint, tsgo `--noEmit`, `scripts/check-dep-count.sh`. Run while iterating.
- **`bun run check:full`** (~30s) — adds `bun test` across workspaces, `bun audit` (NFR-S3), `bun run build`, `scripts/check-bundle-size.sh`. Run before declaring a meaningful change done.
- **`bun run check:release`** (~3min) — adds Playwright E2E (with embedded axe-core assertions, NFR-M2 + NFR-A2) and Lighthouse mobile + desktop against `vite preview` (NFR-P1, P2). Run before tagging a version.

Tooling:

- **oxlint + oxfmt** (Rust, vendor-aligned with Vite + Rolldown) for lint and format. Configured via `.oxlintrc` and `oxfmt` config files at the workspace root.
- **`@typescript/native-preview` (tsgo)** for type-checking — preview-grade but ~10× faster than tsc and covers our needs (no `--build`, no `--declaration` emit needed). Stable TS 6 is the migration fallback if tsgo blocks.
- **No Biome, no ESLint, no Prettier.**

Thresholds live in checked-in config files (`lighthouserc.json`, `scripts/check-*.sh`). The script bodies translate 1:1 to CI workflow steps if/when CI is introduced.

**D11 — Container topology: single service.**

Elysia on `Bun.serve` serves both API (`/api/*`, `/health`) and SPA static assets. Static-asset serving via Elysia's `staticPlugin` (or a catch-all `app.get("*", serveSpa)`) reads `apps/web/dist/`. SPA fallback: any path that doesn't match `/api/*` and isn't a real file in `dist/` returns `index.html` (no client-side routing at MVP, but the fallback is free insurance).

```yaml
# compose.yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    volumes:
      - tasks-data:/data
    environment:
      DATABASE_PATH: /data/tasks.db
volumes:
  tasks-data:
```

One container, one port, one volume mount. No CORS, no reverse proxy, single log stream via `docker compose logs` (FR33). Memory baseline ~80 MB.

Multi-stage `Dockerfile`: install deps → build SPA via Vite → copy `dist/` and `apps/api/src/` into runtime image based on `oven/bun:1.3.11-alpine` → run `bun apps/api/src/index.ts`.

Dev workflow runs Vite (port 5173) + `bun --watch apps/api/src/index.ts` (port 3000) with a Vite proxy for `/api/*` and `/health`.

**D12 — Lockfile: text `bun.lock` (Bun 1.2+ default).**

No `bunfig.toml` override needed for lockfile format. Bun's default behaviour gives us text format, which is reviewable in `git diff` for catching unexpected dependency drift (NFR-S3 CVE concern).

## Decision Impact Analysis

**Implementation sequence (story 1 covers):**

1. Workspace scaffold: root `package.json` with `workspaces: ["apps/*"]`, `tsconfig.base.json`, `bunfig.toml`.
2. `apps/api/`: minimal Elysia app exporting `App` type, `/health` route, the migration runner skeleton, the tasks repository skeleton, the error envelope module, the logger module.
3. `apps/web/`: minimal Solid app with the Eden Treaty client wired up, TanStack Query provider, the UnoCSS setup with token rules, `<ErrorBoundary>` at the root.
4. `Dockerfile` + `compose.yaml` (single service).
5. Root scripts: `dev`, `check`, `check:full`, `check:release`, `build`.
6. One `bun:test` ("hello world" repository test) and one Playwright test ("page loads with focused input") proving end-to-end toolchain wiring.

**Cross-component dependencies:**

- The task-ID UUIDv7 (D1) flows: frontend generates → POST body → `INSERT OR IGNORE` (D2) → returned in 200/201 response (D3) → cached by TanStack Query (D7).
- The error envelope (D4) is consumed by Elysia's `onError` (D5), surfaced through Eden Treaty's typed `error` discriminant (D7), mapped to user-facing copy on the frontend.
- The `requestId` (D4) is generated in logging middleware (D8), echoed in error responses (D4), and visible in `docker compose logs` (D11) for debugging.
- The token bucket (D6) lives in-memory in the single container (D11); horizontal scaling would require Redis (Vision-phase).
- The Eden Treaty `App` type (D5) flows via `import type` from `apps/api` to `apps/web` — barrel-pattern boundary discipline on `apps/api/src/index.ts` keeps the frontend's view of the backend stable.

## Updated Dependency Matrix

| Package | Direct deps | Direct devDeps |
|---|---|---|
| Root | — | `@typescript/native-preview`, `oxlint`, `oxfmt`, `playwright`, `@axe-core/playwright`, `@lhci/cli` |
| `apps/api` | `elysia` | `bun-types` |
| `apps/web` | `solid-js`, `@elysiajs/eden`, `@tanstack/solid-query` | `vite`, `vite-plugin-solid`, `unocss`, `@unocss/preset-mini`, `@unocss/vite`, `@solidjs/testing-library` |

Production deps comfortably under NFR-M5's ≤25-per-package cap (3 frontend, 1 backend).

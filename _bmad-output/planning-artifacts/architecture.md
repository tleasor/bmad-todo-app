---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
workflowType: 'architecture'
project_name: 'bmad-todo-app'
user_name: 'Tommy'
date: '2026-04-28'
lastStep: 8
status: 'complete'
completedAt: '2026-04-28'
---

# Architecture Decision Document - bmad-todo-app

**Author:** Tommy
**Date:** 2026-04-28

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 34 FRs across 8 categories — Task Capture & Listing (FR1–FR6), Task Completion (FR7–FR9), Task Deletion (FR10, resolved by UX as immediate-delete + 5s UndoSnackbar + Cmd/Ctrl+Z), Data Persistence (FR11–FR13), Keyboard Operation (FR14–FR19), Responsive & Accessible Presentation (FR20–FR22), Failure Handling & Recovery (FR23–FR27), API (FR28–FR31), Deployment & Operability (FR32–FR34).

The architecturally load-bearing FRs are:

- **FR23–FR27 + FR29** — optimistic UI with background retry plus idempotent writes. Forces client-generated task IDs and a row-local sync-state model spanning frontend data layer and API.
- **FR11–FR13** — durable persistence across reload, session, and container restart. Forces a real backing store, not in-memory state.
- **FR14–FR19** — full keyboard operability including focus-on-load and predictable focus landing. Forces explicit focus management primitives.
- **FR28–FR31** — REST CRUD plus health check plus consistent error contract. Defines the API surface.
- **FR32–FR34** — single `docker compose up`, log access via `docker compose logs`, restart-without-loss. Forces a deployable that boots clean from a fresh clone with no manual configuration.

**Non-Functional Requirements:** the NFRs that drive architectural decisions:

- **NFR-P1/P2/P3 (Performance):** ≤100ms interaction latency (95th pct), ≤1s TTI, Lighthouse mobile ≥90 / desktop ≥95, ≤100KB main JS chunk gzipped. Bundle and Lighthouse enforced per PR. This constrains framework choice and CSS approach materially.
- **NFR-A1/A2/A3 (Accessibility):** WCAG 2.1 AA with zero critical violations, axe-core in CI, screen-reader smoke on NVDA/VoiceOver before release.
- **NFR-S1–S5 (Security & Privacy):** XSS prevention at DOM render, input validation/sanitization at API boundary, dependency CVE audit, no PII/PHI, ≤500-char task / ≤10KB body / per-IP rate limit (policy TBD this phase).
- **NFR-R1–R5 (Reliability):** transient-failure tolerance, atomic single operations, structured JSON logging, health endpoint readiness ≤5s.
- **NFR-M1–M5 (Maintainability):** ≥70% meaningful coverage, ≥5 Playwright E2E tests, lint/type-check clean, ≤25 direct deps per package, README sufficient for a new developer to run + modify in 30 minutes.

**Scale & Complexity:**

- **Primary domain:** full-stack web — responsive SPA against a REST API.
- **Complexity level:** low — single-user, no auth, no multi-tenancy, no regulated-data concerns, no real-time sync. Architecturally simple; the difficulty is in execution discipline against tight performance and accessibility gates.
- **Architectural components anticipated:** ~2 packages (frontend SPA, backend API), possibly a small shared types module. Single deployable unit via `docker compose` — service split inside the compose file is a decision for this phase.

### Technical Constraints & Dependencies

Constraints inherited from the PRD and UX specification:

- **Topology fixed:** SPA + REST API; no SSR, no WebSockets, no service worker / PWA, no offline mode at MVP, no client-side routing required.
- **Deployment fixed:** `docker compose up` only; no managed cloud services; file-based storage acceptable (SQLite-class). No Postgres, no Redis at MVP.
- **Bundle budget:** ≤100KB gzipped main chunk forces a lean framework (PRD names Solid / Preact / Svelte / lean React as candidates) and a thin CSS strategy.
- **Dependency cap:** ≤25 direct deps per package — frontend and backend counted separately. Any framework that brings a heavy default dependency tail is disqualified.
- **Custom design system, token-driven** — no third-party component kit permitted for the visual layer. A single narrow headless a11y primitive may be imported for UndoSnackbar if that path is selected.
- **Idempotency contract:** writes must be safe to retry; client-generated task IDs are the implied mechanism.
- **Consistent error contract** across all API endpoints (FR30); the shape and error codes are an architecture-phase decision.

### Cross-Cutting Concerns Identified

- **Optimistic-mutation + retry contract** spans frontend data layer and API. Affects: data-fetching library choice, ID generation strategy, API request/response shape, error contract.
- **Error contract consistency** (FR30): every endpoint emits the same shape. Centralized error-mapping module on each side.
- **Structured JSON logging** (NFR-R4): consistent log schema across frontend (where applicable, e.g. unhandled errors reported to backend or console) and backend, at info / warn / error levels.
- **ARIA live-region strategy:** a single global LiveRegion announces state transitions; component-level events feed into it. Cross-cuts every mutation path.
- **Quality gates as architecture:** bundle-size check, Lighthouse mobile, axe-core, dep-count, coverage, Playwright. These are first-class workflow obligations, not afterthoughts.
- **Atomic single-operation persistence** (NFR-R3): no half-written state. Affects storage-engine and write-path choice.
- **Input safety at boundaries** (NFR-S1, S2, S5): XSS prevention at DOM render, validation/sanitization + size limits at API ingress, per-IP rate-limit policy.
- **Theme via `prefers-color-scheme`:** OS-driven; no user toggle at MVP. Affects token wiring in CSS.
- **Reduced-motion compliance:** every animation collapses to instant under `prefers-reduced-motion: reduce`. Cross-cuts component CSS.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web — SolidJS SPA frontend + Bun-runtime REST API backend on Elysia, single Compose deployable, two-package monorepo via Bun workspaces.

### Starter Options Considered

The PRD's bundle ceiling (≤100 KB main JS gzipped), dependency cap (≤25 direct deps per package), and "no third-party UI kit" constraint disqualify most off-the-shelf full-stack scaffolds:

- **Next.js / Nuxt / RedwoodJS / T3 / Blitz** — SSR runtimes, opinionated routing, default dependency tails that exceed our cap; the SSR machinery solves problems we don't have (single-view SPA, no auth, no edge deploy).
- **SolidStart** — meta-framework with file-routing and server functions. Useful for SSR/hybrid apps; we ship a client-only SPA, so SolidStart imposes complexity without delivering any feature we need. Its Vite 8 support is also still in flight (issue #2075 open as of Feb 2026).
- **`npm create solid` template (ts-vite)** — the official client-only Solid + Vite template. Tiny (~5 files). The structure is clean enough to reproduce by hand.
- **`create-elysia` template** — minimal Elysia + Bun starter. Trivial to hand-roll.

### Selected Approach: Hand-Rolled Monorepo Scaffold

No third-party scaffolding tool is used. The structure is hand-authored, referencing the official Solid + Vite and Elysia + Bun templates as a layout reference. Justification:

- **Dependency hygiene:** every dependency is added intentionally and traces to a concrete requirement.
- **Bun is the only required tooling.** Runtime, package manager, test runner, and SQLite client are all `bun`. No separate `pnpm`, `vitest`, or `better-sqlite3` install.
- **The total scaffold is ~15 files**, comparable to what any official starter generates. Owning it directly costs less than retrofitting a scaffolder's defaults.
- **Aligns with PRD scope doctrine** ("polish over breadth, always") at the tooling layer.

### Initialization Sequence

The first implementation story will execute, in order:

```bash
# Initialize the workspace
mkdir bmad-todo-app && cd bmad-todo-app
bun init -y                          # root package.json
# Manually configure workspaces in root package.json: ["apps/*"]

# Workspace packages
mkdir -p apps/web apps/api
( cd apps/web && bun init -y )       # SolidJS SPA
( cd apps/api && bun init -y )       # Elysia on Bun.serve

# Frontend deps (apps/web)
bun add solid-js@1.9.12 \
        @elysiajs/eden \
        @tanstack/solid-query
bun add -d vite@8.0.10 vite-plugin-solid \
            unocss@66.6.8 @unocss/preset-mini @unocss/vite \
            @solidjs/testing-library

# Backend deps (apps/api)
bun add elysia
# bun:sqlite is built-in — no install
# bun:test is built-in — no install
# TypeBox is bundled inside Elysia — no separate install

# Repo-level dev tooling (root)
bun add -d -E @typescript/native-preview \
              oxlint oxfmt \
              playwright @axe-core/playwright \
              @lhci/cli

# Build and run via `docker compose up` at the repo root
```

Specific patch versions for `vite-plugin-solid`, `@unocss/preset-mini`, `@unocss/vite`, `elysia`, `@elysiajs/eden`, `@tanstack/solid-query`, `oxlint`, `oxfmt`, and `@typescript/native-preview` are pinned at initialization time against their then-current `latest` tag, recorded in `package.json` as exact versions (no `^` for runtime-affecting deps).

### Architectural Decisions Provided by the Scaffold

**Language & Runtime:**

- **TypeScript everywhere**, executed by Bun directly — no separate transpile step in dev.
- **Bun 1.3.11** as runtime, package manager, test runner, and SQLite client. Container base: `oven/bun:1.3.11-alpine` (patch-pinned).
- Frontend TS targets browser; backend TS targets Bun (DOM types excluded in `apps/api/tsconfig.json`).
- TS configs use a shared `tsconfig.base.json` at the workspace root with `target: esnext`, `module: preserve`, `strict: true`, `noEmit: true`, `skipLibCheck: true`, `erasableSyntaxOnly: true`. Per-package overrides only where needed: backend sets `lib: ["esnext"]` and `types: ["bun-types"]`; frontend sets `jsx: "preserve"` and `jsxImportSource: "solid-js"`. No project references at MVP — barrel-pattern boundary discipline (`apps/api/src/index.ts` is the public surface).
- Type-checking via `@typescript/native-preview` (tsgo). Stable TS 6 is the migration fallback if tsgo blocks.

**Repo Layout:**

```
bmad-todo-app/
├── package.json                  # workspaces: ["apps/*"]; root scripts
├── bunfig.toml                   # Bun-level config (lockfile, install)
├── tsconfig.base.json            # shared TS compiler options
├── bun.lock                      # text-format lockfile (Bun 1.2+ default)
├── compose.yaml
├── Dockerfile                    # multi-stage: install → build SPA → runtime
├── playwright.config.ts          # E2E suite at repo root
├── lighthouserc.json             # Lighthouse thresholds
├── scripts/
│   ├── check-bundle-size.sh
│   └── check-dep-count.sh
├── apps/
│   ├── web/                      # SolidJS SPA
│   │   ├── package.json
│   │   ├── vite.config.ts        # vite-plugin-solid + @unocss/vite
│   │   ├── uno.config.ts         # design tokens → UnoCSS rules
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── index.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/       # TaskInput, TaskList, TaskRow, etc.
│   │   │   ├── data/             # Eden client + TanStack Query setup
│   │   │   └── styles/           # token CSS variables
│   │   └── tests/                # bun:test + Playwright fixtures
│   └── api/                      # Elysia on Bun.serve backend
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts          # bootstraps Elysia, exports App type for Eden
│       │   ├── routes/           # tasks.ts, health.ts (schemas inline via t)
│       │   ├── storage/          # bun:sqlite repository + migrations/
│       │   ├── middleware/       # rate-limit, request-logger
│       │   └── errors/           # AppError + ErrorCode + envelope helpers
│       └── tests/                # bun:test integration tests
└── e2e/                          # Playwright specs
```

**Styling Solution:**

UnoCSS via `@unocss/vite`, configured with `presetMini` plus custom rules expressing the UX-spec design tokens (color, typography, spacing, radii, motion). Tokens additionally exposed as CSS custom properties on `:root` and `[data-theme]` for non-utility consumption. Theme via `prefers-color-scheme`; no toggle.

**Build Tooling:**

- **Vite 8** with Rolldown bundler for the frontend (production builds 10–30× faster than Vite 7).
- **Bun build** for the backend (or run TS directly in dev; container image installs deps and runs `bun apps/api/src/index.ts`).
- Bundle-size check (`scripts/check-bundle-size.sh`) compares `apps/web/dist/assets/*.js` gzipped against the ≤100 KB threshold.

**Testing Framework:**

- **`bun:test`** for unit + integration tests on backend (zero deps, Jest-compatible API).
- **`bun:test`** for unit tests on frontend; Solid components rendered via `@solidjs/testing-library` (one frontend test dep).
- **Playwright** for E2E suite (≥5 tests per NFR-M2), at the repo root in `e2e/`.
- **axe-core** invoked from Playwright tests for accessibility violation gating (NFR-A2).

**Code Organization:**

- Monorepo via **Bun workspaces** (`workspaces: ["apps/*"]` in root `package.json`). No Turborepo, no Nx — too small.
- **No `packages/contracts` shared module.** Eden Treaty (`@elysiajs/eden`) consumes the backend's `App` type via `import type { App } from "@bmad-todo-app/api"`, giving compile-time guarantees that frontend and backend agree on request/response shapes and the FR30 error contract. The barrel pattern in `apps/api/src/index.ts` defines the public surface.
- API client in `apps/web/src/data` is a thin `treaty<App>(...)` wrapper plus TanStack Query hooks — no hand-rolled fetch wrapper.

**Development Experience:**

- `bun run dev` at the repo root starts both apps concurrently (Vite on 5173 with proxy to `/api/*`, `bun --watch apps/api/src/index.ts` on 3000).
- Hot reload: Vite for frontend; `bun --watch` for backend.
- Single TypeScript language server across both packages — go-to-definition crosses package boundaries cleanly.
- Bun's text lockfile (`bun.lock`) committed for reproducible installs.

**Quality gates (no CI, no git hooks):**

Three developer-invoked scripts in root `package.json`:

- `bun run check` — fast (~5s): oxlint format + lint, tsgo `--noEmit`, dep-count check.
- `bun run check:full` — medium (~30s): adds `bun test`, `bun audit` (NFR-S3), `bun run build`, bundle-size check.
- `bun run check:release` — slow (~3min): adds Playwright E2E (with axe-core assertions), Lighthouse mobile + desktop against `vite preview`.

Thresholds live in checked-in config (`lighthouserc.json`, `scripts/check-*.sh`); script bodies translate 1:1 to CI workflow steps if/when CI is introduced.

**Note:** Project initialization using this approach will be the first implementation story. The story owns: workspace config, all three `tsconfig` files, `vite.config.ts`, `uno.config.ts`, `compose.yaml`, `Dockerfile`, the empty `routes/`, `components/`, and `migrations/` folders, the `scripts/` checks, and a "hello world" `bun:test` and Playwright test that proves the toolchain is wired end-to-end.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical decisions (block implementation):** D1 task ID strategy; D2 schema + migration approach; D3 API design; D4 error contract; D5 validation strategy; D6 rate-limiting policy.

**Important decisions (shape architecture):** D7 frontend data layer; D8 backend logging; D9 frontend error reporting; D10 quality-gate execution strategy; D11 container topology; D12 lockfile format.

**Deferred decisions (post-MVP):** centralized observability (OpenTelemetry, Sentry), CI/CD platform, multi-process logging (Pino), migration framework (Drizzle / Kysely), libsql / Turso sync, RFC 9457 problem-details envelope, the unified Vite+ toolchain.

### Already Decided by Prior Steps

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

### Data Architecture

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

### API & Communication Patterns

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

### Frontend Architecture

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

### Infrastructure & Deployment

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

### Decision Impact Analysis

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

### Updated Dependency Matrix

| Package | Direct deps | Direct devDeps |
|---|---|---|
| Root | — | `@typescript/native-preview`, `oxlint`, `oxfmt`, `playwright`, `@axe-core/playwright`, `@lhci/cli` |
| `apps/api` | `elysia` | `bun-types` |
| `apps/web` | `solid-js`, `@elysiajs/eden`, `@tanstack/solid-query` | `vite`, `vite-plugin-solid`, `unocss`, `@unocss/preset-mini`, `@unocss/vite`, `@solidjs/testing-library` |

Production deps comfortably under NFR-M5's ≤25-per-package cap (3 frontend, 1 backend).

## Implementation Patterns & Consistency Rules

These rules prevent contributors (human or AI agent) from making divergent choices on cross-cutting concerns. Most are forced by step 4's decisions; this section makes them explicit and adds the gaps step 4 didn't cover.

### Naming Conventions

**TypeScript identifiers:**

| Construct | Convention | Example |
|---|---|---|
| Functions, methods, variables | camelCase | `createTask`, `taskList` |
| Type aliases, interfaces, classes | PascalCase | `Task`, `ErrorCode`, `AppError` |
| Module-level immutable config | UPPER_SNAKE_CASE | `MAX_TASK_LENGTH`, `UNDO_WINDOW_MS` |
| String-literal union members | snake_case | `"validation_error"`, `"rate_limited"` |
| `as const` objects (enum stand-ins) | object PascalCase, keys PascalCase, string values | `const Severity = { Info: "info", Warn: "warn" } as const` |
| TanStack Query keys | hierarchical array, first element matches resource | `["tasks"]`, `["tasks", id]` |

Numeric separators encouraged for clarity (`5_000`, `100_000`).

**Files and directories:**

| Surface | Convention | Example |
|---|---|---|
| Solid components | PascalCase | `TaskRow.tsx`, `UndoSnackbar.tsx` |
| TS modules (utilities, hooks, services, repos) | camelCase | `taskRepo.ts`, `useTasks.ts` |
| Test files | sibling `.test.ts(x)` | `taskRepo.test.ts`, `TaskRow.test.tsx` |
| Config files | kebab-case (ecosystem norms) | `vite.config.ts`, `lighthouserc.json`, `bunfig.toml` |
| Constants per package | `constants.ts` at package src root | `apps/api/src/constants.ts` |
| Env validation per package | `env.ts` at package src root | `apps/api/src/env.ts` |

**Database (already locked in D2, repeated for completeness):** snake_case for tables and columns. JSON keys camelCase. Storage layer translates at the boundary.

**API (already locked in D3):** plural resource paths (`/api/tasks`), path params as `:id`, JSON keys camelCase.

### Structure Conventions

**Component organization:** by-type, single flat directory at MVP.

```
apps/web/src/components/
  TaskInput.tsx          TaskList.tsx          TaskRow.tsx
  EmptyState.tsx         LoadingState.tsx      SkeletonRow.tsx
  LiveRegion.tsx         UndoSnackbar.tsx      ErrorBoundary.tsx
```

Sub-components used only by one parent are co-located in the parent's file (e.g. `TaskRow`'s internal `Checkbox`, `DeleteButton`, `SyncIndicator`). Re-evaluate by-type vs by-feature if `components/` grows past ~15 files.

**Test colocation:** `*.test.ts(x)` files sit next to the source under test. Playwright specs live in `e2e/` at repo root. No `__tests__/` directories.

**Per-package src layout (backend):**

```
apps/api/src/
  index.ts              # Elysia app, exports App type for Eden, mounts routes
  constants.ts          # Module-level config (port, DB path default, limits)
  env.ts                # Environment validation; the only consumer of Bun.env
  log.ts                # Structured JSON logger
  errors/
    AppError.ts         # AppError class
    codes.ts            # ErrorCode enum, status mapping
    envelope.ts         # errorEnvelope() helper
  routes/
    tasks.ts            # Elysia route group, schemas inline via `t`
    health.ts
  middleware/
    rateLimit.ts        # Token-bucket implementation
    requestLogger.ts    # Per-request logger; assigns requestId
  storage/
    db.ts               # Bun:sqlite Database singleton, PRAGMA setup
    tasks.ts            # taskRepo: list, get, create, update, delete
    migrations/
      001_create_tasks.up.sql
      runner.ts         # Hand-rolled migration runner
```

**Per-package src layout (frontend):**

```
apps/web/src/
  index.tsx             # Solid mount + QueryClient + ErrorBoundary
  App.tsx               # Top-level component
  constants.ts
  env.ts
  components/           # See above
  data/
    api.ts              # Eden client; treaty<App>(...)
    queries.ts          # TanStack Query hooks (useTasks, useCreateTask, ...)
    keys.ts             # Query-key constants
    uuid.ts             # UUIDv7 generator
  styles/
    tokens.css          # CSS custom properties from UnoCSS tokens
    reset.css
```

### Module Conventions

- **Named exports only.** No `export default`. Exception: framework-mandated defaults (Vite config; Solid component for the App root if HMR requires it).
- **Type-only imports use `import type`** to ensure type-stripping erases them.
- **Import ordering** (oxlint enforces): external deps → internal package imports → relative imports. Alphabetized within each group.

### Code Style Conventions

**Async pattern:**

- `async/await` only. No `.then()` chains. No callbacks.
- Backend handlers throw `AppError`; the global `onError` middleware envelopes. Handlers do not return error envelopes manually.
- Frontend hooks let TanStack Query observe failures; `mutationFn` / `queryFn` may throw, the discriminated `error` field surfaces them. Don't try/catch inside TanStack hooks.

**Solid-specific rules:**

- Primitive signals: destructured tuple. `const [count, setCount] = createSignal(0)`. No `Signal` / `Sig` suffix on names.
- Object state: `createStore`. Same destructured-tuple shape.
- Derived values: `createMemo` when re-computation cost matters; bare function otherwise.
- Effects: `createEffect`. Use `onMount` only when the effect must run exactly once at mount.
- **Never destructure component props** — breaks reactivity. Always access as `props.foo`.
- JSX components are PascalCase; lowercase tags reserved for HTML elements.

**TanStack Solid Query rules:**

- Query keys are hierarchical arrays; first element matches the resource path segment.
- One `queryFn` per query key, defined alongside the hook.
- Optimistic mutations always set `onMutate`, `onError`, `onSettled`. `onError` does **not roll back** the cache (UX contract — row-local sync state surfaces instead).
- No `useSuspenseQuery` at MVP.

**Eden Treaty rules:**

- Chained access only, not route-string style.
- Single Eden client instance at module scope (`apps/web/src/data/api.ts`).
- All API calls go through Eden; no raw `fetch` in app code.

**Backend handler discipline:**

- Repository pattern for storage. Routes call `taskRepo.x()`; no inline SQL in handlers.
- Single Elysia app in `apps/api/src/index.ts`; routes mounted via `app.use(...)`. No nested apps.

### Cross-Cutting Conventions

**Logging:**

- Backend: `logger.info/warn/error` in production code. Never `console.log` outside scratch. Per-request middleware emits the per-request line; in-handler log calls explicitly pass `{ requestId }` from the request context.
- Frontend: `console.error` only in the global error handlers (see D9). No `console.log` in production code.

**Constants:**

- No magic numbers. `setTimeout(fn, 5_000)` is wrong; `setTimeout(fn, UNDO_WINDOW_MS)` is right.
- Module-level constants live in the package's `constants.ts`.

**Environment variables:**

- Backend: read via `Bun.env` only inside `apps/api/src/env.ts`, validated on import, re-exported as typed values.
- Frontend: read `import.meta.env` only inside `apps/web/src/env.ts` (the `VITE_` prefix is required for Vite to expose the variable).
- App code never touches `Bun.env` or `import.meta.env` directly.

**Comments:**

- Default to no comments. Add a comment only when the WHY is non-obvious — a workaround, a counter-intuitive constraint, a load-bearing invariant.
- Never add a comment that describes WHAT the code does. That's the code's job.
- No JSDoc on internal functions. Public types are self-documenting via TS; if they need explanation, the type name is wrong.

**Test structure:**

- `bun:test` idiom: `describe(...)` blocks contain `it(...)` (not `test(...)`).
- One top-level `describe` per module/component. Nested `describe` only when sub-behaviors share setup.
- Test names describe behavior, not implementation: `it("returns the task with the given id")`, not `it("getById works correctly")`.
- No mocking of `bun:sqlite`. Tests use `new Database(":memory:")` plus the migration runner. Real query path, real schema, fast.
- No mocking of HTTP. Backend integration tests hit Elysia via its in-process `.handle()` method (no network round-trip needed).

### Anti-Patterns (forbidden)

- TS enums (any kind) — `erasableSyntaxOnly` blocks them
- Default exports outside framework-mandated cases
- Destructuring Solid component props
- Raw `fetch` in app code (use Eden)
- Inline SQL in route handlers (use `taskRepo`)
- `any` (use `unknown` and narrow)
- Non-null assertions (`!`) outside test files
- Unhandled promise rejections — every `await` is observed (try/catch, `.catch()`, or inside a TanStack hook)
- `console.log` in production code (use `logger` on backend; the global handler on frontend)
- Magic numbers (use named constants)
- `// @ts-ignore` (use `// @ts-expect-error <reason>` only when truly unavoidable)
- Implicit return types on exported functions (require explicit return type — oxlint enforces)
- Backend log lines without `requestId` when inside a request context

### Enforcement

These patterns are enforced through three mechanisms:

1. **Compile-time:** TypeScript's strict mode + `erasableSyntaxOnly` block enums, untyped any, and several other issues directly.
2. **Lint-time:** oxlint catches `console.log`, missing return types, import ordering, default exports, non-null assertions. oxfmt enforces formatting.
3. **Convention:** the rest (no inline SQL, no raw fetch, naming, test structure) is reviewed at code-review time. The patterns in this section are the review checklist.

When a pattern conflicts with a real implementation need, the resolution is to update this section explicitly — not to silently violate it.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
bmad-todo-app/
├── README.md                        # Clone-and-run instructions, ≤30 min path
├── package.json                     # workspaces: ["apps/*"]; root scripts
├── bun.lock                         # text-format lockfile
├── bunfig.toml                      # Bun-level config
├── tsconfig.base.json               # shared TS compiler options
├── .oxlintrc.json                   # oxlint config
├── oxfmt.toml                       # oxfmt config
├── lighthouserc.json                # Lighthouse thresholds (mobile≥90, desktop≥95)
├── playwright.config.ts             # E2E config
├── compose.yaml                     # single-service Compose
├── Dockerfile                       # multi-stage: install → build SPA → runtime
├── .env.example                     # documented env vars (no secrets)
├── .gitignore                       # bun.lock kept; node_modules, dist, *.db ignored
├── scripts/
│   ├── check-bundle-size.sh
│   └── check-dep-count.sh
├── e2e/                             # Playwright specs
│   ├── capture.spec.ts              # FR1, FR18, FR23 — Journey 1
│   ├── manage.spec.ts               # FR7, FR8, FR10 — Journey 2
│   ├── keyboard.spec.ts             # FR14–FR19 — Journey 3
│   ├── error-recovery.spec.ts       # FR23–FR27 — Journey 4
│   └── empty-error-states.spec.ts   # FR4, FR5, FR6
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json            # extends base; jsx + jsxImportSource
│   │   ├── vite.config.ts           # vite-plugin-solid + @unocss/vite
│   │   ├── uno.config.ts            # design tokens → UnoCSS rules
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── favicon-16.png
│   │   │   ├── favicon-32.png
│   │   │   ├── apple-touch-icon.png
│   │   │   └── robots.txt
│   │   └── src/
│   │       ├── index.tsx
│   │       ├── App.tsx
│   │       ├── constants.ts
│   │       ├── env.ts
│   │       ├── components/
│   │       │   ├── TaskInput.tsx               + .test.tsx
│   │       │   ├── TaskList.tsx                + .test.tsx
│   │       │   ├── TaskRow.tsx                 + .test.tsx
│   │       │   ├── EmptyState.tsx
│   │       │   ├── LoadingState.tsx            (SkeletonRow co-located)
│   │       │   ├── LiveRegion.tsx
│   │       │   ├── UndoSnackbar.tsx            + .test.tsx
│   │       │   └── ErrorBoundary.tsx
│   │       ├── data/
│   │       │   ├── api.ts                      # treaty<App>(...)
│   │       │   ├── queries.ts                  + .test.ts
│   │       │   ├── keys.ts
│   │       │   └── uuid.ts                     + .test.ts
│   │       └── styles/
│   │           ├── tokens.css
│   │           └── reset.css
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                        # Elysia app, exports App type
│           ├── constants.ts
│           ├── env.ts
│           ├── log.ts                          + .test.ts
│           ├── errors/
│           │   ├── AppError.ts
│           │   ├── codes.ts
│           │   └── envelope.ts
│           ├── routes/
│           │   ├── tasks.ts                    + .test.ts (via app.handle)
│           │   └── health.ts                   + .test.ts
│           ├── middleware/
│           │   ├── rateLimit.ts                + .test.ts
│           │   └── requestLogger.ts            + .test.ts
│           └── storage/
│               ├── db.ts
│               ├── tasks.ts                    + .test.ts (via :memory: DB)
│               └── migrations/
│                   ├── runner.ts               + .test.ts
│                   └── 001_create_tasks.up.sql
```

### Architectural Boundaries

**API boundary (frontend ↔ backend):** the Elysia `App` type exported from `apps/api/src/index.ts` is the authoritative contract. Frontend imports it via `import type` only — no runtime backend code crosses the boundary.

- Inbound: HTTP → `requestLogger` → `rateLimit` → route schema validation → handler
- Outbound: Elysia response serialization; errors enveloped by global `onError`
- Frontend consumes via Eden Treaty's `{ data, error }` discriminant, fed to TanStack Query hooks in `apps/web/src/data/queries.ts`

**Component boundary (UI ↔ data layer):** Solid components consume data through TanStack Query hooks only. Components never import the Eden `api` client directly. Hooks are the only consumers of `api`.

**Storage boundary (handlers ↔ database):** route handlers consume `taskRepo` from `apps/api/src/storage/tasks.ts`. No inline SQL in handlers. The repo encapsulates Database access, snake_case ↔ camelCase translation, `INSERT OR IGNORE` idempotency, and atomic single-statement operations.

**Configuration boundary (env ↔ app code):** `Bun.env` read only inside `apps/api/src/env.ts`; `import.meta.env` read only inside `apps/web/src/env.ts`. Both validate on import and re-export typed values.

### Requirements-to-Structure Mapping

**FR1–FR6 — Task Capture & Listing**

| Concern | Location |
|---|---|
| Server route | `apps/api/src/routes/tasks.ts` (`GET`, `POST /api/tasks`) |
| Schema (FR1 ≤500 char) | inline via Elysia `t.String({ maxLength: 500 })` |
| Storage | `taskRepo.list`, `taskRepo.create` |
| Idempotency (FR29) | `INSERT OR IGNORE` in `taskRepo.create` |
| Frontend query | `apps/web/src/data/queries.ts` (`useTasks`, `useCreateTask`) |
| UUIDv7 generation | `apps/web/src/data/uuid.ts` |
| UI capture (FR1, FR18) | `apps/web/src/components/TaskInput.tsx` |
| UI list (FR2, FR3) | `TaskList.tsx`, `TaskRow.tsx` |
| Empty/loading/error states (FR4–FR6) | `EmptyState.tsx`, `LoadingState.tsx`, inline list-level error in `TaskList.tsx` |

**FR7–FR9 — Task Completion**

| Concern | Location |
|---|---|
| Server route | `routes/tasks.ts` (`PATCH /api/tasks/:id`) |
| Storage | `taskRepo.update(id, { completed })` |
| Frontend mutation | `useToggleTask` in `data/queries.ts` |
| UI affordance | `TaskRow.tsx` (Checkbox sub-component, Space key handler) |

**FR10 — Task Deletion (immediate + UndoSnackbar + Cmd/Ctrl+Z)**

| Concern | Location |
|---|---|
| Server route | `routes/tasks.ts` (`DELETE /api/tasks/:id`) |
| Storage delete / restore | `taskRepo.delete`, `taskRepo.create` (re-using original record) |
| Frontend mutation | `useDeleteTask`, `useUndoDelete` |
| UI affordance | `TaskRow.tsx` DeleteButton; `UndoSnackbar.tsx`; Cmd/Ctrl+Z handler in `App.tsx` |
| Live region announcement | `LiveRegion.tsx` triggered by mutation lifecycle |

**FR11–FR13 — Data Persistence**

| Concern | Location |
|---|---|
| SQLite Database | `apps/api/src/storage/db.ts` (singleton, WAL, NORMAL sync) |
| Schema | `migrations/001_create_tasks.up.sql` |
| Migration runner | `migrations/runner.ts` |
| Volume mount | `compose.yaml` (`tasks-data` volume → `/data`) |
| Atomic ops (NFR-R3) | single-statement queries in `taskRepo.*` |

**FR14–FR19 — Keyboard Operation**

| Concern | Location |
|---|---|
| Auto-focus on load (FR18) | `TaskInput.tsx` (`autofocus` + `ref` on mount) |
| Add (FR14) | `TaskInput.tsx` Enter handler |
| Toggle (FR15) | `TaskRow.tsx` Space handler when row focused |
| Delete (FR16) | `TaskRow.tsx` Delete/Backspace handler when row focused |
| Focus traversal (FR17) | `TaskRow.tsx` arrow keys; focus-landing rule on delete |
| Visible focus (FR19) | UnoCSS focus-ring utility from tokens in `uno.config.ts` |

**FR20–FR22 — Responsive & Accessible Presentation**

| Concern | Location |
|---|---|
| Breakpoints (FR20) | `uno.config.ts` mediaQueries; tokens in `styles/tokens.css` |
| Screen reader (FR21) | ARIA on every component per UX spec |
| Live region (FR22) | `LiveRegion.tsx` consumed by mutation hooks |

**FR23–FR27 — Failure Handling & Recovery**

| Concern | Location |
|---|---|
| Optimistic mutation (FR23) | `data/queries.ts` (`onMutate`) |
| Background retry (FR24) | TanStack Query `retry` config per mutation |
| Sync-pending indicator (FR25) | `TaskRow.tsx` SyncIndicator sub-component |
| Retry-exhausted state (FR26) | `TaskRow.tsx` ErrorMessage + RetryAction sub-components |
| No silent loss (FR27) | mutation `onError` keeps optimistic row, surfaces row-local state |

**FR28–FR31 — API**

| Concern | Location |
|---|---|
| CRUD endpoints (FR28) | `apps/api/src/routes/tasks.ts` |
| Idempotency (FR29) | `INSERT OR IGNORE`; idempotent DELETE (204 even when missing); PATCH target-state |
| Error contract (FR30) | `apps/api/src/errors/{AppError,codes,envelope}.ts` + global `onError` |
| Health check (FR31) | `apps/api/src/routes/health.ts` |

**FR32–FR34 — Deployment & Operability**

| Concern | Location |
|---|---|
| `docker compose up` (FR32) | `compose.yaml`, `Dockerfile` at repo root |
| Logs (FR33) | `log.ts`, `requestLogger.ts` → stdout → `docker compose logs` |
| Restart-without-loss (FR34) | volume mount + atomic SQL ops |

### Cross-Cutting NFR Locations

| NFR | Where it's enforced |
|---|---|
| NFR-P1, P2 (perf) | `scripts/check-bundle-size.sh`, `lighthouserc.json` |
| NFR-A1, A2 (a11y) | `e2e/*.spec.ts` axe-core assertions; tokens in `uno.config.ts` |
| NFR-S1 (XSS) | SolidJS auto-escaping; never `innerHTML` (lint-enforced) |
| NFR-S2 (validation) | Elysia route schemas in `apps/api/src/routes/*.ts` |
| NFR-S3 (CVE audit) | `bun audit` in `bun run check:full` |
| NFR-S4 (no PII) | no analytics, no telemetry, no off-box logging |
| NFR-S5 (input limits) | route-schema `maxLength`, body-size middleware, rate limit middleware |
| NFR-R1 (transient failures) | TanStack Query retry config |
| NFR-R2 (backend restart) | volume + WAL + atomic ops |
| NFR-R3 (atomic ops) | single-statement queries in `taskRepo.*` |
| NFR-R4 (structured logs) | `apps/api/src/log.ts` |
| NFR-R5 (health readiness) | `routes/health.ts` returns 503 until migrations applied |
| NFR-M1 (coverage) | `bun test --coverage` in `bun run check:full` |
| NFR-M2 (5 E2E tests) | `e2e/*.spec.ts` (5 specs listed above) |
| NFR-M3 (lint + type clean) | `oxlint` + `tsgo --noEmit` in `bun run check` |
| NFR-M4 (clone-and-run ≤30 min) | `README.md` + `bun install && bun run dev` |
| NFR-M5 (≤25 deps per package) | `scripts/check-dep-count.sh` |

### Integration Points

**Internal request flow (typical mutation — task creation):**

```
TaskInput.tsx (Enter)
  ↓
  useCreateTask().mutate({ id, text })          [data/queries.ts]
  ↓ onMutate
  queryClient.setQueryData(["tasks"], optimistic-prepend)
  ↓ mutationFn
  api.api.tasks.post({ id, text })              [data/api.ts]
  ↓ HTTP POST /api/tasks
  middleware/requestLogger    (assigns requestId, logs in)
  ↓
  middleware/rateLimit        (token bucket per IP)
  ↓
  Elysia route schema validation (t.Object)
  ↓
  routes/tasks.ts handler
  ↓
  taskRepo.create({ id, text })                 [storage/tasks.ts]
  ↓ INSERT OR IGNORE
  bun:sqlite                                    [storage/db.ts]
  ↓ row returned
  Task object ↑
  ↓ JSON response (201 or 200)
  middleware/requestLogger    (logs out)
  ↓
  Eden Treaty parses { data, error }
  ↓ (success path: no further UI signal)
  TanStack Query invalidates ["tasks"], refetch (no-op since optimistic matches)
```

**External integrations:** none at MVP (NFR-S4 — no analytics, no telemetry).

**Data flow summary:**

- **Reads:** Solid component → TanStack Query hook → Eden client → backend route → `taskRepo.list` → SQLite → response → cache → component re-renders.
- **Writes:** Solid component → mutation hook → optimistic cache update → Eden client → backend → `taskRepo` → SQLite → response → cache reconciliation. Failures surface as row-local sync state, never roll back the optimistic update.
- **No global state.** Solid signals + component-local state + TanStack Query cache cover all mutable state.

### File Organization Patterns (already locked, repeated for findability)

- **Tests:** colocated `*.test.ts(x)` next to source; Playwright in `e2e/` at root.
- **Components:** one per file (PascalCase); sub-components co-located only when used exclusively by one parent.
- **Modules:** one per file (camelCase) for utilities, hooks, services, repos.
- **Constants:** per-package `constants.ts` at the package src root.
- **Env access:** per-package `env.ts` is the only consumer of `Bun.env` / `import.meta.env`.
- **Styles:** UnoCSS handles utilities. Global tokens + reset live in `apps/web/src/styles/`. No per-component CSS files.

### Development Workflow Integration

**Dev server:** `bun run dev` at repo root starts both apps:

- Vite dev server on `:5173` (HMR, Solid reactivity, UnoCSS on-demand) with proxy: `/api/*` and `/health` → `http://localhost:3000`
- `bun --watch apps/api/src/index.ts` on `:3000`

**Build:**

- Frontend: `cd apps/web && vite build` → `apps/web/dist/{index.html, assets/*}`
- Backend: no build step; production container runs `bun apps/api/src/index.ts` directly

**Production container:**

- Multi-stage `Dockerfile`:
  1. `oven/bun:1.3.11-alpine` install stage: `bun install --frozen-lockfile`
  2. Build stage: `cd apps/web && vite build`
  3. Runtime stage: copy `apps/web/dist` and `apps/api/src` into final image; `CMD ["bun", "apps/api/src/index.ts"]`
- Single container, port 3000, volume mount at `/data` for SQLite file
- `docker compose up` orchestrates one service plus the named volume

## Architecture Validation Results

### Coherence Validation ✅

**Decision compatibility:** all current versions (Bun 1.3.11, Elysia 1.4.28, Solid 1.9.12, Vite 8.0.10, UnoCSS 66.6.8, oxlint, oxfmt, tsgo) are mutually compatible and represent current stable / preview lines. Eden Treaty is first-class on Elysia + Bun; TanStack Solid Query has no Bun-compat issues; oxc toolchain pieces are independent of the runtime stack. No conflicts.

**Pattern consistency:** naming (camelCase code / PascalCase types & components / snake_case DB), structure (by-type components, colocated tests, repo pattern, single Elysia app, named exports only), and communication (Eden client → TanStack hooks → components) are internally consistent across all sections.

**Structure alignment:** every FR has a documented home in `apps/{web,api}`. Bun workspaces work with the no-`packages/contracts` shape because Eden carries the shared types via the `App` type export. Boundaries (API, component, storage, env) are documented and respected by the structure.

### Requirements Coverage Validation ✅

**Functional Requirements (34 FRs across 8 categories):** every FR is mapped to specific files in the *Requirements-to-Structure Mapping* section above.

**Non-Functional Requirements (21 NFRs across 5 categories):** every NFR has a documented enforcement location in the *Cross-Cutting NFR Locations* table.

**UX-spec decisions (FR10 delete safety, keyboard shortcut set, focus-landing rule, sync-status indicator, retry-exhausted state, completed-task visual treatment):** all flow through the locked architectural decisions (D1, D3, D4, D5, D7) and the component placements (TaskRow, UndoSnackbar, LiveRegion).

### Implementation Readiness Validation ✅

**Decision completeness:** D1–D12 are documented with versions, rationale, and concrete configuration locks (status codes, retry policy, token-bucket parameters, log fields, etc.). No "TBD" remains.

**Structure completeness:** the directory tree is complete to the file level for all MVP components. Test files are explicitly listed alongside source.

**Pattern completeness:** Implementation Patterns section addresses naming, structure, modules, code style, Solid-specific rules, TanStack Query rules, Eden rules, backend handler discipline, logging, constants, env access, comments, test structure, and an explicit anti-pattern list.

### Gaps Found and Resolved

Three small gaps surfaced during validation; each is resolved inline below.

**Gap 1 — Vite `build.target` not configured.**

The PRD browser matrix requires Safari 15+ on iOS (FR20). Vite's default `build.target` is `["chrome87", "edge88", "firefox78", "safari14"]` — `safari14` under-targets the PRD by one major version, causing esbuild to downlevel features that Safari 15 supports natively, slightly inflating the bundle.

**Resolution:** set `build.target` explicitly in `apps/web/vite.config.ts`:

```ts
build: {
  target: ["chrome120", "edge120", "firefox120", "safari15"],
}
```

These versions track "latest 2 majors" approximately — refresh at major release time. iOS Safari is governed by the desktop Safari version (15 covers iOS 15+).

**Gap 2 — Backend env var inventory not enumerated.**

The architecture references `apps/api/src/env.ts` as the only consumer of `Bun.env`, but doesn't list the actual variables. Locking the inventory here prevents drift.

**Resolution:** the backend reads exactly these environment variables; all are read once in `env.ts`, validated on import, and re-exported as typed values:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `3000` | HTTP listen port |
| `DATABASE_PATH` | no | `./tasks.db` (dev) / `/data/tasks.db` (container) | SQLite file location |
| `NODE_ENV` | no | `development` | Toggles dev-only behaviours (verbose error envelope `details`, etc.) |

The frontend reads no environment variables at MVP. `apps/web/src/env.ts` exists for forward optionality; it reads `import.meta.env` and currently exports only `IS_DEV` (boolean from `import.meta.env.DEV`).

**Gap 3 — Operational facts (API versioning, backup recovery) implicit.**

Two operational properties were obvious from context but not stated.

**Resolution:**

- **API versioning:** there is no path-versioning at MVP. Frontend and backend are deployed as a single container image; breaking changes deploy in lock-step. If/when the API ever opens to third-party consumers (Vision-phase), introduce `/api/v1/*` and the parallel-versioning ceremony at that time.
- **Backup and recovery:** the SQLite file at the `tasks-data` volume mount (`/data/tasks.db`) is the entire persistent state of the application. Backup is a filesystem copy of that file (the WAL `journal_mode` makes hot-copy safe). Recovery is restoring the file into the volume before starting the container. No application-level backup mechanism is provided at MVP.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context analyzed (PRD + UX spec, 34 FRs, 21 NFRs)
- [x] Scale and complexity assessed (low complexity, single-user, polished-execution bar)
- [x] Technical constraints identified (bundle ≤100KB, deps ≤25, ≥WCAG AA, single-container deploy)
- [x] Cross-cutting concerns mapped (optimistic-mutation contract, error envelope, structured logging, ARIA live regions, quality gates, atomic persistence, input safety, theming, reduced-motion)

**✅ Architectural Decisions**

- [x] D1–D12 documented with versions and rationale
- [x] Technology stack fully specified (Bun + Elysia + Eden, Solid + Vite + UnoCSS + TanStack Query, oxlint + oxfmt + tsgo)
- [x] Integration patterns defined (Eden type-flow, TanStack mutation lifecycle, repo pattern, single Elysia app)
- [x] Performance considerations addressed (≤100KB bundle, Lighthouse ≥90/95, ≤100ms interaction, optimistic UI as the perf primitive)

**✅ Implementation Patterns**

- [x] Naming conventions (TS identifiers, files, DB, API)
- [x] Structure patterns (component organization, test colocation, per-package src layout)
- [x] Module conventions (named exports only, type-only imports, import ordering)
- [x] Code style (async/await, Solid-specific, TanStack Query, Eden, backend handler discipline)
- [x] Cross-cutting (logging, constants, env vars, comments, tests)
- [x] Anti-patterns enumerated and forbidden

**✅ Project Structure**

- [x] Complete directory tree to file level
- [x] Architectural boundaries (API, component, storage, env) explicitly defined
- [x] Integration points documented (request flow, data flow)
- [x] Requirements-to-structure mapping (every FR/NFR traced to a location)

### Architecture Readiness Assessment

**Overall status:** READY FOR IMPLEMENTATION.

**Confidence level:** HIGH.

**Key strengths:**

- Schema-driven type safety end-to-end (Elysia route schemas → Eden type flow → TanStack Query → Solid components) means an AI agent implementing a single layer cannot silently diverge from the contract.
- Optimistic-mutation contract (D1 UUIDv7 + D3 idempotent semantics + D7 TanStack Query no-rollback) is fully specified — the load-bearing property is locked in three matching places.
- Quality gates are version-controlled (`scripts/`, `lighthouserc.json`, oxlint/oxfmt configs) and CI-ready; migration to GitHub Actions or similar is a one-step move when scope warrants.
- Single-tool orchestration (Bun for runtime/PM/test/SQLite; Vite for frontend build; oxc for lint/format) keeps the toolchain narrow.

**Known risks (with mitigation paths):**

- **tsgo is preview-grade.** Mitigation: stable TS 6 is a one-line fallback (swap `tsgo` for `tsc` in `bun run check`). No `--build` or `--declaration` features used, so missing-feature risk is bounded.
- **oxlint has no Solid-specific reactivity rules.** Mitigation: tests catch reactivity bugs at runtime; manual review at code-review time is the second line; if reactivity bugs surface in practice, the migration target is ESLint + `eslint-plugin-solid` (well-trodden path).
- **Bun is younger than Node** in production-grade adoption. Mitigation: Anthropic's own production use plus Bun 1.3.x stability; we use only the well-tested subset (HTTP server, SQLite, test runner, package manager) — no exotic Bun-only APIs.

**Areas for future enhancement (Vision-phase):**

- Multi-user → introduces auth (likely OIDC-based), per-user data isolation (per-user SQLite or shared Postgres), session management.
- Multi-device sync → libsql / Turso embedded replicas, offline-first via service worker, conflict resolution.
- Centralized observability → Pino + transport, OpenTelemetry, hosted metrics backend.
- Real CI → GitHub Actions workflow translating the `bun run check:*` scripts 1:1.
- `compose.yaml` service split → if a reverse proxy (e.g. Caddy with auto-HTTPS) becomes useful for hosted deployment.

### Implementation Handoff

**AI agent guidelines:**

- Treat this document as the single source of truth for architectural questions. When in doubt, search this document first.
- Follow the Implementation Patterns section literally — naming, structure, module conventions, anti-patterns are non-negotiable. Pattern violations are bugs.
- Respect architectural boundaries (API ↔ frontend, component ↔ data layer, handler ↔ storage, env ↔ app code). A boundary violation is a structural bug even if the code "works."
- Add a comment only when the WHY is non-obvious; the codebase aims for zero-comment readability.
- When a real implementation need conflicts with this document, update this document explicitly — never silently violate it.

**First implementation priority:**

The first story scaffolds the workspace per the Initialization Sequence in the *Starter Template Evaluation* section. Specifically:

1. Root: `package.json`, `bunfig.toml`, `tsconfig.base.json`, `compose.yaml`, `Dockerfile`, `.gitignore`, `.env.example`, `README.md`, `.oxlintrc.json`, `oxfmt.toml`, `lighthouserc.json`, `playwright.config.ts`, `scripts/check-bundle-size.sh`, `scripts/check-dep-count.sh`.
2. `apps/api/`: minimal Elysia app at `src/index.ts` exporting the `App` type, `/health` route returning `{ status: "ok", uptime }`, the env module, the constants module, the logger module, the migration runner skeleton, the tasks repository skeleton (no methods implemented yet), the error envelope module.
3. `apps/web/`: minimal Solid app at `src/index.tsx` with the QueryClient provider, top-level `<ErrorBoundary>`, the Eden client, the env module, the constants module, the UnoCSS config with token rules.
4. One backend `bun:test` ("repository connects to in-memory DB and runs migrations cleanly") and one Playwright test ("page loads with focused input; `/health` returns 200") proving the toolchain is wired end-to-end.

Subsequent stories add capability one FR group at a time, in the order of the Implementation Sequence in the *Decision Impact Analysis* section.

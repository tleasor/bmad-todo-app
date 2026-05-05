# Project Structure & Boundaries

## Complete Project Directory Structure

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

## Architectural Boundaries

**API boundary (frontend ↔ backend):** the Elysia `App` type exported from `apps/api/src/index.ts` is the authoritative contract. Frontend imports it via `import type` only — no runtime backend code crosses the boundary.

- Inbound: HTTP → `requestLogger` → `rateLimit` → route schema validation → handler
- Outbound: Elysia response serialization; errors enveloped by global `onError`
- Frontend consumes via Eden Treaty's `{ data, error }` discriminant, fed to TanStack Query hooks in `apps/web/src/data/queries.ts`

**Component boundary (UI ↔ data layer):** Solid components consume data through TanStack Query hooks only. Components never import the Eden `api` client directly. Hooks are the only consumers of `api`.

**Storage boundary (handlers ↔ database):** route handlers consume `taskRepo` from `apps/api/src/storage/tasks.ts`. No inline SQL in handlers. The repo encapsulates Database access, snake_case ↔ camelCase translation, `INSERT OR IGNORE` idempotency, and atomic single-statement operations.

**Configuration boundary (env ↔ app code):** `Bun.env` read only inside `apps/api/src/env.ts`; `import.meta.env` read only inside `apps/web/src/env.ts`. Both validate on import and re-export typed values.

## Requirements-to-Structure Mapping

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

## Cross-Cutting NFR Locations

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

## Integration Points

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

## File Organization Patterns (already locked, repeated for findability)

- **Tests:** colocated `*.test.ts(x)` next to source; Playwright in `e2e/` at root.
- **Components:** one per file (PascalCase); sub-components co-located only when used exclusively by one parent.
- **Modules:** one per file (camelCase) for utilities, hooks, services, repos.
- **Constants:** per-package `constants.ts` at the package src root.
- **Env access:** per-package `env.ts` is the only consumer of `Bun.env` / `import.meta.env`.
- **Styles:** UnoCSS handles utilities. Global tokens + reset live in `apps/web/src/styles/`. No per-component CSS files.

## Development Workflow Integration

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

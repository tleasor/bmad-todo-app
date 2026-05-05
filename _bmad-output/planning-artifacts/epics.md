---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture/index.md
  - _bmad-output/planning-artifacts/architecture/project-context-analysis.md
  - _bmad-output/planning-artifacts/architecture/starter-template-evaluation.md
  - _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md
  - _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md
  - _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md
  - _bmad-output/planning-artifacts/architecture/architecture-validation-results.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# bmad-todo-app - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for bmad-todo-app, decomposing the requirements from the PRD, UX Design Specification, and Architecture Decision Document into implementable stories.

## Requirements Inventory

### Functional Requirements

**Task Capture & Listing**

- FR1: Users can create a new task by entering a short text description (≤ 500 characters).
- FR2: Users can view all of their tasks in a single list.
- FR3: Users can see at a glance which tasks are active and which are completed, with the distinction communicated through more than color alone.
- FR4: The product displays an explicit empty state when the task list contains no tasks.
- FR5: The product displays an explicit loading state while the task list is being retrieved.
- FR6: The product displays an explicit error state when task retrieval fails, and the message communicates what the user can do.

**Task Completion**

- FR7: Users can mark an active task as completed.
- FR8: Users can mark a completed task as not completed (restore to active).
- FR9: Completed tasks remain in the list and remain visible until the user explicitly deletes them.

**Task Deletion**

- FR10: Users can delete a task from the list. (UX resolution: immediate delete + 5 s UndoSnackbar + Cmd/Ctrl+Z within window.)

**Data Persistence**

- FR11: Tasks persist across browser page reloads.
- FR12: Tasks persist across browser sessions.
- FR13: Tasks persist across server and container restarts.

**Keyboard Operation**

- FR14: Users can add a task using the keyboard alone.
- FR15: Users can toggle task completion using the keyboard alone.
- FR16: Users can delete a task using the keyboard alone.
- FR17: Users can move focus between tasks using the keyboard alone.
- FR18: The task input is focused on page load so that the user can begin typing immediately, without any input action.
- FR19: Every focusable element communicates its focus state visibly, so the user always knows where keyboard input will be applied.

**Responsive & Accessible Presentation**

- FR20: The product renders and remains functional across all supported browser and breakpoint combinations (per Browser Matrix and Responsive Design tiers).
- FR21: The product is operable via screen reader, with task content and state announced by assistive technology.
- FR22: Status changes produced by background operations (sync result, retry outcome, error) are announced to assistive technologies.

**Failure Handling & Recovery**

- FR23: Task creation, completion toggle, and deletion appear to succeed immediately from the user's perspective (optimistic UI).
- FR24: When a write operation fails, the product retries in the background without requiring user action.
- FR25: When a write operation has not yet successfully synced, the affected task displays a non-intrusive sync-status indicator.
- FR26: When background retries ultimately exhaust, the product displays an actionable error message in context without losing the user's input.
- FR27: The product never silently loses task data due to network or transient backend failures.

**API**

- FR28: The product exposes an HTTP API that supports creating, reading, updating (completion status), and deleting tasks.
- FR29: API write operations are idempotent on retry, so repeated attempts with the same intent do not produce duplicate tasks.
- FR30: API error responses use a consistent error contract (shape, error codes) across all endpoints.
- FR31: The API exposes a health-check endpoint that reports service readiness.

**Deployment & Operability**

- FR32: The product starts with a single `docker compose up` command, with no additional manual configuration required.
- FR33: Container logs are accessible via standard `docker compose logs` to support observability during development and troubleshooting.
- FR34: The product can be stopped and restarted without data loss.

### NonFunctional Requirements

**Performance**

- NFR-P1: All Performance Targets (Lighthouse mobile ≥ 90, desktop ≥ 95, TTI ≤ 1 s, LCP ≤ 1.5 s mobile / ≤ 1 s desktop, INP ≤ 100 ms 95th pct, interaction latency ≤ 100 ms 95th pct, main JS chunk ≤ 100 KB gzipped) must be met at release and continuously enforced. A PR that regresses any target below threshold does not merge.
- NFR-P2: Bundle size, Lighthouse mobile score, and Lighthouse accessibility score are checked per PR at build time.
- NFR-P3: Performance targets apply to the median supported device / browser combination; the product must not crash or render unusably on unsupported devices.

**Accessibility**

- NFR-A1: The product conforms to WCAG 2.1 Level AA with zero critical violations per axe-core and Lighthouse accessibility audits.
- NFR-A2: Accessibility audits run in CI on every PR; a PR that introduces a critical violation does not merge.
- NFR-A3: Screen-reader smoke tests on NVDA + Chrome (Windows), VoiceOver + Safari (macOS), and VoiceOver + Safari (iOS) pass before release.

**Security & Privacy**

- NFR-S1: All user-generated content is rendered in a way that prevents injection of arbitrary HTML, JavaScript, or script elements (XSS prevention).
- NFR-S2: The backend validates and sanitizes all task-description input at the API boundary; no SQL/NoSQL/command-injection vectors in handlers.
- NFR-S3: All third-party dependencies are version-pinned and audited for known vulnerabilities at build time; a dependency with a known high-or-critical CVE does not ship in a release.
- NFR-S4: The product does not collect, log, or transmit any personal identifying information.
- NFR-S5: The API enforces input-size limits — task description ≤ 500 characters, request body ≤ 10 KB, per-IP rate limiting per architecture policy.

**Reliability & Observability**

- NFR-R1: The product tolerates transient network failures without silent data loss.
- NFR-R2: A crashed backend container can be restarted via `docker compose` without data loss.
- NFR-R3: Data persistence is atomic per operation; a crash mid-write does not leave persisted state inconsistent.
- NFR-R4: Logs are emitted in machine-readable structured JSON at info / warn / error levels.
- NFR-R5: The health-check endpoint reports status within 5 seconds of container start and returns HTTP 200 when ready.

**Maintainability**

- NFR-M1: Automated test coverage ≥ 70% meaningful coverage (branch and logic) on both frontend and backend, enforced by CI.
- NFR-M2: End-to-end test suite of ≥ 5 Playwright tests covering the core journeys.
- NFR-M3: The codebase passes its linter and type-checker without warnings; PRs introducing new warnings do not merge.
- NFR-M4: Public interfaces are documented sufficient for a new developer to clone, run, and modify within 30 minutes.
- NFR-M5: Production dependency footprint ≤ 25 direct dependencies per package, enforced by a CI dependency-count check.

### Additional Requirements

Architecture-driven implementation requirements that affect epic and story decomposition. Source: Architecture Decision Document.

**Project initialization (impacts Epic 1, Story 1):**

- ARCH-AR1: **Hand-rolled monorepo scaffold — no third-party scaffolding tool.** The first implementation story owns the full initialization sequence (root `package.json` with `workspaces: ["apps/*"]`, `bunfig.toml`, `tsconfig.base.json`, all per-package `tsconfig.json` files, `vite.config.ts`, `uno.config.ts`, `compose.yaml`, `Dockerfile`, `playwright.config.ts`, `lighthouserc.json`, `.oxlintrc.json`, `oxfmt.toml`, `scripts/check-bundle-size.sh`, `scripts/check-dep-count.sh`, `.env.example`, `.gitignore`, `README.md`, plus one `bun:test` and one Playwright test proving end-to-end toolchain wiring).
- ARCH-AR2: Selected technology stack — Bun 1.3.11 (runtime, PM, test runner, SQLite client), Solid 1.9.12, Elysia 1.4.28 on `Bun.serve`, Vite 8.0.10 (Rolldown), UnoCSS 66.6.8 with `presetMini`, TanStack Solid Query, Eden Treaty (`@elysiajs/eden`), oxlint + oxfmt, `@typescript/native-preview` (tsgo), Playwright + `@axe-core/playwright`, `@lhci/cli`.
- ARCH-AR3: Vite `build.target: ["chrome120", "edge120", "firefox120", "safari15"]` to match the PRD browser matrix without under-targeting Safari 15.

**Data layer:**

- ARCH-AR4: SQLite via `bun:sqlite` with pragmas `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`. Hand-rolled forward-only migration runner using numbered SQL files (`001_create_tasks.up.sql`) and a `schema_versions(version, applied_at)` table; up-migration tests mandatory; no down migrations.
- ARCH-AR5: Single `tasks` table — `id TEXT PRIMARY KEY NOT NULL`, `text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 500)`, `completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))`, `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL`.
- ARCH-AR6: Client-generated **UUIDv7** task IDs in `apps/web/src/data/uuid.ts` (hand-rolled, ~30 LOC using `crypto.getRandomValues()` + `Date.now()`; no `uuid` npm dep).

**API layer:**

- ARCH-AR7: REST contract — `GET /api/tasks` (200, newest-first), `POST /api/tasks` (201 create / 200 idempotent retry / 409 id_conflict / 400 / 429), `PATCH /api/tasks/:id` (200 / 404 / 400 / 429, body is target completion state), `DELETE /api/tasks/:id` (204 idempotent / 429), `GET /health` (200 / 503, outside `/api`). JSON keys camelCase; storage layer translates to snake_case columns.
- ARCH-AR8: Error envelope `{ error: { code, message, details? }, requestId }` with closed `ErrorCode` union (`validation_error`, `not_found`, `id_conflict`, `payload_too_large`, `rate_limited`, `internal_error`, `service_unavailable`); single Elysia `onError` maps `AppError` and Elysia validation errors to envelope; status codes derived from code via closed map.
- ARCH-AR9: Validation via Elysia `t` schemas defined inline in `apps/api/src/routes/*.ts`. Eden Treaty's `App` type imported by the frontend (`import type` only) for compile-time end-to-end type safety.
- ARCH-AR10: Rate-limit middleware — token bucket per-IP, **burst 20 / refill 2 tokens per second**, in-memory `Map<string, BucketState>` with 10-minute idle-bucket eviction. 429 responses include `Retry-After` + `X-RateLimit-Limit` / `-Remaining` / `-Reset` headers. `/health` excluded; everything under `/api/*` rate-limited.

**Frontend data layer:**

- ARCH-AR11: TanStack Solid Query configuration — `staleTime: Infinity` and `gcTime: Infinity` on tasks query; `refetchOnWindowFocus: false`, `refetchOnReconnect: true`; queries retry 2; mutations retry per-status (429 honors `Retry-After` up to 4 times, 5xx up to 3, other 4xx fail-fast); `retryDelay: Math.min(1000 * 2 ** attempt + jitter, 30_000)`. **Critical: `onError` does NOT roll back the optimistic update** — row-local sync-pending or retry-exhausted state surfaces instead.

**Observability:**

- ARCH-AR12: Hand-rolled structured JSON logger writing to stdout with standard fields (`level`, `msg`, `ts`, `requestId`, `method`, `path`, `status`, `durationMs`, `ip`, `errorCode`, `stack`); per-request middleware generates `requestId` (UUIDv7), emits info line in/out, attaches `requestId` to log lines and error responses.
- ARCH-AR13: Frontend error reporting — top-level Solid `<ErrorBoundary>` plus global `window.error` and `unhandledrejection` handlers logging structured JSON to `console.error` with the same field shape as the backend.

**Infrastructure:**

- ARCH-AR14: Single-service Docker container — Elysia on `Bun.serve` serves `/api/*`, `/health`, and SPA static assets from `apps/web/dist/` (catch-all SPA fallback for paths that don't match `/api/*` and aren't real files).
- ARCH-AR15: Multi-stage `Dockerfile` (install → build SPA via Vite → runtime on `oven/bun:1.3.11-alpine`); `compose.yaml` mounts `tasks-data` volume to `/data` with `DATABASE_PATH=/data/tasks.db`; one container, port 3000.

**Tooling:**

- ARCH-AR16: Three escalating quality-gate scripts in root `package.json` — `bun run check` (~5 s: oxlint format+lint, tsgo `--noEmit`, dep-count), `bun run check:full` (~30 s: + `bun test`, `bun audit`, `bun run build`, bundle-size), `bun run check:release` (~3 min: + Playwright E2E with axe-core, Lighthouse mobile + desktop). Thresholds in checked-in config (`lighthouserc.json`, `scripts/check-*.sh`). No CI, no git hooks at MVP — scripts translate 1:1 to CI when introduced.
- ARCH-AR17: Backend env validated once in `apps/api/src/env.ts` and re-exported as typed values (`PORT` default 3000, `DATABASE_PATH` default `./tasks.db` dev / `/data/tasks.db` container, `NODE_ENV`). Frontend env in `apps/web/src/env.ts` (only `IS_DEV` at MVP). App code never reads `Bun.env` or `import.meta.env` directly.

**Implementation patterns:**

- ARCH-AR18: Honor naming, structure, and module conventions enumerated in the architecture's Implementation Patterns section — camelCase / PascalCase / UPPER_SNAKE / snake_case literals, PascalCase component files / camelCase module files / kebab-case config files, named exports only (no `export default`), `import type` for types, repository pattern (no inline SQL in routes), single Elysia app, anti-patterns list (no TS enums, no `any`, no `console.log` in production, no magic numbers, etc.).
- ARCH-AR19: `README.md` with clone-and-run path ≤ 30 min (NFR-M4) covering install, dev, build, check, deploy.

### UX Design Requirements

UX-driven implementation work items extracted from the UX Design Specification. Each item is specific enough to generate a story with testable acceptance criteria.

**Design system foundation:**

- UX-DR1: Implement the design token system — color (light + dark theme palettes per spec tables), typography scale (`text.display` / `text.heading` / `text.body` / `text.body.strong` / `text.meta` / `text.caption`), spacing scale (4 px base unit, `space.0` through `space.16`), radii (`radius.sm` / `radius.md` / `radius.full`), motion durations (`motion.instant` / `motion.short` / `motion.medium` / `motion.long`). Tokens expressed as UnoCSS rules and exposed as CSS custom properties on `:root` and `[data-theme]`. No component-level hard-coded values permitted.
- UX-DR2: Theme is driven by `prefers-color-scheme`; both light and dark themes ship at MVP; **no user-facing theme toggle**.
- UX-DR3: Self-host **Inter** as a variable font (woff2, Latin subset, ~28 KB, `font-display: swap`) with system-font-stack fallback. Dropping Inter for system stack alone is acceptable if bundle pressure requires.

**Components (custom, no library):**

- UX-DR4: Build **TaskInput** component — full-width 48 px height, `radius.sm` border, focus ring (2 px `accent.default`, 2 px offset), `aria-label="New task"`, `maxlength="500"`, placeholder *"What needs doing?"*, auto-focus on mount, Enter submits (no-op on whitespace-only), Escape clears, Shift+Enter no-op, `autocomplete="off"` `autocapitalize="sentences"` `spellcheck="true"`.
- UX-DR5: Build **CharacterCounter** component — hidden below 400 chars, visible at ≥ 400 chars rendering `{count} / 500`, right-aligned `text.caption` `color.text.secondary`, `aria-live="polite"`.
- UX-DR6: Build **TaskList** component — `<ul role="list">` container that switches between empty / loading / populated / list-level fetch-error states.
- UX-DR7: Build **TaskRow** component with composable states (`active`, `completed`, hover, focused, `sync-pending`, `retry-exhausted`) and sub-parts: **Checkbox** (20 × 20 circular, 2 px border, accent fill + white check when complete), **SyncIndicator** (14 × 14 dashed circle rotating 1.5 s, `color.status.pending`, with reduced-motion static fallback), **RetryAction** (text button visible only in retry-exhausted), **DeleteButton** (16 × 16 trash icon, opacity 0 default → opacity 1 on hover/focus on desktop, always visible on touch), **ErrorMessage** (inline below text in retry-exhausted, *"Couldn't save — check connection."*). Row height ≥ 44 px; states compose freely.
- UX-DR8: Build **EmptyState** component — single line *"No tasks yet. Start by typing above."* in `text.body` `color.text.secondary`; no illustration, no icon, no button.
- UX-DR9: Build **LoadingState** component with **SkeletonRow** sub-component — show only when initial fetch exceeds ~200 ms; three SkeletonRow instances at 100% / 75% / 60% widths; circle (20 px) + text-bar placeholders in `bg.subtle` with `motion.medium` shimmer; reduced-motion replaces shimmer with static fill; `aria-busy="true"` `aria-live="polite"` on container.
- UX-DR10: Build **LiveRegion** component — visually-hidden `<div>` with `aria-live="polite" aria-atomic="true"`, single shared instance. Announcements: *"Saving…"*, *"Saved"*, *"Couldn't save — check connection."*, *"Task deleted. Press Command-Z to undo."* (first delete in session) → *"Task deleted"* (subsequent), *"N tasks deleted"* (concurrent collapse). Substitute *"Control-Z"* on non-macOS platforms via platform detection.
- UX-DR11: Build **UndoSnackbar** component — bottom-center floating element with *"Task deleted"* + Undo button; appears immediately on delete, auto-dismisses after 5 s, dismisses on undo, replaces itself on subsequent delete (concurrent deletes collapse to *"N tasks deleted"* with single Undo); `role="status"` `aria-live="polite"`; Undo button keyboard-reachable.

**Interaction & behavior patterns:**

- UX-DR12: Implement the complete **keyboard shortcut set**:
  - TaskInput focused: Enter submit / Escape clear / Shift+Enter no-op / Arrow Down → first TaskRow.
  - TaskRow focused: Space toggle / Delete or Backspace delete / Arrow Up or `k` previous / Arrow Down or `j` next / Escape → TaskInput / Tab → RetryAction (if present) → DeleteButton → next row / `i` → TaskInput.
  - On TaskRow / DeleteButton / RetryAction / Undo focus: any printable char (except `i`/`j`/`k`) returns focus to TaskInput and appends the character (typing-anywhere-captures).
  - Anywhere: Cmd/Ctrl+Z undoes last delete within 5 s window.
- UX-DR13: Implement **focus management** rules — auto-focus TaskInput on load (FR18), focus-landing-after-delete (next TaskRow → previous TaskRow → TaskInput), Escape from any TaskRow returns focus to TaskInput, focus never dumps to document body, after-undo focus lands on the restored TaskRow, capture/toggle preserve current focus.
- UX-DR14: Implement **newest-first ordering** — single list, completion does NOT re-sort; undo restores the deleted task at its **original** list position, not at the top.
- UX-DR15: Implement **FR10 delete safety** — delete is immediate, row animates out on `motion.medium`, optimistic DELETE fires; UndoSnackbar appears at bottom-center; Cmd/Ctrl+Z undoes within 5 s window (no-op after); concurrent deletes collapse into single *"N tasks deleted"* + single restore.
- UX-DR16: Implement **optimistic-mutation contract** — silent success (no toast / banner / animation on insert; `motion.instant` on capture); row-local failure surfaces (sync-pending after ~300 ms pending, retry-exhausted with inline message + Retry action + `status.error.subtle` row background); never roll back the optimistic update.
- UX-DR17: Implement **list-level fetch-error state (FR6)** — inline within the list area, neutral copy, Retry affordance; never modal, never red page background.

**Responsive & accessibility:**

- UX-DR18: Implement responsive tier behavior with mobile-first `min-width` cascade — Compact (default, no MQ), Medium (`min-width: 600px`), Expanded (`min-width: 900px`), Large (`min-width: 1200px`), Extra-large (`min-width: 1800px`). Column widths and outer/top padding per Visual Foundation table; max content width 640 px from Expanded onward; content does not stretch to fill viewport. No `max-width`-only media queries.
- UX-DR19: Implement touch-specific behaviors via `@media (hover: none)` — DeleteButton always visible, hover styles suppressed, ≥ 44 × 44 px hit regions on Checkbox / DeleteButton / TaskRow at Compact and Medium tiers. Soft-keyboard Enter submits identically to desktop Enter.
- UX-DR20: Implement **reduced-motion compliance** — `@media (prefers-reduced-motion: reduce)` collapses every non-instant duration to instant; SyncIndicator rotation removed (static dashed circle remains); SkeletonRow shimmer removed; row-out animation on delete becomes instant.
- UX-DR21: Implement **page structure & metadata** — single `<main>` landmark wrapping input and list; no `<header>`, `<nav>`, `<footer>` at MVP; viewport meta `<meta name="viewport" content="width=device-width, initial-scale=1" />` (no `maximum-scale`, no `user-scalable=no`); favicon set (16 × 16, 32 × 32, apple-touch-icon); `<title>` and `<meta name="description">` with sensible defaults.
- UX-DR22: Implement **content & voice rules** — sentence case (*"Retry"*, *"Undo"*); no marketing or motivational copy anywhere; no emoji in product surface (icons are SVG); em-dash (—) not hyphen in inline sentence fragments; no performative apology (*"Oops"*, *"Sorry"*); impersonal voice (*"Couldn't save"* not *"You haven't saved this task yet"*); error messages name the failed operation and suggest a next action.

### FR Coverage Map

| FR | Epic | Coverage notes |
|---|---|---|
| FR1 | Epic 1 | TaskInput captures up to 500 chars |
| FR2 | Epic 1 | TaskList renders all tasks |
| FR3 | Epic 2 | Active vs completed visual treatment (non-color) |
| FR4 | Epic 1 | EmptyState component |
| FR5 | Epic 1 | LoadingState with 200 ms gate |
| FR6 | Epic 1 | List-level fetch-error state with Retry |
| FR7 | Epic 2 | Mark active task as completed |
| FR8 | Epic 2 | Mark completed task as not completed |
| FR9 | Epic 2 | Completed tasks remain in list until deleted |
| FR10 | Epic 3 | Immediate delete + 5 s UndoSnackbar + Cmd/Ctrl+Z |
| FR11 | Epic 1 | SQLite persists across page reload |
| FR12 | Epic 1 | SQLite persists across browser session |
| FR13 | Epic 1 | Volume mount persists across container restart |
| FR14 | Epic 1 | Auto-focus + Enter is the keyboard add path |
| FR15 | Epic 2 | Space on focused row toggles completion |
| FR16 | Epic 3 | Delete / Backspace on focused row deletes |
| FR17 | Epic 4 | Arrow Up / Down + j / k between tasks |
| FR18 | Epic 1 | TaskInput auto-focused on mount |
| FR19 | Epic 1 / 2 / 3 / 4 | Input (E1) → Checkbox (E2) → DeleteButton + RetryAction + Undo (E3) → cross-element audit (E4) |
| FR20 | Epic 1 | Responsive tier behavior baseline; per-epic rows verified at every tier |
| FR21 | Epic 1 | Screen-reader semantics on input + list; extended per epic for new components |
| FR22 | Epic 1 | LiveRegion wired; per-mutation announcements added in Epic 1 / 2 / 3 |
| FR23 | Epic 1 / 2 / 3 | Optimistic for create (E1) / toggle (E2) / delete (E3) |
| FR24 | Epic 1 | Background retry policy; reused by Epic 2 + 3 |
| FR25 | Epic 1 | SyncIndicator component; reused by Epic 2 + 3 |
| FR26 | Epic 1 | Retry-exhausted UI primitive; reused by Epic 2 + 3 |
| FR27 | Epic 1 | No silent loss — guaranteed by TanStack Query no-rollback contract |
| FR28 | Epic 1 / 2 / 3 | POST + GET (E1) / PATCH (E2) / DELETE (E3) |
| FR29 | Epic 1 / 2 / 3 | Idempotency per endpoint (INSERT OR IGNORE / target-state PATCH / 204-on-missing DELETE) |
| FR30 | Epic 1 | Error envelope contract + closed ErrorCode union |
| FR31 | Epic 1 | `/health` endpoint with readiness gating |
| FR32 | Epic 1 | `docker compose up` single command |
| FR33 | Epic 1 | Logs via `docker compose logs` (structured JSON to stdout) |
| FR34 | Epic 1 | Restart-without-loss via volume mount + atomic SQL |

## Epic List

### Epic 1: Foundation & Task Capture

**User outcome:** *"I can open the app, type a task, hit Enter, and trust it's saved — even on a flaky network."*

This epic ships Journey 1 (first-time capture) and Journey 4 (error recovery for the capture path) end-to-end. It also lays down the project scaffold and the sync infrastructure that all subsequent epics reuse.

**Scope highlights:**

- Hand-rolled monorepo scaffold (workspaces, all configs, Dockerfile, compose.yaml, scripts, hello-world `bun:test` + Playwright test) — ARCH-AR1.
- Backend: SQLite + migrations + tasks repository, structured JSON logger, error envelope, rate-limit middleware, request logger, GET + POST `/api/tasks`, `/health`.
- Frontend: design tokens (light + dark), TanStack Query + Eden client, TaskInput (auto-focus, Enter, Escape, CharacterCounter), TaskList, TaskRow (active state only), EmptyState, LoadingState + SkeletonRow, LiveRegion, SyncIndicator, ErrorMessage + RetryAction, top-level `<ErrorBoundary>` + global error handlers.
- Sync resilience: optimistic create + background retry + sync-pending indicator + retry-exhausted state + list-level fetch-error state + no-rollback mutation contract.
- Deployment: `docker compose up` with persistent volume; `/health` returns 503 until migrations applied.
- Responsive layout, screen-reader semantics, visible focus on input — baseline for the whole app.

**FRs covered:** FR1, FR2, FR4, FR5, FR6, FR11, FR12, FR13, FR14, FR18, FR19 (input), FR20 (baseline), FR21 (baseline), FR22 (LiveRegion + capture announcements), FR23 (create), FR24, FR25, FR26 (capture), FR27, FR28 (POST + GET), FR29 (POST), FR30, FR31, FR32, FR33, FR34.

**State after Epic 1:** A working capture surface — type, Enter, persists, recovers from failure honestly. Tasks render in the list but cannot yet be toggled or deleted from the UI.

---

### Epic 2: Task Completion

**User outcome:** *"I can mark tasks complete and see at-a-glance what's left to do."*

Builds on Epic 1's row and sync infrastructure. Includes Space-to-toggle on focused row so completion is keyboard-operable from day one.

**Scope highlights:**

- Backend: PATCH `/api/tasks/:id` with target-state body and idempotent retry semantics.
- Frontend: Checkbox sub-component (click + Space-on-focused-row to toggle), completed-task visual treatment (strike-through + `text.muted`).
- Optimistic toggle + retry handling (reusing Epic 1's SyncIndicator + retry-exhausted primitive).
- Active-vs-completed distinction validated against contrast on `bg.canvas` and `bg.subtle` (the load-bearing fragile case).
- LiveRegion announcements for toggle sync state.

**FRs covered:** FR3, FR7, FR8, FR9, FR15, FR19 (Checkbox), FR23 (toggle), FR28 (PATCH), FR29 (PATCH idempotent).

**State after Epic 2:** Capture + toggle complete. Tasks can still only be removed via direct DB access; no delete UI yet.

---

### Epic 3: Task Deletion with Undo

**User outcome:** *"I can delete tasks confidently — accidents are reversible."*

Resolves FR10 with the UX-spec pattern. Includes Delete / Backspace on focused row. Adds the focus-landing-after-delete rule.

**Scope highlights:**

- Backend: DELETE `/api/tasks/:id` (idempotent — 204 even when missing).
- Frontend: DeleteButton sub-component (click + Delete / Backspace-on-focused-row), `motion.medium` row-out animation (instant under reduced-motion).
- UndoSnackbar component with 5 s auto-dismiss and concurrent-delete collapsing.
- Cmd/Ctrl+Z global handler with platform detection and 5 s window enforcement.
- Restore-at-original-position semantics on undo.
- Focus-landing-after-delete rule (next → previous → input).
- LiveRegion announcements for delete + undo (with platform-appropriate shortcut copy).

**FRs covered:** FR10, FR16, FR19 (DeleteButton, RetryAction, Undo button), FR23 (delete), FR28 (DELETE), FR29 (DELETE idempotent).

**State after Epic 3:** Full CRUD lifecycle working with mouse, touch, and per-action keyboard. Cross-row keyboard navigation (arrows, j/k, Escape, typing-anywhere-captures) still missing.

---

### Epic 4: Keyboard-First Navigation

**User outcome:** *"I can operate everything from the keyboard — fast as a terminal."*

Layers the cross-row keyboard navigation that delivers Journey 3 (keyboard-only power user). Until this epic, keyboard users can Tab into rows but cannot fluidly move between them.

**Scope highlights:**

- Arrow Up / Down + `j` / `k` row navigation; arrow at boundary returns to TaskInput.
- Tab order within row (Checkbox → RetryAction → DeleteButton → next row's Checkbox); state changes never alter tab order.
- Escape from any row returns to TaskInput; `i` shortcut focuses TaskInput from any row sub-action or Undo button.
- Typing-anywhere-captures — printable char (except `i` / `j` / `k`) on focused row routes back to TaskInput and appends.
- Visible focus ring audit across every interactive element — closes FR19.
- Keyboard-only Playwright spec covering Journey 3 end-to-end (NFR-M2).

**FRs covered:** FR17, FR19 (full audit).

**State after Epic 4:** Full keyboard parity. The app feels like a terminal. All four PRD user journeys validated in CI.

---

## Epic 1: Foundation & Task Capture

**Goal:** Ship Journey 1 (first-time capture) and Journey 4 (error recovery for the capture path) end-to-end. Lay down the project scaffold and the sync infrastructure that all subsequent epics reuse.

### Story 1.1: Initialize Monorepo Scaffold with Toolchain

As a developer joining the project,
I want a working monorepo scaffold with the full toolchain wired up,
So that I can clone, run `bun install && bun run dev`, and have a hello-world frontend + backend running locally and via `docker compose up`.

**Acceptance Criteria:**

**Given** an empty repository,
**When** the scaffold story is complete,
**Then** the repo contains the complete file tree from the architecture's *Project Structure & Boundaries* section (root configs, `apps/web/`, `apps/api/`, `scripts/`, `e2e/`, `Dockerfile`, `compose.yaml`, `README.md`, `.env.example`, `.gitignore`)
**And** Vite is configured with `build.target: ["chrome120", "edge120", "firefox120", "safari15"]`
**And** all direct dependencies match the architecture-locked versions (Bun 1.3.11, Solid 1.9.12, Elysia 1.4.28, Vite 8.0.10, UnoCSS 66.6.8, TanStack Solid Query, `@elysiajs/eden`, oxlint, oxfmt, `@typescript/native-preview`, Playwright + axe-core, `@lhci/cli`)
**And** dep counts stay within the ≤ 25-per-package cap (NFR-M5).

**Given** the installed scaffold,
**When** the developer runs `bun run dev`,
**Then** Vite serves the frontend on port 5173 with `/api/*` and `/health` proxied to the backend on port 3000
**And** opening the dev URL shows a hello-world page with a focused `<input>` element and the `<title>` set
**And** `/health` returns HTTP 200 with `{ status: "ok" }`.

**Given** the running scaffold,
**When** the developer runs `bun run check`, `bun run check:full`, and `bun run check:release`,
**Then** all three scripts pass: oxlint + oxfmt + `tsgo --noEmit` + dep-count (~5 s); plus `bun test` + `bun audit` + bundle-size (~30 s); plus Playwright smoke spec + Lighthouse mobile + desktop (~3 min)
**And** the smoke `bun:test` exercises `app.handle('/health')` and asserts 200
**And** the Playwright `e2e/smoke.spec.ts` asserts the page title is set, the input is focused on load, and `/health` returns 200.

**Given** the scaffolded repo,
**When** the developer runs `docker compose up` from a fresh clone,
**Then** the multi-stage Dockerfile builds (install → SPA build → runtime on `oven/bun:1.3.11-alpine`) and the single service starts on port 3000
**And** `docker compose logs` emits structured JSON log lines (`level`, `msg`, `ts` at minimum)
**And** the SPA is served on `/` (with SPA fallback for paths that don't match `/api/*` or real files in `dist/`)
**And** `/health` returns 200.

**Given** the README,
**When** a new developer follows it,
**Then** they reach a running app in ≤ 30 minutes (NFR-M4)
**And** the README documents `bun install`, `bun run dev`, the three check scripts, and `docker compose up`.

### Story 1.2: Backend Plumbing — Logger, Error Envelope, Request Middleware, Health Endpoint

As a developer building the backend,
I want shared logging, error envelope, and request-correlation primitives in place,
So that every subsequent endpoint emits structured logs, returns consistent error responses, and is correlated by `requestId`.

**Acceptance Criteria:**

**Given** the backend foundation,
**When** the story is complete,
**Then** `apps/api/src/log.ts` exports `logger.info / warn / error` writing structured JSON to stdout with fields `level`, `msg`, `ts`, plus optional `requestId`, `errorCode`, `stack` (NFR-R4)
**And** `apps/api/src/errors/{AppError.ts, codes.ts, envelope.ts}` define `AppError`, the closed `ErrorCode` string-literal union (`validation_error`, `not_found`, `id_conflict`, `payload_too_large`, `rate_limited`, `internal_error`, `service_unavailable`), and an `errorEnvelope()` helper producing `{ error: { code, message, details? }, requestId }` (FR30)
**And** `apps/api/src/env.ts` validates and re-exports `PORT`, `DATABASE_PATH`, `NODE_ENV` with the documented defaults (no other module reads `Bun.env`).

**Given** the Elysia app,
**When** any request arrives,
**Then** `apps/api/src/middleware/requestLogger.ts` generates a UUIDv7 `requestId`, attaches it to the request context, emits an info log line with `method` / `path` / `ip` on entry and a line with `status` / `durationMs` on exit
**And** every log line emitted from inside a request handler carries the same `requestId`.

**Given** an Elysia handler that throws `AppError` or that fails Elysia's built-in `VALIDATION`,
**When** the global `onError` runs,
**Then** the response body matches the error envelope shape with the appropriate `code`
**And** the HTTP status is derived from `code` via the closed map in `errors/codes.ts`
**And** the response includes the request's `requestId` (echoed for log correlation).

**Given** a `GET /health` request,
**When** the backend serves it,
**Then** the response is 200 with `{ status: "ok", uptime }` JSON (FR31)
**And** the route is exempt from rate limiting (verified once Story 1.4 introduces the middleware)
**And** a `bun:test` exercises `app.handle('/health')` and asserts both 200 and the response shape.

**Given** unit tests for `log.ts`, `errors/`, and `requestLogger.ts`,
**When** `bun test` runs,
**Then** the modules added in this story have ≥ 70% meaningful coverage (NFR-M1) and all tests pass.

### Story 1.3: Backend Persistence — Tasks Table, Forward-Only Migrations, Repository Skeleton

As a developer,
I want the SQLite database, schema migrations, and tasks repository in place,
So that subsequent API stories can read and write tasks atomically against a real schema.

**Acceptance Criteria:**

**Given** the backend storage layer,
**When** the story is complete,
**Then** `apps/api/src/storage/db.ts` exports a singleton `bun:sqlite` `Database` opened at `DATABASE_PATH` with PRAGMAs `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`
**And** `apps/api/src/storage/migrations/runner.ts` runs all `*.up.sql` migrations in lexical order at boot, tracks applied versions in `schema_versions(version INTEGER PRIMARY KEY, applied_at INTEGER)`, and is a no-op on re-run
**And** `apps/api/src/storage/migrations/001_create_tasks.up.sql` creates the `tasks` table per architecture D2 (`id TEXT PRIMARY KEY NOT NULL`, `text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 500)`, `completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))`, `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL`).

**Given** the migration runner,
**When** a `bun:test` boots a fresh `:memory:` database and runs migrations,
**Then** the `tasks` and `schema_versions` tables exist with the documented schema
**And** running migrations a second time is a no-op (no extra rows in `schema_versions`)
**And** running against an existing partially-applied DB applies only the missing migrations.

**Given** `apps/api/src/storage/tasks.ts` (`taskRepo`),
**When** the story is complete,
**Then** the file exports `taskRepo` with method skeletons `list()`, `get(id)`, `create(input)`, `update(id, input)`, `delete(id)`
**And** the storage layer translates camelCase keys to snake_case columns at its boundary
**And** `taskRepo.create` uses `INSERT OR IGNORE` against the PK to satisfy idempotency (FR29)
**And** repository unit tests run against a `:memory:` DB and exercise the create + list path end-to-end.

**Given** the integrated boot sequence,
**When** the backend starts and migrations succeed,
**Then** `/health` continues to return 200
**And** if migrations fail, `/health` returns 503 with the error envelope and the failure is logged at `error` level (NFR-R5).

### Story 1.4: Backend API — GET + POST `/api/tasks` with Idempotency and Per-IP Rate Limiting

As a frontend developer / API consumer,
I want stable endpoints to list and create tasks with idempotent retry semantics and rate-limit protection,
So that the frontend can fetch the list and create tasks safely on flaky networks.

**Acceptance Criteria:**

**Given** the rate-limit middleware,
**When** the story is complete,
**Then** `apps/api/src/middleware/rateLimit.ts` implements a per-IP token-bucket with **burst 20 / refill 2 tokens per second**, in-memory `Map<string, BucketState>` with 10-minute idle-bucket eviction (NFR-S5)
**And** 429 responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
**And** the middleware applies to all `/api/*` routes and exempts `/health`
**And** unit tests exercise burst, refill, eviction, and the exempt path.

**Given** the API routes,
**When** the story is complete,
**Then** `apps/api/src/routes/tasks.ts` defines `GET /api/tasks` returning `200` with newest-first list (`ORDER BY id DESC` since UUIDv7 IDs are time-ordered)
**And** `POST /api/tasks` accepts a body validated by `t.Object({ id: t.String(), text: t.String({ minLength: 1, maxLength: 500 }) })`
**And** POST returns `201` on first insert; `200` on idempotent retry (same id + same text); `409 id_conflict` on same id + different text; `400 validation_error` on schema failure; `429 rate_limited` when bucket exhausted
**And** the response body shape on create / list is the camelCase `Task { id, text, completed, createdAt, updatedAt }`.

**Given** integration tests via Elysia's in-process `.handle()`,
**When** `bun test` runs,
**Then** tests cover: empty list returns `[]`; create + list returns the created task; retry-with-same-id returns 200 + same task; retry-with-different-text returns 409; oversize text returns 400; missing fields return 400; rate-limit exhaustion returns 429 with required headers
**And** all error responses match the error envelope shape from Story 1.2.

### Story 1.5: Frontend Foundation — Solid App, Design Tokens, Eden Client, ErrorBoundary, LiveRegion

As a frontend developer,
I want the Solid app shell, complete design-token system, Eden client, error boundary, and LiveRegion primitive in place,
So that subsequent component stories can build against tokens and the app surfaces errors honestly.

**Acceptance Criteria:**

**Given** the frontend foundation,
**When** the story is complete,
**Then** `apps/web/src/index.tsx` mounts a Solid app, wraps it in TanStack Query's `QueryClientProvider` and a top-level `<ErrorBoundary>`
**And** `apps/web/src/data/api.ts` exports a single Eden Treaty client instance (`treaty<App>(...)`) typed via `import type { App } from "@bmad-todo-app/api"`
**And** `apps/web/src/data/uuid.ts` exports a hand-rolled UUIDv7 generator (~30 LOC, `crypto.getRandomValues()` + `Date.now()`) with a unit test asserting time-ordering, monotonicity within a single millisecond, and the expected version + variant bits
**And** `apps/web/src/data/keys.ts` exports the query-key constants (`["tasks"]`, etc.).

**Given** `apps/web/uno.config.ts` and `apps/web/src/styles/{tokens.css, reset.css}`,
**When** the story is complete,
**Then** the full design-token set from the UX spec is implemented (UX-DR1) — color (light + dark per spec tables), typography (`text.display / heading / body / body.strong / meta / caption`), spacing (`space.0` through `space.16`, 4 px base), radii (`radius.sm / md / full`), motion (`motion.instant / short / medium / long`)
**And** tokens are exposed both as UnoCSS rules and CSS custom properties on `:root` and `[data-theme="dark"]`
**And** `prefers-color-scheme` drives the active theme without any user toggle (UX-DR2)
**And** Inter is self-hosted as a variable woff2 (Latin subset, `font-display: swap`) with system-font-stack fallback (UX-DR3)
**And** an automated contrast test asserts `text.muted` ≥ 4.5:1 on `bg.canvas` and `bg.subtle` in both themes.

**Given** `apps/web/src/components/LiveRegion.tsx` and `ErrorBoundary.tsx`,
**When** the story is complete,
**Then** LiveRegion renders a visually-hidden `<div>` with `aria-live="polite"` and `aria-atomic="true"`, exposing an API to update its text content from anywhere in the app (UX-DR10)
**And** ErrorBoundary catches render errors and renders an inline FR6-style fallback (`"Something went wrong. Refresh to try again."`) instead of white-screening
**And** global `window.error` and `unhandledrejection` handlers log structured JSON to `console.error` with the same field shape as the backend logger (ARCH-AR13).

**Given** a hello-world App rendered into the foundation,
**When** the page loads,
**Then** the active theme (light or dark) is applied per `prefers-color-scheme`
**And** any focused element shows the spec'd 2 px `accent.default` focus ring with 2 px offset
**And** `prefers-reduced-motion: reduce` collapses non-instant animations to instant (UX-DR20).

### Story 1.6: TaskInput Component with Auto-Focus, Submit, and Character Counter

As a user,
I want a text input that's already focused on page load and accepts my task text via Enter,
So that I can capture a thought without clicking, hovering, or navigating any chrome.

**Acceptance Criteria:**

**Given** the TaskInput component,
**When** the page loads,
**Then** TaskInput renders a 48 px-tall single-line `<input>` with `aria-label="New task"`, placeholder `"What needs doing?"`, `maxlength="500"`, `autocomplete="off"`, `autocapitalize="sentences"`, `spellcheck="true"`
**And** the input is auto-focused on mount via a `ref` (FR18)
**And** the focus ring matches the spec (2 px `accent.default` outline with 2 px offset; FR19)
**And** the input has no visible label — the placeholder carries intent.

**Given** the user is typing in TaskInput,
**When** Enter is pressed with non-whitespace content,
**Then** the component invokes its `onSubmit` callback with the trimmed value
**And** clears its own value
**And** retains focus,
**When** Enter is pressed with empty or whitespace-only content,
**Then** nothing happens — no submit, no clear, no error
**When** Escape is pressed and the input has text,
**Then** the input clears and remains focused
**When** Shift+Enter is pressed,
**Then** nothing happens (reserved for future multiline).

**Given** the CharacterCounter component,
**When** the input has < 400 characters,
**Then** no counter is rendered (not in DOM)
**When** the input has ≥ 400 characters,
**Then** the counter renders as `{count} / 500` right-aligned below the input with `text.caption` `color.text.secondary`, `aria-live="polite"` (UX-DR5)
**When** the count reaches 500,
**Then** native `maxlength` rejects further keystrokes — the counter does not show an over-limit state.

**Given** component unit tests using `@solidjs/testing-library`,
**When** `bun test` runs,
**Then** the suite covers: auto-focus on mount, Enter-submits-trimmed, Enter-on-empty-no-op, Escape-clears, Shift+Enter-no-op, character-counter visibility threshold, `maxlength` enforcement
**And** axe-core assertions report zero critical violations on the rendered input.

### Story 1.7: Task List Display — TaskList, TaskRow (Active State), EmptyState, LoadingState

As a user,
I want to see my tasks in a list — a clear empty state if none, or a skeleton if loading is slow,
So that I always know what's in my list, including when there's nothing.

**Acceptance Criteria:**

**Given** the `useTasks` query hook,
**When** the story is complete,
**Then** `apps/web/src/data/queries.ts` exports `useTasks()` returning `{ data, isPending, error, refetch }` from TanStack Solid Query
**And** the query uses key `["tasks"]`, calls `api.api.tasks.get()` via Eden, and applies the architecture-locked config (`staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 2`).

**Given** TaskList rendered with `useTasks`,
**When** the fetch is pending and < 200 ms has elapsed,
**Then** nothing renders in the list area (avoiding loading flash)
**When** the fetch is pending and ≥ 200 ms has elapsed,
**Then** LoadingState renders three SkeletonRows at 100% / 75% / 60% widths with `aria-busy="true"` `aria-live="polite"` on the container
**And** under `prefers-reduced-motion: reduce` the shimmer is replaced with a static `bg.subtle` fill (UX-DR9, UX-DR20).

**Given** the fetch resolves with zero tasks,
**Then** EmptyState renders the single line `"No tasks yet. Start by typing above."` in `text.body` `color.text.secondary` — no icon / button / illustration (UX-DR8)
**Given** the fetch resolves with one or more tasks,
**Then** TaskList renders a `<ul role="list">` with one TaskRow per task in newest-first order
**And** each TaskRow renders the active state: Checkbox (empty circle), task text (`text.primary`, weight 400, two-line wrap before ellipsis), DeleteButton (opacity 0 default on desktop; opacity 1 on row hover, row focus, or `@media (hover: none)`)
**And** rows have `tabindex="0"` so they are arrow-key reachable in Epic 4.

**Given** component tests,
**When** `bun test` runs,
**Then** the suite covers each list state: pending-under-200 ms (no UI), pending-over-200 ms (skeletons), empty (EmptyState), populated (TaskRow per task)
**And** axe-core assertions report zero critical violations on each state
**And** responsive snapshots exist at the Compact, Expanded, and Large tiers (UX-DR18).

### Story 1.8: Optimistic Task Creation — Happy Path

As a user,
I want my task to appear in the list the instant I press Enter,
So that the app feels instant — there is never a perceived gap between Enter and the task being visible.

**Acceptance Criteria:**

**Given** the `useCreateTask` mutation hook,
**When** the story is complete,
**Then** `useCreateTask` exposes `mutate({ id, text })` where the caller passes a client-generated UUIDv7 + trimmed text
**And** `onMutate` performs an optimistic prepend: `queryClient.setQueryData(["tasks"], prev => [{ id, text, completed: false, createdAt, updatedAt }, ...(prev ?? [])])`
**And** `mutationFn` calls `api.api.tasks.post({ id, text })` via Eden and returns the parsed body on success
**And** `onSuccess` and `onSettled` perform no UI rollback and no list invalidation — the optimistic prepend already matches the idempotent server result.

**Given** TaskInput integrated with `useCreateTask`,
**When** the user types and presses Enter,
**Then** TaskInput generates a fresh UUIDv7 via `apps/web/src/data/uuid.ts`
**And** the new task appears at the top of the list with no animation (`motion.instant` per UX-DR16 — animation on insert reads as latency)
**And** the input clears and remains focused
**And** no toast, banner, or success announcement fires — silent success per UX-DR16.

**Given** integration / E2E tests,
**When** Playwright runs `e2e/capture.spec.ts`,
**Then** the test types a task, presses Enter, and asserts the task appears in the list and the input is cleared and focused, all within the optimistic window (no SyncIndicator visible)
**And** a `bun:test` covers the mutation hook's `onMutate` prepend and `mutationFn` invocation in isolation.

### Story 1.9: Sync-Pending Indicator and Retry-Exhausted State for Capture

As a user,
I want my created task to clearly indicate when it hasn't yet synced and to surface a clear, actionable error if retries exhaust,
So that I can trust the app to never silently lose my data.

**Acceptance Criteria:**

**Given** the `useCreateTask` retry policy,
**When** the story is complete,
**Then** failed POSTs retry with exponential backoff + jitter capped at 30 s (`Math.min(1000 * 2 ** attempt + jitter, 30_000)`); 429 responses honor `Retry-After` up to 4 attempts; 5xx retry up to 3 attempts; other 4xx fail-fast (ARCH-AR11)
**And** **`onError` does NOT roll back the optimistic insert** — the row stays in place; row-local sync state surfaces instead (FR27, UX-DR16).

**Given** the SyncIndicator sub-component on TaskRow,
**When** a row's mutation has been pending > 300 ms,
**Then** SyncIndicator renders inline between task text and DeleteButton — 14 × 14 px dashed circle rotating on a 1.5 s loop, color `color.status.pending` (neutral grey, not warning amber)
**And** under `prefers-reduced-motion: reduce` the rotation is removed; the static dashed circle remains (UX-DR20)
**And** LiveRegion announces `"Saving…"` once when SyncIndicator first appears
**And** LiveRegion announces `"Saved"` once when the mutation resolves successfully and SyncIndicator unmounts (FR22).

**Given** the retry-exhausted state on TaskRow,
**When** all retries fail,
**Then** the row background becomes `color.status.error.subtle`
**And** an inline ErrorMessage renders below the task text: `text.meta` `color.status.error` with copy `"Couldn't save — check connection."` (UX-DR22)
**And** a RetryAction `<button>` renders right-aligned at `text.meta` weight 500 `color.accent.default`, keyboard-reachable
**And** LiveRegion announces `"Couldn't save — check connection."` once
**And** task text remains at `color.text.primary` — the failure is about saving, not the content (FR26).

**Given** the user clicks or keyboard-activates RetryAction,
**When** the action fires,
**Then** the mutation resets and re-attempts with a fresh retry count
**And** the row state returns to sync-pending (or active on success).

**Given** unit + integration tests,
**When** `bun test` and Playwright (`e2e/error-recovery.spec.ts`) run,
**Then** tests cover: pending-after-300 ms shows SyncIndicator + announces "Saving…"; resolution unmounts SyncIndicator + announces "Saved"; retry-exhausted shows row background + ErrorMessage + RetryAction + announces error; Retry click resets to pending; no rollback occurs on failure (row stays in place — FR27).

### Story 1.10: List-Level Fetch Error State and Reconnection Recovery

As a user,
I want a clear, actionable in-list message if the task list fails to load — and the app to recover automatically when my connection returns,
So that I'm never left with a blank screen or a hidden failure.

**Acceptance Criteria:**

**Given** the `useTasks` query,
**When** the GET fails after 2 retries,
**Then** TaskList renders a list-level error state inline within the list area (not a modal): one neutral line of copy + a `Retry` text button (FR6, UX-DR17)
**And** the error state uses `text.body` `color.text.secondary`; no red banner, no page-background change
**And** the Retry button is keyboard-reachable; activating it triggers `refetch()`.

**Given** the user's network reconnects,
**When** the browser fires the `online` event,
**Then** TanStack Query's `refetchOnReconnect: true` config triggers an automatic refetch of `["tasks"]`
**And** the list-level error state clears once the refetch resolves successfully.

**Given** Playwright `e2e/empty-error-states.spec.ts`,
**When** the test runs against a backend stubbed to fail GET,
**Then** the inline error renders, the page has not white-screened, and clicking Retry attempts another fetch
**And** axe-core reports zero critical violations on the error state.

### Story 1.11: End-to-End Single-Service Container Deployment

As a reviewer or new developer,
I want to clone the repo and run `docker compose up` to reach a fully working application with persistent data,
So that the deploy promise (FR32–FR34) is actually true on a clean machine.

**Acceptance Criteria:**

**Given** the Elysia backend,
**When** the story is complete,
**Then** the Elysia app serves `apps/web/dist/` static assets and a SPA catch-all fallback — any path not matching `/api/*` and not a real file in `dist/` returns `index.html`
**And** the multi-stage Dockerfile uses `oven/bun:1.3.11-alpine` for runtime, builds the SPA with Vite during the build stage, and runs `bun apps/api/src/index.ts` as the container CMD (ARCH-AR15)
**And** `compose.yaml` defines a single `app` service exposing port 3000 with a named volume `tasks-data` mounted at `/data` and `DATABASE_PATH=/data/tasks.db`.

**Given** a fresh clone with no local state,
**When** the developer runs `docker compose up`,
**Then** the build completes, the container starts, `/health` returns 200 once migrations apply (FR31, NFR-R5)
**And** opening `http://localhost:3000/` shows the app with TaskInput auto-focused and the empty state visible (FR4, FR18)
**And** typing a task and pressing Enter creates the task and persists it to `/data/tasks.db` inside the volume (FR1, FR23, FR11).

**Given** a running container with one or more tasks created,
**When** the developer runs `docker compose down` then `docker compose up` again,
**Then** the previously-created tasks are still present (FR34 — restart-without-loss)
**And** `docker compose logs` emits structured JSON request lines per request and a startup line per boot (FR33).

**Given** the Playwright `e2e/` directory,
**When** the test suite runs against the running container,
**Then** all five Playwright spec files exist in `e2e/` per the architecture: `capture.spec.ts`, `manage.spec.ts`, `keyboard.spec.ts`, `error-recovery.spec.ts`, `empty-error-states.spec.ts` (NFR-M2)
**And** the `capture.spec.ts`, `error-recovery.spec.ts`, and `empty-error-states.spec.ts` specs have meaningful assertions at this point (the others are stubs to be filled by Epics 2–4)
**And** axe-core assertions report zero critical violations across the running specs (NFR-A1, NFR-A2).

---

## Epic 2: Task Completion

**Goal:** Add the toggle action — both as click-on-checkbox and Space-on-focused-row — plus the completed-task visual treatment. Reuse the SyncIndicator and retry-exhausted primitives from Epic 1.

### Story 2.1: Backend PATCH `/api/tasks/:id` for Completion Toggle

As a frontend developer,
I want a stable PATCH endpoint that updates a task's completion status idempotently,
So that toggle retries from a flaky network produce the same end state without ambiguity.

**Acceptance Criteria:**

**Given** the API,
**When** the story is complete,
**Then** `apps/api/src/routes/tasks.ts` exposes `PATCH /api/tasks/:id` accepting a body validated by `t.Object({ completed: t.Boolean() })`
**And** the body is **target state, not action** — repeated requests with the same body produce the same end state without flipping back (FR29, ARCH-AR7)
**And** the response body is the updated camelCase `Task { id, text, completed, createdAt, updatedAt }`
**And** `updatedAt` is set to the current unix-ms on each successful update.

**Given** the endpoint,
**When** invoked with an `:id` that does not match a task,
**Then** the response is `404 not_found` matching the error envelope
**When** the body fails validation,
**Then** the response is `400 validation_error`
**When** the rate-limit bucket is exhausted,
**Then** the response is `429 rate_limited` with the standard rate-limit headers.

**Given** the `taskRepo.update` method,
**When** invoked,
**Then** it executes a single atomic SQL `UPDATE` statement (NFR-R3)
**And** if no row matches the id, returns null and the route emits 404
**And** snake_case columns are translated to camelCase response keys at the storage boundary.

**Given** integration tests via `app.handle()`,
**When** `bun test` runs,
**Then** the suite covers: toggle false → true → repeat-true (target-state idempotency); toggle on missing id → 404; toggle with bad body → 400; toggle under rate-limit pressure → 429
**And** repository tests run against `:memory:` and assert the actual SQL path
**And** all error responses match the error envelope shape from Story 1.2.

### Story 2.2: Frontend Toggle — Checkbox Sub-Component, Optimistic Mutation, Completed Visual Treatment

As a user,
I want to click a task's checkbox and see it instantly become completed (or active again), with a clear visual distinction from active tasks,
So that I can clear my done items at a glance without waiting for the network.

**Acceptance Criteria:**

**Given** the Checkbox sub-component on TaskRow,
**When** the story is complete,
**Then** the Checkbox renders as a 20 × 20 px circle with 2 px border in `color.border.strong` when active (transparent fill)
**And** when completed, the Checkbox fills with `color.accent.default` and shows an inset white checkmark (SVG, no emoji)
**And** the Checkbox has `role="checkbox"` `aria-checked="true|false"`, is in the natural Tab order, exposes a hover state (border transitions to `color.accent.default`), and renders the spec'd focus ring when focused (UX-DR7)
**And** on `@media (hover: none)` the Checkbox renders without hover styling (UX-DR19).

**Given** a click on the Checkbox,
**When** activated,
**Then** the Checkbox flips state via `useToggleTask` mutation
**And** the row's task text transitions to `color.text.muted` with `text-decoration: line-through` (1 px thickness) on `motion.short` (120 ms ease-out)
**And** under `prefers-reduced-motion: reduce` the transition is instant (UX-DR20)
**And** strike-through *and* muted color are applied together — non-color signaling per WCAG 1.4.1 (FR3)
**And** the row's position in the list does not change — completion does not re-sort (FR9, UX-DR14).

**Given** the `useToggleTask` mutation,
**When** invoked,
**Then** `onMutate` performs an optimistic update: set `completed` to the target state on the cached row (FR23)
**And** the mutation calls Eden `api.api.tasks({ id }).patch({ completed })`
**And** sync-pending and retry-exhausted states reuse the SyncIndicator + ErrorMessage + RetryAction primitives from Story 1.9 — no new components introduced
**And** `onError` does not roll back the optimistic toggle (FR27, UX-DR16) — failures surface row-local.

**Given** completed-state contrast validation,
**When** the test suite runs,
**Then** an automated contrast check asserts `text.muted` ≥ 4.5:1 against both `bg.canvas` and `bg.subtle` (the row hover background) in both light and dark themes
**And** the test fails CI if either contrast falls below threshold (NFR-A1).

**Given** Playwright `e2e/manage.spec.ts`,
**When** the test runs,
**Then** the spec asserts: clicking the Checkbox flips active → completed visually within the optimistic window; clicking again flips back; the task remains in its original list position (FR9 — no re-sort)
**And** axe-core reports zero critical violations on the row in completed state (NFR-A2).

### Story 2.3: Keyboard Toggle — Space on Focused Row + LiveRegion Announcements

As a keyboard-first user,
I want to press Space on a focused task row to toggle its completion,
So that I never have to leave the keyboard to mark something done.

**Acceptance Criteria:**

**Given** a TaskRow with `tabindex="0"` focused via Tab,
**When** Space is pressed,
**Then** the row's completion is toggled via the same `useToggleTask` mutation as click (FR15)
**And** the visible focus ring remains on the row — focus is not disrupted by the toggle
**And** the row's position in the list does not change (FR9).

**Given** focus is specifically on the Checkbox sub-component (Tab into the row's checkbox),
**When** Space is pressed,
**Then** the Checkbox's native button/checkbox semantics fire and toggle
**And** the row-level Space handler does not double-fire — the event is consumed by the checkbox.

**Given** the LiveRegion,
**When** a toggle mutation enters sync-pending, resolves, or exhausts retries,
**Then** the existing LiveRegion announcements from Story 1.9 fire (`"Saving…"` / `"Saved"` / `"Couldn't save — check connection."`) — no new announcement strings added (FR22)
**And** repeated toggles within a short window do not produce announcement spam — the announce-once-per-transition rule from Story 1.9 holds.

**Given** Playwright `e2e/manage.spec.ts` and `e2e/keyboard.spec.ts`,
**When** the suites run,
**Then** at least one assertion exercises Space-on-focused-row toggle without using `.click()`
**And** the keyboard-only verification confirms: Tab into list → Space toggles → focus remains on the same row → the visible focus ring is on the toggled row at every checkpoint
**And** axe-core reports zero critical violations in the toggled-via-keyboard state.

---

## Epic 3: Task Deletion with Undo

**Goal:** Resolve FR10 with the UX-spec pattern — immediate delete + 5 s UndoSnackbar + Cmd/Ctrl+Z. Deliver mouse, touch, and per-action keyboard paths. Add the focus-landing-after-delete rule. Concurrent-delete collapsing and restore-at-original-position semantics.

### Story 3.1: Backend DELETE `/api/tasks/:id` (Idempotent)

As a frontend developer,
I want a DELETE endpoint that returns 204 even when the task no longer exists,
So that delete retries on a flaky network never produce a confusing 404 the user has to interpret.

**Acceptance Criteria:**

**Given** the API,
**When** the story is complete,
**Then** `DELETE /api/tasks/:id` deletes the matching row and returns `204 No Content` (ARCH-AR7)
**And** if no row matches the id, the response is still `204` — idempotent (FR29)
**And** the endpoint is rate-limited like other `/api/*` routes; 429 responses include the standard rate-limit headers.

**Given** the `taskRepo.delete` method,
**When** invoked,
**Then** it executes a single atomic SQL `DELETE` statement (NFR-R3)
**And** integration tests via `app.handle()` cover: delete-existing → 204; delete-missing → 204; delete under rate-limit pressure → 429.

### Story 3.2: Frontend Delete — DeleteButton, Optimistic Removal, Animated Row-Out, Focus-Landing Rule

As a user,
I want to click a task's delete button and see it animate out, with focus landing predictably on the next logical task,
So that I can clear stale items without losing my place in the list.

**Acceptance Criteria:**

**Given** the DeleteButton sub-component on TaskRow,
**When** the story is complete,
**Then** DeleteButton renders a 16 × 16 px trash icon (SVG, no emoji) on the right edge of the row (UX-DR7, UX-DR22)
**And** the desktop default state is `opacity: 0` — present in DOM and tab order, visually hidden
**And** on row hover or row focus, opacity transitions to 1 with color `color.text.muted`; on icon hover or focus, color shifts to `color.status.error`
**And** on `@media (hover: none)` (touch), DeleteButton is always opacity 1 with color `color.text.muted` (UX-DR19)
**And** DeleteButton has `aria-label="Delete task"` and the spec'd focus ring when focused.

**Given** a click on DeleteButton,
**When** activated,
**Then** `useDeleteTask` mutation fires with optimistic removal of the row from the `["tasks"]` cache (FR23)
**And** the row animates out on `motion.medium` (180 ms ease-out)
**And** under `prefers-reduced-motion: reduce` the removal is instant (UX-DR20)
**And** the mutation calls Eden `api.api.tasks({ id }).delete()` and retries failed DELETEs with the same backoff policy as other mutations (Story 1.9)
**And** the no-rollback contract holds — on retry exhaustion the row stays optimistically removed; subsequent refetches reconcile with server truth (FR27, UX-DR16).

**Given** the focus-landing-after-delete rule,
**When** any row is deleted (via click, keyboard, or undo-replacement),
**Then** focus moves per the rule (UX-DR13): (1) if the deleted row had a row below it → focus the row that was below (now at the deleted row's position); (2) else if it had a row above → focus the row above; (3) else (it was the only row) → focus TaskInput
**And** focus never dumps to the document body.

**Given** Playwright `e2e/manage.spec.ts`,
**When** the test runs,
**Then** the spec asserts: clicking DeleteButton removes the row visually within the optimistic window; focus lands per the focus-landing rule (verified for each of the three branches); the row stays gone after the optimistic window resolves
**And** axe-core reports zero critical violations after delete (NFR-A2).

### Story 3.3: Keyboard Delete — Delete and Backspace on Focused Row + LiveRegion Announcements

As a keyboard-first user,
I want to press Delete or Backspace with a row focused to delete it, with a screen-reader announcement that names the undo path,
So that I never have to reach for the mouse to clear out tasks, and undo discoverability survives without visual chrome.

**Acceptance Criteria:**

**Given** a TaskRow focused via Tab,
**When** Delete or Backspace is pressed (with focus on the row container, not on TaskInput),
**Then** the row is deleted via the same `useDeleteTask` mutation as click (FR16)
**And** focus lands per the focus-landing-after-delete rule from Story 3.2
**And** the row animates out on `motion.medium` (or instant under reduced-motion).

**Given** the LiveRegion,
**When** a delete fires (via click or keyboard),
**Then** on the **first** delete in a session, LiveRegion announces `"Task deleted. Press Command-Z to undo."` (UX-DR10, UX-DR15)
**And** on **subsequent** deletes in the same session, LiveRegion announces `"Task deleted"` to avoid repetition
**And** on non-macOS platforms, the first-delete announcement substitutes `"Control-Z"` (detection via `navigator.platform` or equivalent, performed once at mount)
**And** rapid concurrent deletes within the UndoSnackbar window collapse to a single `"N tasks deleted"` announcement (the snackbar collapsing is implemented in Story 3.4; this story emits whichever announcement is correct given the count).

**Given** Playwright `e2e/keyboard.spec.ts`,
**When** the test runs,
**Then** the keyboard-only spec exercises: Tab into row → Delete key → row removes → focus lands correctly per the rule
**And** the same flow with Backspace produces the same result
**And** axe-core reports zero critical violations after a keyboard-driven delete.

### Story 3.4: UndoSnackbar with Cmd/Ctrl+Z, Concurrent-Delete Collapsing, Restore-at-Original-Position

As a user,
I want a 5-second window to undo any delete via a visible snackbar or Cmd/Ctrl+Z,
So that an accidental delete is reversible without confirmation dialogs that would break the keyboard flow.

**Acceptance Criteria:**

**Given** the UndoSnackbar component,
**When** any delete mutation fires,
**Then** UndoSnackbar appears at bottom-center on desktop / bottom of content column on mobile (UX-DR11)
**And** renders `"Task deleted"` plus an `Undo` button
**And** auto-dismisses after 5 seconds
**And** has `role="status"` and `aria-live="polite"`
**And** the Undo button is keyboard-reachable as a `<button>` with the spec'd focus ring applied.

**Given** an active UndoSnackbar,
**When** Cmd+Z (macOS) or Ctrl+Z (other platforms) is pressed within the 5-second window,
**Then** the same undo action fires as clicking the Undo button (UX-DR15)
**And** after the 5-second window expires, Cmd/Ctrl+Z is a no-op for this app — the deleted task is permanently gone from the user's perspective
**And** platform detection happens once at mount (not per keystroke).

**Given** an undo action firing (via button or shortcut),
**When** the undo executes,
**Then** the deleted task is restored at its **original** list position — preserving creation order, *not* placed at the top (UX-DR14)
**And** focus lands on the restored TaskRow (UX-DR13)
**And** the UndoSnackbar dismisses immediately
**And** the `useUndoDelete` mutation issues a fresh `POST /api/tasks` with the original task's `id`, `text`, `createdAt` — `INSERT OR IGNORE` semantics from Story 1.4 make this idempotent if the original DELETE had not yet succeeded.

**Given** rapid successive deletes within the snackbar's 5-second window,
**When** subsequent deletes fire,
**Then** the existing snackbar's content collapses to `"N tasks deleted"` with a single Undo (UX-DR15)
**And** clicking Undo (or Cmd/Ctrl+Z) restores **all** collapsed deletes at their original positions in one operation
**And** the LiveRegion announces `"N tasks deleted"` (per Story 3.3's collapsing behavior)
**And** the restored tasks regain their original list ordering relative to each other.

**Given** Playwright `e2e/manage.spec.ts`,
**When** the test runs,
**Then** the suite exercises: delete → snackbar appears → click Undo within window → task restored at original position; delete → wait 6 s → Cmd/Ctrl+Z is a no-op; concurrent deletes → single snackbar reads `"N tasks deleted"` → single Undo restores all
**And** axe-core reports zero critical violations on the snackbar (NFR-A2).

---

## Epic 4: Keyboard-First Navigation

**Goal:** Layer the cross-row keyboard navigation that delivers Journey 3 (keyboard-only power user). Until this epic, keyboard users can Tab into rows and operate per-action keys (Enter, Space, Delete) but cannot fluidly move between rows. This epic closes that gap and audits the visible-focus contract across every interactive element.

### Story 4.1: Arrow Up / Down + j / k Row Navigation

As a keyboard-first user,
I want to press Arrow Down (or `j`) and Arrow Up (or `k`) to move focus between tasks,
So that I can scan and operate the list without leaving the keyboard.

**Acceptance Criteria:**

**Given** focus is on TaskInput,
**When** Arrow Down is pressed,
**Then** focus moves to the first TaskRow in the list (FR17, UX-DR12)
**And** if the list is empty, the press is a no-op (focus stays on TaskInput).

**Given** focus is on a TaskRow,
**When** Arrow Down or `j` is pressed,
**Then** focus moves to the next TaskRow
**And** at the bottom of the list, the press is a no-op (focus stays on the last row),
**When** Arrow Up or `k` is pressed,
**Then** focus moves to the previous TaskRow
**And** at the top of the list, focus moves to TaskInput.

**Given** the keyboard navigation,
**When** any state change (toggle, sync indicator appearing or disappearing, retry-exhausted) occurs while focus is on a row,
**Then** focus stays on the same row — focus is not disrupted by row-local visual changes (UX-DR13).

**Given** Playwright `e2e/keyboard.spec.ts`,
**When** the test runs,
**Then** the spec exercises arrow navigation, the `j` / `k` aliases, and boundary behavior at the top and bottom of the list — all without using `.click()`
**And** the visible focus ring is asserted at every step (NFR-A1).

### Story 4.2: Tab Order Within and Between Rows

As a keyboard-first user,
I want Tab to move predictably through the row's interactive parts (Checkbox → RetryAction → DeleteButton) and across rows,
So that I can reach every action without arrow keys when I prefer Tab discipline.

**Acceptance Criteria:**

**Given** focus is on a TaskRow (the row container itself),
**When** Tab is pressed,
**Then** focus moves to the row's Checkbox (UX-DR12)
**When** Tab is pressed again,
**Then** focus moves to the row's RetryAction button if present (only in retry-exhausted state)
**When** Tab is pressed again,
**Then** focus moves to the DeleteButton
**When** Tab is pressed again,
**Then** focus moves to the next row's first focusable element (the next row's container or its Checkbox)
**And** Shift+Tab reverses the sequence in every case.

**Given** state changes on a row (active → completed, sync-pending appearing or unmounting),
**When** any state change occurs,
**Then** the Tab order is unchanged — state changes never alter tab order
**And** the SyncIndicator is non-focusable (it is a status, not an action) regardless of state.

**Given** Playwright `e2e/keyboard.spec.ts`,
**When** the test runs,
**Then** the spec walks Tab order through a populated list with at least one row in retry-exhausted state and asserts the documented order is preserved
**And** Shift+Tab reverses correctly through the same elements.

### Story 4.3: Escape and `i` Shortcut to Return Focus to TaskInput

As a keyboard-first user,
I want a one-key way back to the input regardless of where I am in the list,
So that I can capture a new thought immediately without arrow-traversing back to the top.

**Acceptance Criteria:**

**Given** focus is on any TaskRow, DeleteButton, RetryAction, or UndoSnackbar Undo button,
**When** Escape is pressed,
**Then** focus returns to TaskInput (UX-DR12, UX-DR13)
**And** TaskInput's existing value (if any) is preserved — Escape on a row does **not** clear the input (Escape clears only when fired on TaskInput itself, per Story 1.6).

**Given** focus is on any TaskRow, DeleteButton, RetryAction, or UndoSnackbar Undo button (i.e. not TaskInput itself),
**When** the lowercase `i` key is pressed,
**Then** focus returns to TaskInput without appending a character — the `i` is consumed as a shortcut (UX-DR12)
**And** when focus is already on TaskInput, pressing `i` types `i` normally — the shortcut is scoped per WCAG 2.1.4 (Character Key Shortcuts)
**And** when focus is outside the app entirely, `i` does nothing app-related.

**Given** Playwright `e2e/keyboard.spec.ts`,
**When** the test runs,
**Then** the spec exercises Escape and `i` from each scoped context (TaskRow, DeleteButton, RetryAction, UndoSnackbar Undo) and asserts focus lands on TaskInput each time
**And** typing `i` into TaskInput appends `i` normally without refocusing.

### Story 4.4: Typing-Anywhere-Captures

As a keyboard-first user,
I want any printable keystroke while a task row is focused to route to the input and append the character,
So that I never silently lose a thought I started typing in the wrong place.

**Acceptance Criteria:**

**Given** focus is on a TaskRow (or any sub-action: DeleteButton, RetryAction, UndoSnackbar Undo button),
**When** a printable character is pressed *that is not* one of the bound shortcuts (Space, Delete, Backspace, Escape, Tab, Shift+Tab, arrows, `i`, `j`, `k`, Cmd/Ctrl+Z),
**Then** focus moves to TaskInput (UX-DR12)
**And** the character is appended to TaskInput's current value
**And** TaskInput's caret is positioned at the end of the new value.

**Given** the typing-anywhere precedence rule,
**When** Space, Delete, Backspace, Escape, Tab, Shift+Tab, arrow keys, `i`, `j`, or `k` are pressed,
**Then** their bound shortcut behavior wins — typing-anywhere does not fire and the key is not appended to TaskInput
**And** Cmd/Ctrl+Z fires the undo handler (Story 3.4) regardless of focus.

**Given** Playwright `e2e/keyboard.spec.ts`,
**When** the test runs,
**Then** the spec exercises: Tab into a row → press `q` → focus moves to input, value becomes `q`; press `Q` (capital) → value becomes `qQ`; press number / punctuation → appends; press Space (bound) → toggles, does not append; press `j` (bound) → navigates, does not append.

### Story 4.5: Focus Ring Audit and Keyboard-Only Playwright Spec

As an accessibility-conscious user,
I want every interactive element on the app to expose a visible focus indicator that meets the contrast and offset spec, with the keyboard-only journey verified end-to-end in CI,
So that I can never lose track of where my keyboard is — and the app's keyboard-first promise is regression-tested on every PR.

**Acceptance Criteria:**

**Given** a complete component audit,
**When** the audit runs,
**Then** every interactive element in the app — TaskInput, Checkbox, DeleteButton, RetryAction, UndoSnackbar Undo button, TaskRow container, list-level Retry button — exposes the spec'd focus ring (2 px `accent.default` outline with 2 px offset, ≥ 3:1 contrast against all surfaces in both themes — WCAG 2.4.7, 2.4.11) (FR19, UX-DR1)
**And** the focus ring is never replaced by a lower-contrast outline-only fallback that may fail against specific surfaces
**And** an automated test walks every focusable element in a populated app and asserts the computed `outline` matches the spec.

**Given** the keyboard-only Playwright spec `e2e/keyboard.spec.ts`,
**When** the test runs,
**Then** the spec performs Journey 3 end-to-end without using `.click()` even once: Tab/arrow into list, navigate via `j` / `k`, toggle via Space, delete via Delete, undo via Cmd/Ctrl+Z, Escape back to input, type-anywhere appends — covering every shortcut from the keyboard-shortcut-set table (UX-DR12)
**And** the spec asserts the visible focus ring is on the expected element at every checkpoint
**And** the spec runs as part of `bun run check:release` and counts toward the ≥ 5 Playwright tests required by NFR-M2.

**Given** axe-core assertions,
**When** the keyboard-only spec runs,
**Then** zero critical violations are reported in any state — active, completed, sync-pending, retry-exhausted, undo-snackbar-visible (NFR-A1, NFR-A2).

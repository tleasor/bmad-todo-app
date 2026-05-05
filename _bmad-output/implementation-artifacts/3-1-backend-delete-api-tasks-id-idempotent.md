# Story 3.1: Backend DELETE `/api/tasks/:id` (Idempotent)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a frontend developer,
I want a DELETE endpoint that returns 204 even when the task no longer exists,
So that delete retries on a flaky network never produce a confusing 404 the user has to interpret.

## Acceptance Criteria

1. **`DELETE /api/tasks/:id` route is added to `apps/api/src/routes/tasks.ts`** — The route accepts a path param validated by `t.Object({ id: t.String() })`. Returns `204 No Content` with no response body on success. **The response is always 204** regardless of whether the id matched a row — idempotent per FR29. Rate-limited like all other `/api/*` routes.

2. **`taskRepo.delete()` is fully implemented in `apps/api/src/storage/tasks.ts`** — The stub (`throw new Error("taskRepo.delete: implemented in Story 3.1")`) is replaced. Executes a single atomic `DELETE FROM tasks WHERE id = ?` statement (NFR-R3). Returns `true` if a row was deleted, `false` if no row matched. The route does **not** branch on this return value — it is always 204.

3. **Idempotent on missing id** — `DELETE /api/tasks/nonexistent-id` returns `204 No Content`, not 404. The endpoint is a "fire and forget" that always succeeds from the client's perspective.

4. **429 `rate_limited` when per-IP token bucket is exhausted** — Rate-limit middleware already applied to all `/api/*` routes. Returns `429 rate_limited` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers. No route-level changes needed for rate limiting.

5. **`taskRepo.deleteAll()` is implemented as a dev-only bulk-reset method** — Added to `TaskRepo` type and `createTaskRepo`. Executes `DELETE FROM tasks` with no WHERE clause. Returns `void`. Used exclusively by the test-mode fixture-reset route. **Do not call from production code paths.**

6. **Dev-only `DELETE /api/tasks` fixture-reset route** — Added to `tasksRoute`, gated by `env.IS_DEV`. When `IS_DEV` is `true`, the endpoint deletes all tasks and returns `204 No Content`. When `IS_DEV` is `false` (production), the handler throws `new AppError("not_found", "Not found")`, mapping to HTTP 404. No `:id` param — this is the collection route, not the single-resource route.

7. **Integration tests via `app.handle()` cover all DELETE cases** — Added to `apps/api/src/routes/tasks.test.ts` under a new `describe("DELETE /api/tasks/:id")` block. Must cover: delete-existing → 204 with empty body; delete-missing → 204 (idempotent); rate-limit exhaustion → 429 with headers and envelope. And a `describe("DELETE /api/tasks (dev fixture reset)")` block covering: deletes all rows → 204; runs in IS_DEV mode; (optional) returns 404 in prod mode.

8. **Repository unit tests cover the SQL path** — Added to `apps/api/src/storage/tasks.test.ts`. The stub test `"delete throws (Story 3.1)"` is replaced with a real `describe("delete")` block. Must cover: `delete()` returns `true` when row existed; `delete()` returns `false` for unknown id (idempotent at repo level); row is actually gone after delete (count check); `deleteAll()` removes all rows. Tests run against `:memory:` DB via `createTaskRepo`.

9. **All existing tests continue to pass** — No regressions on the 224 tests from Stories 1.1–2.3. The `"delete throws (Story 3.1)"` stub test in `tasks.test.ts` is the only removal (replaced by real tests). The `describe("stubs deferred to later stories")` wrapper can be removed if it is now empty.

10. **E2E fixture isolation wired for `capture.spec.ts`** — `e2e/capture.spec.ts` gains a `test.beforeEach` that calls `DELETE /api/tasks` to reset the database. The `"two captures land newest-first in the list"` test must add `await waitForListSettled(page)` after `page.goto("/")` (matching the guard used in test 5.1 `"capture happy path"`). This resolves the preCount race class documented in deferred-work.md under Stories 1.8 and 1.11.

11. **`bun run check` passes clean** — oxlint zero warnings, oxfmt clean, tsgo `-b --noEmit` clean, dep-count unchanged (root 6/25, web 17/25, api 2/25). No new dependencies.

## Tasks / Subtasks

- [x] **Task 1 — Implement `taskRepo.delete()` and `taskRepo.deleteAll()` in `apps/api/src/storage/tasks.ts`** (AC: #2, #5)
  - [x] Replace the `remove` stub body with: `db.run("DELETE FROM tasks WHERE id = ?", [id])` — capture `result.changes`; return `result.changes > 0`
  - [x] Remove the underscore prefix from `_id` (parameter is no longer unused)
  - [x] Add `deleteAll(): void` to the `TaskRepo` type declaration at the top of the file
  - [x] Add `deleteAll` implementation inside `createTaskRepo`: `db.exec("DELETE FROM tasks")`; return type `void`
  - [x] Wire `deleteAll` through the lazy singleton proxy at the bottom of the file (alongside `list`, `get`, `create`, `update`, `delete`)

- [x] **Task 2 — Add DELETE routes to `apps/api/src/routes/tasks.ts`** (AC: #1, #3, #4, #6)
  - [x] Import `env` at the top: `import { env } from "../env";`
  - [x] Chain `.delete("/api/tasks/:id", handler, { params: t.Object({ id: t.String() }) })` after the existing `.patch(...)` chain
  - [x] Handler signature: `({ params, set }) => { ... }` — call `taskRepo.delete(params.id)` (result ignored); set `set.status = 204`; return nothing (no body)
  - [x] Chain `.delete("/api/tasks", handler)` for the fixture-reset route (no params schema needed)
  - [x] Fixture-reset handler: `({ set }) => { if (!env.IS_DEV) throw new AppError("not_found", "Not found"); taskRepo.deleteAll(); set.status = 204; }`

- [x] **Task 3 — Add repository unit tests to `apps/api/src/storage/tasks.test.ts`** (AC: #8, #9)
  - [x] Replace the `it("delete throws (Story 3.1)", ...)` stub test with a `describe("delete", ...)` block
  - [x] Test: `delete()` returns `true` when the row existed
  - [x] Test: `delete()` returns `false` for a non-existent id (idempotent at repo level)
  - [x] Test: row count is 0 after deleting the only task (SQL actually ran)
  - [x] Test: `deleteAll()` removes all rows (insert 3, deleteAll, list returns [])
  - [x] Remove `describe("stubs deferred to later stories")` wrapper if now empty; keep if future story stubs appear (check — there are none beyond 3.1 in this file)

- [x] **Task 4 — Add integration tests to `apps/api/src/routes/tasks.test.ts`** (AC: #7, #9)
  - [x] Add a `del` helper function alongside `get`, `post`, and `patch`: takes `app`, `id: string`, `ip?: string`; constructs `DELETE http://localhost/api/tasks/${id}` request with `x-forwarded-for` header
  - [x] Add a `delAll` helper: takes `app`, `ip?: string`; constructs `DELETE http://localhost/api/tasks` request
  - [x] Add `describe("DELETE /api/tasks/:id", ...)` block with tests:
    - `it("returns 204 when the task exists")`
    - `it("returns 204 when the id does not exist (idempotent)")`
    - `it("returns 429 rate_limited with rate-limit headers after burst exhaustion")`
  - [x] Add `describe("DELETE /api/tasks (dev fixture reset)", ...)` block:
    - `it("returns 204 and removes all tasks when IS_DEV is true")` — the `beforeEach` already sets `IS_DEV=true` effectively via the test app setup; since `env.IS_DEV` is `true` in test mode (NODE_ENV !== "production"), this works without mocking
    - Verify by inserting a task, calling `delAll(app)`, then `get(app)` returns empty array

- [x] **Task 5 — Update E2E fixture isolation in `e2e/capture.spec.ts`** (AC: #10)
  - [x] Add `test.beforeEach(async ({ request }) => { await request.delete("/api/tasks"); })` near the top of the file, before the first `test(...)` definition. The Playwright `request` fixture uses `baseURL: "http://localhost:5173"` (from `playwright.config.ts`); Vite dev server proxies `/api` to `http://localhost:3000` (see `apps/web/vite.config.ts`), so the relative path resolves correctly to the Elysia endpoint.
  - [x] In the `"two captures land newest-first in the list"` test, add `await waitForListSettled(page)` after `await page.goto("/")` (same guard used by the first test in the file)

- [x] **Task 6 — Resolve pre-epic-3 `INSERT OR IGNORE` invariant** (AC: implied by deferred-work.md #pre-epic-3)
  - [x] Add a one-line comment to the `create()` function in `storage/tasks.ts` at the `if (!task)` guard: explain that the "task missing" invariant path is unreachable under single-writer SQLite; a concurrent delete between INSERT and SELECT would violate the WAL single-writer serialization guarantee
  - [x] This is a documentation decision only — no behavior change

- [x] **Task 7 — Quality gate verification** (AC: #11)
  - [x] Run `bun run check` — must pass: oxlint, oxfmt, tsgo, dep-count
  - [x] Run `bun run check:full` — must pass: all tests (224 + ~9 new - 1 stub = ~232), coverage ≥70%, audit, build, bundle-size
  - [x] Confirm dep counts: root 6/25, web 17/25, api 2/25 — no new deps

## Dev Notes

### Critical Context

This is the **first story of Epic 3**. It is a pure backend story — no frontend code changes. The only files that change are in `apps/api/src/` and `e2e/`.

The implementation is deliberately small. `taskRepo.delete()` is already stubbed in `storage/tasks.ts` and wired through the lazy singleton. The route file imports `taskRepo` and has the full middleware stack. This story also resolves three `[pre-epic-3]` items from `deferred-work.md`: the fixture-reset hook, the `INSERT OR IGNORE` invariant decision, and the `capture.spec.ts` preCount race.

**This story is a prerequisite for all frontend delete work in Stories 3.2–3.4.** The fixture-reset endpoint added here unblocks reliable E2E testing for the entire remaining Epic 3 arc.

### Files Being Modified — Current State

**`apps/api/src/storage/tasks.ts`** (current stub at lines 88–91):
```ts
// implemented in Story 3.1
const remove = (_id: string): boolean => {
  throw new Error("taskRepo.delete: implemented in Story 3.1");
};
```
- `db.run()` returns `{ changes: number }` — same pattern used by `update()` (lines 79–86)
- `TaskRepo` type at line 26 already declares `delete: (id: string) => boolean` — no type change needed for `delete`
- `deleteAll` must be added to `TaskRepo` type AND to the singleton proxy

**`apps/api/src/routes/tasks.ts`** (current full chain: GET, POST, PATCH):
- `tasksRoute` is a chained `Elysia()` instance — chain `.delete("/api/tasks/:id", ...)` after `.patch(...)`
- `AppError` and `taskRepo` are already imported
- `env` is NOT currently imported — must add `import { env } from "../env";`
- The fixture-reset route chains after the single-resource DELETE route: `.delete("/api/tasks", ...)`
- **Route ordering matters**: Elysia matches routes in registration order. Put `DELETE /api/tasks` (no param) BEFORE `DELETE /api/tasks/:id` (with param) to avoid the wildcard swallowing the collection route. Actually Elysia uses exact-match over wildcard, so order shouldn't matter — but registering exact before param is the conventional safety pattern.

**`apps/api/src/storage/tasks.test.ts`** (stub test at the end of `describe("taskRepo")`):
```ts
describe("stubs deferred to later stories", () => {
  it("delete throws (Story 3.1)", () => {
    expect(() => repo.delete("some-id")).toThrow(/Story 3.1/);
  });
});
```
The entire `describe("stubs deferred to later stories")` block can be removed once the delete stub is replaced — there are no other deferred stubs for later stories in this file.

**`apps/api/src/routes/tasks.test.ts`** (existing helpers at lines 36–72):
```ts
const post = async (app, body, ip) => ...
const get = async (app, ip) => ...
const patch = async (app, id, body, ip) => ...
```
Add `del` and `delAll` helpers following the same pattern.

**`e2e/capture.spec.ts`** — the `waitForListSettled` helper is already defined in this file. The `"two captures land newest-first"` test is missing the guard.

### Exact SQL

```ts
// taskRepo.delete()
const remove = (id: string): boolean => {
  const result = db.run(`DELETE FROM tasks WHERE id = ?`, [id]);
  return result.changes > 0;
};

// taskRepo.deleteAll()
const deleteAll = (): void => {
  db.exec(`DELETE FROM tasks`);
};
```

Note: `db.exec()` is used for `deleteAll` (no parameterized input, no return value needed). `db.run()` is used for the single-id delete (parameterized, need `changes`).

### Exact Route Handlers

```ts
// Single-resource DELETE — always 204, idempotent
.delete(
  "/api/tasks/:id",
  ({ params, set }) => {
    taskRepo.delete(params.id);
    set.status = 204;
  },
  {
    params: t.Object({ id: t.String() }),
  },
)

// Collection DELETE — dev-only fixture reset
.delete(
  "/api/tasks",
  ({ set }) => {
    if (!env.IS_DEV) {
      throw new AppError("not_found", "Not found");
    }
    taskRepo.deleteAll();
    set.status = 204;
  },
)
```

Key details:
- No `response` schema on the DELETE routes (204 has no body — adding a response schema for void/undefined is unnecessary and can cause Elysia type issues)
- `set.status = 204` must be set explicitly — Elysia defaults to 200 for non-void returns, and 204 is semantically required by ARCH-AR7
- The return value of `taskRepo.delete()` is intentionally discarded — the route is always 204 per the idempotency contract

### Test Helpers for Integration Tests

```ts
const del = async (app: AnyElysia, id: string, ip: string = TEST_IP): Promise<Response> =>
  app.handle(
    new Request(`http://localhost/api/tasks/${id}`, {
      method: "DELETE",
      headers: { "x-forwarded-for": ip },
    }),
  );

const delAll = async (app: AnyElysia, ip: string = TEST_IP): Promise<Response> =>
  app.handle(
    new Request("http://localhost/api/tasks", {
      method: "DELETE",
      headers: { "x-forwarded-for": ip },
    }),
  );
```

### IS_DEV Flag Behavior in Tests

`env.IS_DEV` is `true` whenever `NODE_ENV !== "production"`. In Bun test runs, `NODE_ENV` is typically `"test"` or `"development"` (not `"production"`), so `IS_DEV` is `true` without any mocking. The fixture-reset route is accessible in all test environments. The `beforeEach` in `tasks.test.ts` does not need to mock `env`.

### Architecture Compliance

- **Repository pattern** — route calls `taskRepo.delete()` and `taskRepo.deleteAll()` only; no inline SQL in routes. [Source: architecture/implementation-patterns-consistency-rules.md#Backend-handler-discipline]
- **Error envelope** — `AppError("not_found", ...)` in the fixture-reset prod guard → caught by `registerOnError` → HTTP 404 envelope. [Source: architecture/core-architectural-decisions.md#D4]
- **Idempotency** — `DELETE /api/tasks/:id` returns 204 regardless of row existence. Retry-safe for flaky network (FR29). [Source: epics.md#Story-3.1, architecture/core-architectural-decisions.md#D3]
- **Atomicity** — single `DELETE FROM tasks WHERE id = ?` statement, no transaction needed (NFR-R3). [Source: architecture/core-architectural-decisions.md#D2]
- **Named exports only** — no `export default`. [Source: architecture/implementation-patterns-consistency-rules.md#Module-Conventions]
- **No new dependencies** — pure SQLite and Elysia operations, no new packages.

### Pre-Epic-3 Deferred Items Resolved by This Story

From `deferred-work.md`:

**1. `apps/api/src/storage/tasks.ts:60-73` — INSERT OR IGNORE invariant**
Decision: document the invariant with a comment, no behavior change. The `"invariant: task missing after INSERT OR IGNORE"` path is unreachable under the single-writer SQLite WAL model because:
- SQLite WAL mode serializes all writes through a single writer lock
- The `create()` transaction wraps INSERT + SELECT; no concurrent DELETE can interleave within the transaction boundary
- The only way the post-INSERT `get()` returns `undefined` is if a concurrent DELETE ran between INSERT and SELECT — impossible inside a `db.transaction()`
Action: add a one-line comment at the `if (!task)` throw explaining this.

**2. E2E fixture-reset (`e2e/capture.spec.ts`, `e2e/empty-error-states.spec.ts`)**
The `DELETE /api/tasks` endpoint (AC #6) unblocks fixture isolation. This story wires `beforeEach` into `capture.spec.ts`. The `empty-error-states.spec.ts` spec uses `fullyParallel: true` and hits the shared dev DB — adding fixture reset there is optional for this story (the spec uses `getByText` assertions that are content-specific, not position-based). Scoped to `capture.spec.ts` for now.

**3. `two captures land newest-first` test race**
Fixed by adding `waitForListSettled(page)` after `page.goto("/")` in that test (AC #10).

### File Structure Requirements

**Modify only these files:**
```text
apps/api/src/storage/tasks.ts       # Implement remove(), add deleteAll()
apps/api/src/routes/tasks.ts        # Add DELETE routes (single + bulk)
apps/api/src/storage/tasks.test.ts  # Replace delete stub with real tests
apps/api/src/routes/tasks.test.ts   # Add DELETE integration tests
e2e/capture.spec.ts                 # Add beforeEach fixture reset + waitForListSettled guard
```

**Do not modify:**
```text
apps/api/src/storage/migrations/    # No new migration (no schema change)
apps/api/src/index.ts               # Route auto-picked up via tasksRoute
apps/api/src/errors/codes.ts        # not_found already in ErrorCode union
apps/web/**                         # Frontend is Stories 3.2–3.4 scope
e2e/manage.spec.ts                  # No changes needed
e2e/keyboard.spec.ts                # No changes needed
e2e/empty-error-states.spec.ts      # Optional follow-up; not in this story
```

**No new files.**

### Testing Requirements

- **bun:test idiom:** `describe(...)` → `it(...)`. Not `test(...)`. [Source: architecture/implementation-patterns-consistency-rules.md#Test-structure]
- **In-process test app:** `app.handle()` for integration tests — no HTTP server, no network. The existing `beforeEach` in `tasks.test.ts` already creates the full middleware stack.
- **`:memory:` DB:** Repository tests use `openDb(":memory:")` + `runMigrations()`. Already set up in `tasks.test.ts` `beforeEach`.
- **Rate-limit test:** Post 20 requests to exhaust the bucket (using the existing `TEST_IP`), then send the DELETE. Follow the existing rate-limit test pattern from POST and PATCH.
- **204 body assertion:** `res.status === 204`, and `(await res.text()) === ""` (or `.arrayBuffer()` is empty). Do not attempt `res.json()` on a 204 — it will throw.
- **No `bun:sqlite` mocking** — always use a real `:memory:` DB. [Source: architecture/implementation-patterns-consistency-rules.md#Test-structure]

### Previous Story Intelligence (from Stories 2.1 and 2.3)

- **`db.run()` returns `{ changes: number }`** — confirmed in `update()` and `create()` implementations. Same pattern for `remove()`.
- **Test count baseline:** 224 tests after Story 2.3. This story removes 1 stub test and adds ~9 new tests → expect ~232 passing.
- **Coverage baseline:** 96–98% lines. No coverage regression expected.
- **Rate-limit test pattern:** `post` 20 times with `TEST_IP`, then the 21st call returns 429. Use the same approach for DELETE — `del` 20 times then check 429. OR: `post` 20 times to fill the shared per-IP bucket (rate-limit is per-IP, not per-method), then the `del` on the same IP returns 429.
- **Elysia chain order:** `tasksRoute` chain must have `.delete("/api/tasks", ...)` registered before `.delete("/api/tasks/:id", ...)`. While Elysia favors exact match over parameterized, the conventional safe pattern puts literal routes before parameterized ones.

### Anti-Patterns to Avoid

- **Do not** return a body from the DELETE handler (204 means No Content). Do not return `undefined` explicitly — just set `set.status = 204` and return without a value.
- **Do not** throw `AppError("not_found", ...)` when the `:id` doesn't match a row — the endpoint is idempotent. Always 204.
- **Do not** add inline SQL to the route handler — route calls `taskRepo.delete()` only.
- **Do not** add a `response: t.Undefined()` or similar schema to the 204 route — leave the response schema absent; adding it tends to cause type errors with Elysia's 204 handling.
- **Do not** add a migration file — the DELETE operation requires no schema changes.
- **Do not** call `taskRepo.deleteAll()` from the single-resource DELETE route or any production code path — it is exclusively a test fixture method.
- **Do not** add `console.log` — the existing `requestLogger` middleware logs all requests automatically.
- **Do not** use `db.exec()` for the single-resource delete — it discards the `changes` count needed to return a meaningful boolean from `taskRepo.delete()`.
- **Do not** wrap the single-row DELETE in a transaction — it is already atomic as a single statement (NFR-R3).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.1] — story statement, BDD acceptance criteria, idempotency and rate-limit contracts
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D3] — REST contract: DELETE `/api/tasks/:id` → 204 idempotent / 429
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D2] — SQLite single-writer WAL model; atomicity of single DELETE statement
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D4] — Error envelope contract; not_found → HTTP 404
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Backend-handler-discipline] — repository pattern; no inline SQL in routes
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Test-structure] — bun:test idiom; `:memory:` DB; `.handle()` for integration tests
- [Source: _bmad-output/planning-artifacts/epic-3-pre-epic-notes.md] — pre-epic-3 items owned by this story (fixture reset, INSERT OR IGNORE invariant, capture.spec.ts race)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — pre-epic-3 deferred items resolved here (Stories 1.8, 1.11, 2.2)
- [Source: _bmad-output/implementation-artifacts/2-1-backend-patch-api-tasks-id-for-completion-toggle.md] — established pattern for route tests (del helper mirrors patch helper)
- [Source: _bmad-output/implementation-artifacts/2-3-keyboard-toggle-space-on-focused-row-liveregion-announcements.md] — 224 test count baseline, `bun run check:full` criteria

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- oxfmt reformatted `routes/tasks.ts` (single-line `.delete` handler style); no logic change.

### Completion Notes List

- Implemented `taskRepo.delete()`: replaces stub, runs `DELETE FROM tasks WHERE id = ?`, returns `result.changes > 0`.
- Added `taskRepo.deleteAll()`: runs `DELETE FROM tasks` via `db.exec()`; added to `TaskRepo` type and singleton proxy.
- Added `DELETE /api/tasks/:id` route (always 204, idempotent) and `DELETE /api/tasks` fixture-reset route (IS_DEV-gated).
- Registered collection route before parameterized route per conventional safe ordering.
- Replaced stub `describe("stubs deferred to later stories")` with real `describe("delete", ...)` — 4 repo unit tests added.
- Added `del` and `delAll` helpers and 4 integration tests (204 existing, 204 missing, 429 rate-limit, delAll fixture reset).
- Updated `tasks.test.ts` singleton fake to include `deleteAll`.
- Wired `beforeEach` fixture reset in `e2e/capture.spec.ts`; added `waitForListSettled` guard to "two captures" test.
- Added WAL single-writer comment to unreachable `if (!task)` guard in `create()`.
- Result: 231 tests pass (224 − 1 stub + 8 new), coverage 97.24%, all quality gates clean.

### File List

- apps/api/src/storage/tasks.ts
- apps/api/src/routes/tasks.ts
- apps/api/src/storage/tasks.test.ts
- apps/api/src/routes/tasks.test.ts
- e2e/capture.spec.ts

### Review Findings

- [x] [Review][Patch] E2E `beforeEach` has no status assertion on `DELETE /api/tasks` [e2e/capture.spec.ts:4-6]
- [x] [Review][Defer] E2E fixture reset depends on IS_DEV=true; no guard for prod-like environments [e2e/capture.spec.ts] — deferred, pre-existing architectural assumption
- [x] [Review][Defer] No IS_DEV=false / prod-mode 404 test for fixture-reset route [apps/api/src/routes/tasks.test.ts] — deferred, spec marks optional; env.IS_DEV always true in Bun test runner
- [x] [Review][Defer] `:id` format/length validation beyond t.String() not added [apps/api/src/routes/tasks.ts] — deferred, pre-existing pattern from Story 2.1
- [x] [Review][Defer] IS_DEV=true applies to all non-production NODE_ENV values (e.g. staging) [apps/api/src/env.ts] — deferred, broader architectural concern out of scope

## Change Log

- 2026-05-01: Story 3.1 implemented — DELETE /api/tasks/:id (idempotent 204), dev fixture reset DELETE /api/tasks, repository delete/deleteAll, integration + unit tests, E2E beforeEach isolation, INSERT OR IGNORE invariant comment.

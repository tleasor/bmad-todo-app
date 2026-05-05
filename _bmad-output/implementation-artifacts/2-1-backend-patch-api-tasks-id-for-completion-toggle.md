# Story 2.1: Backend PATCH `/api/tasks/:id` for Completion Toggle

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a frontend developer,
I want a stable PATCH endpoint that updates a task's completion status idempotently,
so that toggle retries from a flaky network produce the same end state without ambiguity.

## Acceptance Criteria

1. **`PATCH /api/tasks/:id` route is added to `apps/api/src/routes/tasks.ts`** — The route accepts a body validated by `t.Object({ completed: t.Boolean() })`. The `params` object is validated by `t.Object({ id: t.String() })`. Body is **target state, not toggle action** — sending `{ completed: true }` twice produces the same end state (no flip back). The response body is the updated camelCase `Task { id, text, completed, createdAt, updatedAt }` at HTTP 200.

2. **`taskRepo.update()` is fully implemented in `apps/api/src/storage/tasks.ts`** — The stub (`throw new Error("taskRepo.update: implemented in Story 2.1")`) is replaced with a real implementation. Executes a single atomic `UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?` statement (NFR-R3). Sets `updated_at` to `Date.now()`. Returns the updated `Task` on success, `undefined` when no row matched. Translates via existing `toTask()` / `get()` helpers — no new camelCase mapping logic.

3. **404 `not_found` when id does not exist** — When `taskRepo.update()` returns `undefined`, the route throws `new AppError("not_found", ...)`. The response body matches the error envelope shape from Story 1.2: `{ error: { code: "not_found", message: string }, requestId: string }` at HTTP 404.

4. **400 `validation_error` when body fails schema** — When the request body omits `completed`, provides a non-boolean value, or is malformed JSON, Elysia's built-in validation fires and the global `onError` handler maps `VALIDATION` to `400 validation_error`. Response matches the error envelope. No custom validation logic required — the `t.Boolean()` schema handles it.

5. **429 `rate_limited` when the per-IP token bucket is exhausted** — The rate-limit middleware (already applied to all `/api/*` routes) returns `429 rate_limited` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers. No route-level changes needed for rate limiting.

6. **`updatedAt` is set to the current unix-ms on each successful update** — The SQL UPDATE statement sets `updated_at = ?` with `Date.now()` captured at update-time. The `createdAt` field is never modified by PATCH (only `completed` and `updated_at` change).

7. **Integration tests via `app.handle()` cover all cases** — Added to `apps/api/src/routes/tasks.test.ts` under a new `describe("PATCH /api/tasks/:id")` block. Must cover: toggle false→true (returns 200 + updated task); repeat-true is idempotent (same body same result); toggle true→false; missing id → 404 + envelope; bad body (string instead of boolean) → 400 + envelope; missing `completed` field → 400 + envelope; rate-limit exhaustion → 429 + headers + envelope.

8. **Repository unit tests cover the SQL path** — Added to `apps/api/src/storage/tasks.test.ts`. The stub test "update throws (Story 2.1)" is replaced with real behavior tests. Must cover: `update()` sets `completed` and `updatedAt`; `update()` does not modify `createdAt`; `update()` returns `undefined` for unknown id; target-state idempotency (calling `update` twice with same `completed` returns same result). Tests run against `:memory:` DB via `createTaskRepo`.

9. **All existing tests continue to pass** — No regressions on the 191 tests from Stories 1.1–1.11. The "update throws (Story 2.1)" stub test in `tasks.test.ts` is the only removal (replaced by real tests).

10. **`bun run check` passes clean** — oxlint zero warnings, oxfmt clean, tsgo `-b --noEmit` clean, dep-count unchanged (api 2/25). No new dependencies.

## Tasks / Subtasks

- [x] **Task 1 — Implement `taskRepo.update()` in `apps/api/src/storage/tasks.ts`** (AC: #2, #6)
  - [x] Replace the `update` stub body with: single `UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?` statement using `db.run()`; capture `Date.now()` before the query; if `result.changes === 0` return `undefined`; otherwise return `get(id)` (reusing the existing `get` helper for camelCase conversion)
  - [x] Remove the underscore prefix from `_id` and `_input` parameters (they are no longer unused)
  - [x] Verify `toTask()` handles the updated row correctly (it already does — no changes needed)

- [x] **Task 2 — Add `PATCH /api/tasks/:id` route to `apps/api/src/routes/tasks.ts`** (AC: #1, #3, #4, #5)
  - [x] Add `TaskPatchBodySchema` constant above the route: `const TaskPatchBodySchema = t.Object({ completed: t.Boolean() });`
  - [x] Chain `.patch("/api/tasks/:id", handler, { params: t.Object({ id: t.String() }), body: TaskPatchBodySchema, response: TaskResponseSchema })` on the existing `Elysia()` chain after the POST route
  - [x] Handler signature: `({ body, params }) => { ... }` — no `set` needed (default 200)
  - [x] Handler body: call `taskRepo.update(params.id, { completed: body.completed })`; if result is `undefined` throw `new AppError("not_found", "Task not found")`; otherwise return the task

- [x] **Task 3 — Add repository unit tests to `apps/api/src/storage/tasks.test.ts`** (AC: #8, #9)
  - [x] Replace the existing `it("update throws (Story 2.1)", ...)` stub test with a `describe("update", ...)` block containing real tests
  - [x] Test: `update()` flips `completed` from false to true and returns the updated task
  - [x] Test: `update()` does not modify `createdAt` (compare before vs after)
  - [x] Test: `update()` sets `updatedAt` to a new value (≥ the value it had before + ≥ `before` timestamp)
  - [x] Test: `update()` returns `undefined` for a non-existent id
  - [x] Test: target-state idempotency — calling `update(id, { completed: true })` twice returns the same `completed: true` result both times
  - [x] Remove the "delete throws (Story 3.1)" stub from the `describe("stubs deferred to later stories")` block only if it conflicts — **keep the delete stub test** since Story 3.1 owns it

- [x] **Task 4 — Add integration tests to `apps/api/src/routes/tasks.test.ts`** (AC: #7, #9)
  - [x] Add a `patch` helper function alongside `get` and `post`: takes `app`, `id: string`, `body: unknown`, `ip?: string`; constructs `PATCH http://localhost/api/tasks/${id}` request with JSON body and `x-forwarded-for` header
  - [x] Add `describe("PATCH /api/tasks/:id", ...)` block with tests:
    - `it("returns 200 with the updated task when toggled to completed")`
    - `it("returns 200 when toggled back to active")`
    - `it("target-state idempotency: PATCH with completed:true twice returns same result")`
    - `it("returns 404 not_found envelope when id does not exist")`
    - `it("returns 400 validation_error when completed is not a boolean")`
    - `it("returns 400 validation_error when completed field is missing")`
    - `it("returns 429 rate_limited with rate-limit headers after burst exhaustion")`
  - [x] Ensure the `patch` helper is defined at the top of the file alongside `get` and `post`

- [x] **Task 5 — Quality gate verification** (AC: #10)
  - [x] Run `bun run check` — must pass: oxlint, oxfmt, tsgo, dep-count
  - [x] Run `bun run check:full` — must pass: all tests (original 191 + new), coverage ≥ 70%, audit, build, bundle-size
  - [x] Confirm dep counts: root 6/25, web 17/25, api 2/25 — no new deps

### Review Findings

- [x] [Review][Patch] 200 integration test does not assert `updatedAt`/`createdAt` fields in response [apps/api/src/routes/tasks.test.ts]
- [x] [Review][Patch] Rate-limit test: `x-ratelimit-reset` not asserted as finite number, inconsistent with POST rate-limit test [apps/api/src/routes/tasks.test.ts]
- [x] [Review][Defer] TOCTOU gap between UPDATE and SELECT in `update()` [apps/api/src/storage/tasks.ts] — deferred, pre-existing pattern explicitly blessed by spec (NFR-R3)
- [x] [Review][Defer] `updatedAt` bumped on no-op updates (same `completed` value) [apps/api/src/storage/tasks.ts] — deferred, by-design; idempotency guarantee is for `completed` only
- [x] [Review][Defer] Empty string `id` passes `t.String()` validation → no-op UPDATE → 404 [apps/api/src/routes/tasks.ts] — deferred, pre-existing schema pattern
- [x] [Review][Defer] `TaskPatchBodySchema` allows extra body fields (not strict) [apps/api/src/routes/tasks.ts] — deferred, pre-existing pattern across all route schemas
- [x] [Review][Defer] `patch` helper accepts `body: unknown` — `JSON.stringify(undefined)` produces undefined body [apps/api/src/routes/tasks.test.ts] — deferred, no current caller triggers this
- [x] [Review][Defer] 400 validation tests don't assert seed POST succeeded [apps/api/src/routes/tasks.test.ts] — deferred, pre-existing test pattern; POST covered by its own block
- [x] [Review][Defer] No test for malformed JSON body on PATCH [apps/api/src/routes/tasks.test.ts] — deferred, not required by AC7

## Dev Notes

### Critical Context

This is the **first story of Epic 2**. It is a pure backend story — no frontend code changes. The only files that change are in `apps/api/src/`.

The implementation is deliberately small. `taskRepo.update()` is already stubbed in `storage/tasks.ts:77` and wired through the lazy singleton at `tasks.ts:103`. The route file already imports `taskRepo` and has the `TaskResponseSchema` defined. The integration test file has all the infrastructure (beforeEach, afterEach, helpers, app setup) already wired.

### Files Being Modified — Current State

**`apps/api/src/storage/tasks.ts`** (current relevant section at lines 76–84):
```ts
// implemented in Story 2.1
const update = (_id: string, _input: { completed: boolean }): Task | undefined => {
  throw new Error("taskRepo.update: implemented in Story 2.1");
};

// implemented in Story 3.1
const remove = (_id: string): boolean => {
  throw new Error("taskRepo.delete: implemented in Story 3.1");
};
```
- `get(id)` already exists (lines 47–55) and returns `Task | undefined` using the `toTask()` mapper
- `toTask()` already converts `completed: number` to `completed: boolean` via `Boolean(row.completed)`
- The `db.run()` method returns `{ changes: number }` — same pattern used in `create()`
- The `TaskRepo` type at line 30 already declares `update: (id: string, input: { completed: boolean }) => Task | undefined`

**`apps/api/src/routes/tasks.ts`** (current full file, 37 lines):
- `TaskResponseSchema` is already defined at lines 11–17 — reuse it for the PATCH response
- `tasksRoute` is a chained `Elysia()` instance
- The route chain currently has `.get(...)` and `.post(...)` — add `.patch(...)` after `.post(...)`
- `AppError` is already imported

**`apps/api/src/storage/tasks.test.ts`** (stub test at lines 118–125):
```ts
describe("stubs deferred to later stories", () => {
  it("update throws (Story 2.1)", () => {
    expect(() => repo.update("some-id", { completed: true })).toThrow(/Story 2.1/);
  });
  it("delete throws (Story 3.1)", () => {
    expect(() => repo.delete("some-id")).toThrow(/Story 3.1/);
  });
});
```
**Replace only the `update` stub** with a real `describe("update", ...)` block. Keep the `delete` stub intact — Story 3.1 owns it. The `describe("stubs deferred to later stories")` wrapper can be kept with only the delete test if it's cleaner, or removed if it's now empty after the update stub is replaced.

**`apps/api/src/routes/tasks.test.ts`** (lines 36–53 show the existing helpers):
```ts
const post = async (app: AnyElysia, body: unknown, ip: string = TEST_IP): Promise<Response> => ...
const get = async (app: AnyElysia, ip: string = TEST_IP): Promise<Response> => ...
```
Add a `patch` helper with the same pattern.

### Exact SQL for `taskRepo.update()`

```ts
const update = (id: string, input: { completed: boolean }): Task | undefined => {
  const now = Date.now();
  const result = db.run(
    `UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?`,
    [input.completed ? 1 : 0, now, id],
  );
  if (result.changes === 0) return undefined;
  return get(id);
};
```

Key details:
- `db.run()` returns `{ changes: number }` in `bun:sqlite` — same pattern as `create()`'s insert
- `completed` is stored as `INTEGER` — convert `boolean` → `0 | 1` via ternary (`input.completed ? 1 : 0`)
- `get(id)` after a successful update is safe: the UPDATE ran atomically, so `get` will see the new values
- No transaction wrapper needed — single atomic statement (NFR-R3 satisfied)
- **Do not** re-fetch inside a transaction — the `get()` helper opens its own query; nesting transactions in `bun:sqlite` is allowed but unnecessary here

### Exact PATCH Route Handler

```ts
const TaskPatchBodySchema = t.Object({
  completed: t.Boolean(),
});

// ... inside tasksRoute chain, after .post(...)
.patch(
  "/api/tasks/:id",
  ({ body, params }) => {
    const task = taskRepo.update(params.id, { completed: body.completed });
    if (!task) {
      throw new AppError("not_found", "Task not found");
    }
    return task;
  },
  {
    params: t.Object({ id: t.String() }),
    body: TaskPatchBodySchema,
    response: TaskResponseSchema,
  },
)
```

Key details:
- No `set.status = 200` needed — Elysia defaults to 200 for PATCH
- `params.id` is validated as `t.String()` — Elysia will handle malformed params
- The `AppError("not_found", ...)` is caught by the existing `onError` handler and maps to HTTP 404 via `ERROR_STATUS["not_found"] = 404`
- The `response: TaskResponseSchema` adds compile-time shape guarantee

### Test Helper for Integration Tests

```ts
const patch = async (app: AnyElysia, id: string, body: unknown, ip: string = TEST_IP): Promise<Response> =>
  app.handle(
    new Request(`http://localhost/api/tasks/${id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    }),
  );
```

### Architecture Compliance

- **Repository pattern enforced** — route handler calls `taskRepo.update()` only; no inline SQL in the route. [Source: architecture/implementation-patterns-consistency-rules.md#Backend-handler-discipline]
- **Error envelope** — `AppError("not_found", ...)` → caught by `registerOnError` → returns `{ error: { code: "not_found", message }, requestId }` at 404. [Source: architecture/core-architectural-decisions.md#D4]
- **`updatedAt` semantics** — `updated_at` is set to `Date.now()` (unix ms) on each successful update, matching the schema invariant `updated_at INTEGER NOT NULL`. [Source: architecture/core-architectural-decisions.md#D2]
- **Target state, not action** — `{ completed: boolean }` is the desired end state. Calling PATCH twice with `{ completed: true }` must not flip back to `false`. The SQL `SET completed = ?` achieves this — it simply overwrites with the provided value. [Source: epics.md#Story-2.1]
- **Idempotency** — The PATCH endpoint is idempotent per FR29. The frontend can safely retry on network failure. [Source: epics.md#FR29]
- **Named exports only** — no `export default`. [Source: architecture/implementation-patterns-consistency-rules.md#Module-Conventions]
- **No magic numbers** — `input.completed ? 1 : 0` is a type conversion, not a magic number; no constant needed.

### File Structure Requirements

**Modify only these files:**
```text
apps/api/src/storage/tasks.ts         # Implement taskRepo.update()
apps/api/src/routes/tasks.ts          # Add PATCH route
apps/api/src/storage/tasks.test.ts    # Replace update stub with real tests
apps/api/src/routes/tasks.test.ts     # Add PATCH integration tests
```

**Do not modify:**
```text
apps/api/src/index.ts                  # Route is auto-picked up via tasksRoute
apps/api/src/errors/codes.ts           # not_found already in ErrorCode union
apps/api/src/errors/AppError.ts        # No changes needed
apps/api/src/storage/db.ts             # No schema changes needed
apps/api/src/storage/migrations/       # No new migration needed (completed column exists)
apps/web/**                            # Frontend is Story 2.2's scope
e2e/manage.spec.ts                     # Real assertions land in Story 2.2
```

**No new files** — this story adds to existing files only.

### Testing Requirements

- **bun:test idiom:** `describe(...)` → `it(...)`. Not `test(...)`. [Source: architecture/implementation-patterns-consistency-rules.md#Test-structure]
- **In-process test app:** Use Elysia's `.handle()` for integration tests — no HTTP server, no network. Existing `beforeEach` setup in `tasks.test.ts` already creates the full middleware stack. The `patch` helper follows the same pattern as `post` and `get`.
- **`:memory:` DB:** Repository tests use `openDb(":memory:")` + `runMigrations()`. Already set up in `tasks.test.ts` `beforeEach`.
- **Rate-limit test:** Use a different IP than the 20 POST calls to avoid bucket contamination. Or: exhaust the bucket then send the PATCH. Either approach is valid — follow the existing pattern in `tasks.test.ts:187` for the POST rate-limit test.
- **Coverage:** The new `update()` implementation + new PATCH handler + new tests should bring the `storage/tasks.ts` and `routes/tasks.ts` modules above their existing high coverage baseline. No coverage regression.
- **No `bun:sqlite` mocking** — always use a real `:memory:` DB. [Source: architecture/implementation-patterns-consistency-rules.md#Test-structure]

### Previous Story Intelligence (from Story 1.11 Dev Agent Record)

- **The `TaskRepo.update` type signature is already declared** at `tasks.ts:30`. The stub respects the declared signature — changing the implementation does not require changing the type declaration.
- **`db.run()` returns `{ changes: number }`** — confirmed in the `create()` implementation at `tasks.ts:61`. Use the same pattern.
- **`get(id)` is safe to call after `db.run()`** — there is no transaction needed since `UPDATE` is atomic on its own (NFR-R3).
- **Test isolation is solid** — `beforeEach` opens a fresh `:memory:` DB and calls `__setTaskRepoForTests(testRepo)`. `afterEach` calls `__resetTaskRepoForTests()` and `testDb.close()`. The new PATCH tests operate cleanly in this same setup.
- **`app.handle()` is in-process** — no server start needed. The test `app` in `tasks.test.ts:66` already includes `requestLogger`, `bodySize`, `rateLimit`, and `tasksRoute`.
- **Image size and Lighthouse are not affected** — this story adds only backend code; no SPA changes; no Dockerfile changes.

### Anti-Patterns to Avoid

- **Do not** add `set.status = 200` to the PATCH handler — Elysia's default for a successful handler return is 200.
- **Do not** use a toggle action (`completed = NOT completed`) in SQL — the body is a **target state**. Use `SET completed = ?` with the provided value.
- **Do not** add inline SQL to the route handler — route calls `taskRepo.update()` only.
- **Do not** add a `cause` field to the `AppError` throw in the 404 path — there is no underlying error to wrap.
- **Do not** add a transaction wrapper around the single UPDATE — it is already atomic.
- **Do not** create a new `AppError` subclass or a new `ErrorCode` — `"not_found"` already exists in `codes.ts`.
- **Do not** modify `apps/web/**` — frontend work is Story 2.2's scope.
- **Do not** touch `e2e/manage.spec.ts` — the real assertions land in Story 2.2.
- **Do not** add `console.log` — use `logger.*` if logging is needed (it isn't for these happy/error paths; the existing `onError` and `requestLogger` middleware handle all logging automatically).
- **Do not** add a new migration file — the `completed` column already exists in `001_create_tasks.up.sql`.
- **Do not** change the `TaskResponseSchema` — it is shared between GET, POST, and PATCH responses.

### Project Structure Notes

- `tasksRoute` in `routes/tasks.ts` is a chainable `Elysia()` instance. The `.patch(...)` call chains after `.post(...)` on the same instance. Elysia handles the HTTP method routing automatically.
- The `App` type exported from `apps/api/src/index.ts` re-exports `tasksRoute` via `baseApp.use(tasksRoute)`. Adding PATCH to `tasksRoute` automatically makes it visible to Eden Treaty's type inference on the frontend (used in Story 2.2).
- The `TaskRepo` type in `tasks.ts` is exported — `update` is already in the type, so the singleton proxy at `tasks.ts:97–103` already delegates correctly once the implementation throws is removed.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1-Backend-PATCH] — story statement, BDD acceptance criteria, idempotency contract
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D3] — REST contract: PATCH `/api/tasks/:id` → 200 / 404 / 400 / 429; body is target state
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D2] — SQLite schema: `completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))`, `updated_at INTEGER NOT NULL`
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D4] — Error envelope contract; `not_found` → HTTP 404
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Backend-handler-discipline] — repository pattern; no inline SQL in routes
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Test-structure] — bun:test idiom; `:memory:` DB; `.handle()` for integration tests
- [Source: _bmad-output/implementation-artifacts/1-3-backend-persistence-tasks-table-forward-only-migrations-repository-skeleton.md] — `taskRepo.create` uses `db.run()` + `result.changes`; `get()` helper reuse pattern
- [Source: _bmad-output/implementation-artifacts/1-4-backend-api-get-post-api-tasks-with-idempotency-and-per-ip-rate-limiting.md] — rate-limit headers, POST test patterns, `app.handle()` integration test setup
- [Source: _bmad-output/implementation-artifacts/1-11-end-to-end-single-service-container-deployment.md] — test count baseline 191; quality gate thresholds

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `taskRepo.update()` with a single atomic `UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?` statement. Boolean coercion via ternary (`input.completed ? 1 : 0`) for SQLite INTEGER storage. Returns `get(id)` on success, `undefined` when `result.changes === 0`.
- Added `PATCH /api/tasks/:id` route to the Elysia chain. Uses `TaskPatchBodySchema` for body validation. Throws `AppError("not_found", ...)` when repo returns `undefined`, which the existing `onError` handler maps to HTTP 404.
- Replaced `update throws (Story 2.1)` stub test with a full `describe("update")` block (6 tests): false→true toggle, createdAt invariant, updatedAt mutation, undefined for unknown id, target-state idempotency, and false revert.
- Added `patch` helper to integration tests and 7 PATCH integration tests covering: 200 toggle, 200 revert, idempotency, 404 envelope, 400 bad type, 400 missing field, 429 rate limit.
- All 203 tests pass (191 original + 12 new). `bun run check:full` passes: 0 lint/format/type errors, dep counts unchanged (root 6/25, web 17/25, api 2/25), coverage 96.90% lines, audit clean, build clean, bundle 27KB gzipped.

### File List

- apps/api/src/storage/tasks.ts
- apps/api/src/routes/tasks.ts
- apps/api/src/storage/tasks.test.ts
- apps/api/src/routes/tasks.test.ts

## Change Log

- Implemented PATCH /api/tasks/:id endpoint with idempotent completion toggle, 404/400/429 error handling, and 12 new tests (Date: 2026-05-01)

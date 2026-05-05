# Story 1.8: Optimistic Task Creation — Happy Path

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want my task to appear in the list the instant I press Enter,
so that the app feels instant — there is never a perceived gap between Enter and the task being visible.

## Acceptance Criteria

1. **`useCreateTask` mutation hook exists with optimistic-prepend semantics (FR1, FR23, ARCH-AR11)** — `apps/web/src/data/queries.ts` exports a named `useCreateTask()` hook that calls TanStack Solid Query's `useMutation` v5 primitive (the same factory-function-shape used by `useTasks`). The mutation is typed `useMutation<Task, Error, { id: string; text: string }, { previous: Task[] }>`. Its `mutationFn` calls the backend POST through a new `tasksApi.create({ id, text })` seam in `apps/web/src/data/api.ts` and returns the parsed `Task`. The hook returns the TanStack mutation observer object (with at minimum `mutate`, `isPending`, `error`, `reset`) directly — no remap, no wrapping. The hook is only consumed from `App.tsx` (which owns `handleTaskSubmit`); components must not import `useCreateTask` directly per the architecture's component-↔-data boundary.

2. **`onMutate` performs an optimistic prepend on the `["tasks"]` cache (FR23, UX-DR16)** — Inside `useCreateTask`, the `onMutate` callback runs synchronously when `mutate({ id, text })` is called. It (a) calls `await queryClient.cancelQueries({ queryKey: tasksQueryKey })` to abort any in-flight refetch that could clobber the optimistic state, (b) reads the current cache via `queryClient.getQueryData<Task[]>(tasksQueryKey) ?? []` and stores it as `previous` on the returned context object, and (c) writes the new cache via `queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => [{ id, text, completed: false, createdAt: now, updatedAt: now }, ...(prev ?? [])])`. The optimistic timestamp `now` is `Date.now()` evaluated inside `onMutate`. The optimistic row matches the canonical `Task` shape exported from `@bmad-todo-app/api`. The new row is prepended (newest-first) — never appended.

3. **`onSuccess` and `onSettled` perform no UI rollback and no list invalidation (FR23, UX-DR16, ARCH-AR11)** — `onSuccess` is empty (or omitted). `onSettled` is empty (or omitted). `onError` is empty (or omitted). Specifically: do **not** call `queryClient.invalidateQueries(tasksQueryKey)` on success — the optimistic prepend already matches the idempotent server result (POST returns the canonical `Task` whose `id` equals the client-generated UUIDv7, so any refetch would just re-fetch the same row). Do **not** call `queryClient.setQueryData(tasksQueryKey, context.previous)` on error — the no-rollback contract is the load-bearing UX rule for the Story 1.9 sync-pending and retry-exhausted states. The `previous` snapshot lives on the mutation context for Story 1.9 to consume; this story does not act on it.

4. **`tasksApi.create` calls `POST /api/tasks` via Eden and parses the envelope (FR1, FR29, ARCH-AR7)** — `apps/web/src/data/api.ts` exports a new `tasksApi.create(input: { id: string; text: string }): Promise<Task>` method (added to the existing mutable `tasksApi` object, sibling to `tasksApi.list` and `tasksApi.fetch`). It calls the Eden `POST /api/tasks` route via the chained-access pattern (`api.api.tasks.post({ id, text })`) using the same Eden type-narrowing seam Story 1.7 introduced (`api.api as unknown as { tasks: { ... } }` — extend the cast type with a `post: (body: { id: string; text: string }) => Promise<{ data: Task | null; error: { status: number; value: unknown } | null }>` member). On a non-null `error`, it throws `new Error(envelopeMessage ?? \`tasks create failed: HTTP ${error.status}\`)` using the same envelope-traversal pattern as `tasksApi.list`. On `data === null`, it throws `new Error("tasks create returned null data")`. On success, it returns `data`. The seam is exposed as a writable property (`tasksApi.create = mock(...)` works in tests) consistent with deviation #2 from Story 1.7.

5. **TaskInput's `onSubmit` is wired to `useCreateTask` from `App.tsx` (FR1, FR18, FR23)** — `apps/web/src/App.tsx` is updated to (a) import `useCreateTask` from `../data/queries` and `createUuidV7` from `../data/uuid`, (b) replace the no-op `handleTaskSubmit` stub with a function that calls `mutation.mutate({ id: createUuidV7(), text })`, and (c) keep the existing `<TaskInput onSubmit={handleTaskSubmit} />` and `<TaskList />` mount layout intact. The `text` argument received by `handleTaskSubmit` is already trimmed by Story 1.6's TaskInput (whitespace-only strings are blocked at the component level and never reach `onSubmit`); `handleTaskSubmit` does **not** re-trim. The mutation's `mutate` is called fire-and-forget — `App.tsx` does not `await` it (the optimistic UI update inside `onMutate` is what the user sees; the network round-trip is background).

6. **TaskInput contract is unchanged (FR1, FR18)** — `apps/web/src/components/TaskInput.tsx` is **not modified** in this story. Its existing `onSubmit(text: string)` contract (Story 1.6) is the only API surface used. The input's auto-focus, clear-on-submit, IME composition guard, and focus retention all come from Story 1.6. Story 1.8 only changes what `App.tsx` does with the submitted text, not the input's behavior.

7. **Capture is silent — no toast, banner, animation, or LiveRegion announcement on success (UX-DR16, motion.instant)** — The optimistic row appears in the list with **no entrance animation** — `motion.instant` per UX-DR16 ("animation on insert reads as latency"). Do **not** add a CSS transition / keyframes / Solid `<Transition>` wrapper around new TaskRow inserts. Do **not** call `LiveRegion.announce(...)` from `onMutate`, `onSuccess`, or `onSettled`. Do **not** render a toast, banner, snackbar, or success message. Do **not** add an `aria-live` polite/assertive announcement for capture. The screen reader experience for happy-path capture is silent (Story 1.9 owns the `"Saving…"` / `"Saved"` announcements that fire only when the row is pending > 300 ms).

8. **The input clears and stays focused after Enter (FR1, FR18)** — When the user presses Enter on a non-empty input, the captured text is submitted via `onSubmit`, the input value is cleared (Story 1.6 contract), and the input retains focus (Story 1.6 contract). This is **not new code** in this story — Story 1.6 already implemented it. AC #8 exists to lock the integration assertion that the existing TaskInput contract still holds when wired to a real mutation, and to anchor the Playwright assertion in AC #11 that focus stays on the input through the optimistic round-trip.

9. **The optimistic row is keyed on the client-generated UUIDv7 (FR29, ARCH-AR6, ARCH-AR7)** — `App.tsx`'s `handleTaskSubmit` calls `createUuidV7()` from `apps/web/src/data/uuid.ts` exactly once per submit and passes the resulting `id` as both (a) the optimistic row's `id` in `onMutate` and (b) the POST body's `id`. Because the backend uses `INSERT OR IGNORE` keyed on `id` (Story 1.3 contract) and the server response's `id` equals the request body's `id` (Story 1.4 contract), the cached optimistic row and the server-returned row are the same Solid `<For each={query.data ?? []}>` keyed entry — no duplicate row, no flicker, no key churn. Generating the UUIDv7 in `handleTaskSubmit` (not in `onMutate`) is the canonical seam: the `id` is part of the mutation input variables, which makes Story 1.9's retry / sync-pending state row-addressable by `id`.

10. **Unit test — `useCreateTask` mutation hook in isolation (`queries.test.tsx`)** — Extend the existing `apps/web/src/data/queries.test.tsx` (do not create a new file) with a new `describe("useCreateTask")` block. Tests must use the same `tasksApi.create` swap-in pattern as the existing `tasksApi.fetch` tests (capture `originalCreate` in `beforeEach`, restore in `afterEach`). Cases:
    - **`onMutate` prepends the optimistic row to the cache.** Pre-seed `client.setQueryData(tasksQueryKey, [existingTask])`. Stub `tasksApi.create = mock(() => new Promise<Task>(() => {}))` (never resolves — keeps the mutation in `isPending` so the test reads the cache mid-flight). Render a probe component that exposes the mutation observer; call `mutation.mutate({ id: "0193f000-0000-7000-8000-00000000000a", text: "new" })`. Read the cache: `client.getQueryData<Task[]>(tasksQueryKey)`. Assert the array length is 2, the first element's `id` matches the mutate input, the first element's `text` is `"new"`, the first element's `completed` is `false`, and the second element is `existingTask` unchanged.
    - **`mutationFn` calls `tasksApi.create` with the mutate variables.** Stub `tasksApi.create` with `mock(() => Promise.resolve(serverTask))`. Trigger `mutation.mutate({ id, text })`. After the mutation resolves (use the `waitFor` helper already in the file), assert the mock was called exactly once with `{ id, text }`.
    - **`onSuccess` does not invalidate the tasks query.** Spy on `client.invalidateQueries` (replace it with `mock(...)` for the test, restore in afterEach). Stub `tasksApi.create` to resolve. Trigger the mutation. After resolution, assert `client.invalidateQueries` was called zero times with `{ queryKey: tasksQueryKey }`. (Acceptable alternative: assert the spy's call count is 0 across all calls — `useCreateTask` should not invalidate any query.)
    - **`onError` does not roll back the optimistic prepend (FR27, UX-DR16).** Pre-seed `[existingTask]`. Stub `tasksApi.create` to reject with `new Error("network")`. Trigger the mutation. Wait for `mutation.isError` to be `true`. Read the cache: assert the array length is still 2, the optimistic row is still at index 0, `existingTask` still at index 1. The `previous` context value is reachable but **not consumed**.
    - **The `["tasks"]` query is cancelled before the optimistic write.** Spy on `client.cancelQueries` (mock it out for the test). Trigger the mutation. Assert `cancelQueries` was called with `{ queryKey: tasksQueryKey }` exactly once, before `tasksApi.create` was invoked. (Order assertion: `cancelQueries` mock's `mock.calls.length` is 1 at the time `tasksApi.create` is first called — capture the count inside the `tasksApi.create` mock body.)

11. **E2E test — `e2e/capture.spec.ts` Playwright spec (FR1, FR18, FR23, NFR-M2)** — Create `e2e/capture.spec.ts`. The spec uses the existing `playwright.config.ts` chromium / firefox / webkit projects and the existing `webServer` (Vite dev on `:5173` with `/api/*` and `/health` proxied to the Bun backend on `:3000`). Test cases:
    - **Capture happy path renders the task and clears + refocuses the input.** `page.goto("/")`. Wait for the input to be focused (`await expect(input).toBeFocused()` — same pattern as `e2e/smoke.spec.ts`). Type `"buy milk"` and press Enter. Assert (a) the task appears in the list (`await expect(page.getByRole("listitem").filter({ hasText: "buy milk" })).toBeVisible()`), (b) the input value is cleared (`await expect(input).toHaveValue("")`), (c) the input is still focused, (d) **no SyncIndicator is visible** (`await expect(page.locator('[aria-label="Saving"]')).toHaveCount(0)` — Story 1.9 will introduce this; AC #11 asserts it stays absent in the happy path), and (e) **no toast, banner, or live-region "Saved" announcement is rendered** (assert `page.getByRole("status")` count is 0 in the happy path; the global `<LiveRegion />` is silent during a < 300 ms round-trip).
    - **Optimistic window — the row is visible before the network resolves.** Use Playwright's `page.route("**/api/tasks", ...)` to intercept the POST and `await new Promise(r => setTimeout(r, 800))` before fulfilling. Type and press Enter; assert the listitem appears within 100 ms (`await expect(listitem).toBeVisible({ timeout: 100 })`). This is the load-bearing optimistic-window assertion — it fails if the dev wired the create flow non-optimistically (e.g., `await mutate(...)` then conditional render, or `onSuccess` invalidation that briefly empties the cache).
    - **Idempotent retry behavior surfaces no duplicate row (FR29, ARCH-AR7).** Hard to assert at the E2E layer without controlling the network — defer the explicit retry-duplicate assertion to Story 1.9 (which owns the retry policy). For Story 1.8, simply assert that pressing Enter twice with two different texts produces two list items in the correct order (`"second"` at index 0, `"first"` at index 1 — newest first).
    - **axe-core assertion on the populated state.** Import `AxeBuilder` from `@axe-core/playwright` (already a root devDep). After capturing one task, run `await new AxeBuilder({ page }).analyze()`. Filter results to `impact === "critical" || impact === "serious"`. Assert the filtered violations array is empty.

12. **Quality gates pass with no new dependencies** — `bun run check` (oxlint, oxfmt, tsgo, dep-count) passes. `bun run check:full` (adds `bun test`, `bun audit`, `bun run build`, bundle-size) passes. **Do not** add new entries to `apps/web/package.json` `dependencies` or `devDependencies`. The existing `@tanstack/solid-query@5.100.6` ships `useMutation`; the existing `@elysiajs/eden@1.4.9` exposes the chained `api.api.tasks.post(...)` accessor; the existing `@bmad-todo-app/api` workspace re-export covers the `Task` type. Total deps for `apps/web` stays at **17/25** (NFR-M5). Total deps for the root stays at **6/25** (no Playwright spec deps change since `@axe-core/playwright` is already a root devDep).

13. **Coverage stays green; new mutation paths are exercised** — `bun scripts/check-coverage.ts` (the `check:full` coverage gate) stays green. Aim for ≥ 80 % statements on `data/queries.ts` and the new `tasksApi.create` seam in `data/api.ts` (the four `useCreateTask` test cases plus the existing `useTasks` cases will land you well above this threshold). `apps/web/src/App.tsx`'s coverage delta is small but visible — the `handleTaskSubmit` body becomes one `mutate({ id: createUuidV7(), text })` call. App.tsx itself is not unit-tested in Story 1.6 / 1.7 precedent; the Playwright `e2e/capture.spec.ts` is the integration coverage for the wiring and is sufficient (consistent with the App-integration approach in Story 1.7).

14. **No regression on Story 1.6 / 1.7 surfaces** — `bun run test` continues to pass all 142+ existing Story 1.6 + 1.7 tests. Specifically: `TaskInput.test.tsx` continues to pass unchanged (this story does not touch TaskInput). `TaskList.test.tsx` continues to pass unchanged (this story does not change `useTasks`, `tasksApi.list`, or the four-state TaskList state machine). `TaskRow.test.tsx` continues to pass unchanged (this story does not modify TaskRow's active-state rendering or XSS regression). `queries.test.tsx`'s existing `describe("useTasks")` block continues to pass (the new `describe("useCreateTask")` block is additive). The XSS regression in `TaskRow.test.tsx` continues to enforce that `task.text` renders as literal text — including for the new optimistic row, since it flows through the same `<TaskRow task={task} />` JSX path.

15. **Tightly bounded scope** — Out of scope (and forbidden in this story): SyncIndicator rendering or 300 ms pending threshold (Story 1.9), retry-exhausted ErrorMessage / RetryAction / row-error background (Story 1.9), retry policy (`429`/`5xx`/`Retry-After` semantics — Story 1.9), list-level fetch error UI / `refetchOnReconnect` behavior (Story 1.10), toggle mutation (`useToggleTask` — Story 2.2), delete mutation (`useDeleteTask` — Story 3.2), undo flow (Story 3.4), per-row LiveRegion announcements (Story 1.9), `motion.medium` shimmer or row-out animation tweaks. Backend stays untouched (Story 1.4 already ships POST `/api/tasks`). No `Bun.env` / `import.meta.env` access in app code. No raw `fetch`. No `console.log`. No magic numbers. No `any`. No `useSuspenseQuery`. Named exports only. Never destructure component props.

16. **Documentation hygiene** — The Dev Agent Record records the test-stub mechanism choice for `tasksApi.create` (mirrors Story 1.7's deviation #2), the Eden type-cast extension on `api.api` (mirrors deviation #4), the Playwright network-stub mechanism in `e2e/capture.spec.ts`, and any timing-window compromises in the optimistic-window E2E assertion. Any deferred follow-ups go into `_bmad-output/implementation-artifacts/deferred-work.md` under a new "Deferred from: code review of 1-8-..." section.

## Tasks / Subtasks

- [x] **Task 1 — Add `tasksApi.create` to `data/api.ts`** (AC: #4)
  - [x] In `apps/web/src/data/api.ts`, extend the existing Eden type-narrowing cast to include the POST accessor. Define a local `TasksPostResponse = { data: Task | null; error: { status: number; value: unknown } | null }` (sibling to the existing `TasksGetResponse`) and a `TasksPostBody = { id: string; text: string }`.
  - [x] Add `const tasksPost = (body: TasksPostBody): Promise<TasksPostResponse> => (api.api as unknown as { tasks: { post: (body: TasksPostBody) => Promise<TasksPostResponse> } }).tasks.post(body);` (a sibling to the existing `tasksGet` constant). Reuse the same envelope-message extraction pattern (`(error.value as { error?: { message?: string } } | undefined)?.error?.message`) so the cast surface stays narrow.
  - [x] Extend the `tasksApi` object with two new properties: `createFetch: tasksPost` (the writable seam, mirroring `fetch: tasksGet`) and `create: async (input: TasksPostBody): Promise<Task> => { ... }`. The `create` method calls `tasksApi.createFetch(input)`, throws on non-null `error` (same envelope-message + `tasks create failed: HTTP {status}` fallback as `tasksApi.list`), throws on `data === null` (`"tasks create returned null data"`), otherwise returns `data`.
  - [x] Export `TasksPostBody` and `TasksPostResponse` types alongside `TasksGetResponse` so the test file can import them for type-safe mocking.

- [x] **Task 2 — Implement `useCreateTask` in `data/queries.ts`** (AC: #1, #2, #3)
  - [x] Import `useMutation`, `useQueryClient`, and `type UseMutationResult` from `@tanstack/solid-query` alongside the existing `useQuery`/`UseQueryResult` imports.
  - [x] Import `tasksApi`, `type Task`, and `type TasksPostBody` from `./api`. Import `tasksQueryKey` from `./keys`.
  - [x] Define the mutation context type: `type CreateTaskContext = { previous: Task[] };` (kept local to the file — the context is implementation detail).
  - [x] Export `useCreateTask`:
    ```ts
    export const useCreateTask = (): UseMutationResult<Task, Error, TasksPostBody, CreateTaskContext> => {
      const queryClient = useQueryClient();
      return useMutation<Task, Error, TasksPostBody, CreateTaskContext>(() => ({
        mutationFn: (input) => tasksApi.create(input),
        onMutate: async (input) => {
          await queryClient.cancelQueries({ queryKey: tasksQueryKey });
          const previous = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [];
          const now = Date.now();
          const optimistic: Task = {
            id: input.id,
            text: input.text,
            completed: false,
            createdAt: now,
            updatedAt: now,
          };
          queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => [optimistic, ...(prev ?? [])]);
          return { previous };
        },
      }));
    };
    ```
  - [x] **Do not add `onError`, `onSuccess`, or `onSettled` callbacks.** The no-rollback contract requires the absence of `onError`. The no-invalidation contract requires the absence of `onSuccess`/`onSettled` (or that they are empty bodies).
  - [x] Verify the v5 Solid Query `useMutation` signature in `node_modules/@tanstack/solid-query/dist/...types.d.ts` if the type system pushes back. Solid Query v5 takes a **factory function** (the `() => ({...})` form), matching `useTasks`'s precedent.
  - [x] Confirm `useQueryClient()` returns a queryClient bound to the `<QueryClientProvider>` mounted in `apps/web/src/index.tsx` (Story 1.5).

- [x] **Task 3 — Wire `App.tsx` to `useCreateTask`** (AC: #5, #9)
  - [x] In `apps/web/src/App.tsx`, import `useCreateTask` from `./data/queries` and `createUuidV7` from `./data/uuid`.
  - [x] Replace the `handleTaskSubmit` no-op stub with:
    ```tsx
    export function App(): JSX.Element {
      const createTask = useCreateTask();
      const handleTaskSubmit = (text: string): void => {
        createTask.mutate({ id: createUuidV7(), text });
      };
      return (
        <main class="app-shell">
          <TaskInput onSubmit={handleTaskSubmit} />
          <TaskList />
        </main>
      );
    }
    ```
  - [x] Generate the UUIDv7 inside `handleTaskSubmit`, **not** inside the mutation hook's `onMutate`. The id must be present in the mutation **input variables** so Story 1.9 can address rows by id from `mutation.variables.id`.
  - [x] Do **not** `await` `createTask.mutate(...)` — fire-and-forget is the optimistic UI contract. The user-visible state change happens inside `onMutate` synchronously.
  - [x] Do **not** trim, normalize, or otherwise mutate `text` inside `handleTaskSubmit` — Story 1.6's TaskInput already trims and blocks whitespace-only submits before calling `onSubmit`.
  - [x] Do not add any error handling (try/catch, `.catch()`, conditional re-render) inside `handleTaskSubmit`. TanStack Query observes `onError`; per AC #3 we deliberately do nothing on error in this story.
  - [x] Keep the `<TaskList />` mount unchanged. `TaskList` continues to consume `useTasks` independently — the optimistic prepend lands in the same `["tasks"]` cache the list reads, so the new row appears in the rendered `<For each={query.data ?? []}>` automatically.

- [x] **Task 4 — Author `useCreateTask` unit tests in `queries.test.tsx`** (AC: #10, #14)
  - [x] In `apps/web/src/data/queries.test.tsx`, add a new `describe("useCreateTask")` block **after** the existing `describe("useTasks")` block. Reuse the same `mockTask` factory, `makeClient`, `renderWithClient`, `yieldToEventLoop`, and `waitFor` helpers (they are file-scope already).
  - [x] Add a `let originalCreate: typeof tasksApi.create;` and a `let originalCreateFetch: typeof tasksApi.createFetch;` capture in `beforeEach` (sibling to the existing `originalFetch` capture) and restore both in `afterEach` to keep test isolation.
  - [x] **Probe component pattern.** Mirror the `Probe` component in the existing `useTasks` tests, but expose the mutation observer by calling `useCreateTask()` inside the component and capturing it in a module-scoped `let mutation: ReturnType<typeof useCreateTask> | undefined` via a `createEffect`. The mutation observer is reactive — read its values via `createEffect(() => { snapshot = { isPending: mutation.isPending, isError: mutation.isError, data: mutation.data, error: mutation.error }; })`.
  - [x] **Test 4.1 — `onMutate` prepends optimistic row.** Pre-seed cache with one task. Stub `tasksApi.create = mock(() => new Promise<Task>(() => {}))`. Render. Call `mutation.mutate({ id: "0193f000-0000-7000-8000-00000000000a", text: "new" })`. Yield to event loop. Read cache via `client.getQueryData<Task[]>(tasksQueryKey)`. Assert length 2; first element has the mutate `id` and `text`, `completed: false`; second element is the pre-seeded task unchanged.
  - [x] **Test 4.2 — `mutationFn` calls `tasksApi.create` with mutate variables.** Stub `tasksApi.create = mock((input) => Promise.resolve(serverTask))`. Trigger `mutation.mutate({ id, text })`. Wait for `mutation.isSuccess`. Assert the `tasksApi.create` mock was called exactly once with `{ id, text }`.
  - [x] **Test 4.3 — No invalidation on success.** Replace `client.invalidateQueries` with `mock(...)` (write to `client.invalidateQueries = ...` in the test; restore in `afterEach`). Stub `tasksApi.create` to resolve. Trigger mutation. Wait for `mutation.isSuccess`. Assert the `invalidateQueries` mock was **not** called (`mock.calls.length === 0`).
  - [x] **Test 4.4 — No rollback on error.** Pre-seed cache with one task. Stub `tasksApi.create` to reject (`mock(() => Promise.reject(new Error("network")))`). Trigger mutation with an explicit retry-disabled mutation client default (`new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retryDelay: 0 } } })` — extend `makeClient` or create a sibling helper). Wait for `mutation.isError === true`. Read cache. Assert length is still 2, optimistic row still at index 0.
  - [x] **Test 4.5 — `cancelQueries` runs before `mutationFn`.** Replace `client.cancelQueries` with a `mock(() => Promise.resolve())`. Stub `tasksApi.create` with a mock that captures `client.cancelQueries.mock.calls.length` at the moment of invocation: `tasksApi.create = mock(() => { capturedCancelCount = (client.cancelQueries as { mock: { calls: unknown[] } }).mock.calls.length; return Promise.resolve(serverTask); });`. Trigger mutation. Wait for `mutation.isSuccess`. Assert `capturedCancelCount === 1` (exactly one `cancelQueries` call had completed before `tasksApi.create` was invoked).
  - [x] All five tests use `afterEach(() => { tasksApi.create = originalCreate; tasksApi.createFetch = originalCreateFetch; cleanup(); });` — keep the existing `cleanup()` call.

- [x] **Task 5 — Author `e2e/capture.spec.ts`** (AC: #11)
  - [x] Create `e2e/capture.spec.ts`. Mirror the structure of `e2e/smoke.spec.ts` (Playwright `test` from `@playwright/test`, `page.goto("/")`, locator-first assertions).
  - [x] **Pre-test state cleanup.** Each test starts from a fresh empty list. Strategy: reuse the dev-server's `/api/tasks` seed from `compose.yaml`-less dev (the SQLite file at `./tasks.db` from `apps/api/src/env.ts`'s default). Two acceptable approaches: (a) clear via DELETE at fixture setup (Story 3.1 owns DELETE — not yet shipped), or (b) `await page.request.fetch("/api/tasks")` to read the current list and skip if non-empty / accept a non-empty pre-state and assert deltas instead of absolute counts. **Use approach (b)** — assert deltas by capturing the pre-test listitem count and asserting post-test count is `pre + 1`. This decouples the spec from a delete endpoint that does not yet exist.
  - [x] **Test 5.1 — happy path.** Goto, capture current listitem count (`page.getByRole("listitem").count()`). Type "buy milk" in the auto-focused input. Press Enter. Assert (a) a new `listitem` containing "buy milk" appears (delta = 1), (b) the input's value is empty, (c) the input is still focused, (d) `page.locator('[aria-label="Saving"]')` count is 0 (no SyncIndicator), (e) `page.getByRole("status")` count is 0 (no toast).
  - [x] **Test 5.2 — optimistic-window assertion.** Use `await page.route("**/api/tasks", async (route) => { if (route.request().method() === "POST") { await new Promise((r) => setTimeout(r, 800)); await route.continue(); } else { await route.continue(); } });` before `page.goto`. Capture pre-count. Type and press Enter. Assert `await expect(listitem).toBeVisible({ timeout: 100 })` — the row must paint within 100 ms even though the network round-trip is artificially delayed by 800 ms.
  - [x] **Test 5.3 — newest-first ordering with two captures.** Type "first" + Enter, wait for listitem. Type "second" + Enter, wait for listitem. Assert the first listitem's text contains "second" (newest at top — FR2, ARCH-AR7) and the second listitem's text contains "first".
  - [x] **Test 5.4 — axe-core on populated state.** After test 5.1's capture, run `await new AxeBuilder({ page }).analyze()`. Filter results to `impact === "critical" || impact === "serious"`. Assert filtered violations is empty. Import `AxeBuilder` from `@axe-core/playwright` (already a root devDep — no install required).
  - [x] Use the existing `playwright.config.ts` chromium / firefox / webkit projects. The `webServer` config already starts `bun run dev` (Vite + bun --watch backend), so the spec runs against a real backend. **Do not** add a separate test-only API server.
  - [x] **Do not** modify `e2e/smoke.spec.ts` — it is the baseline boot-and-focus assertion and predates this spec.
  - [x] If `bun run check:release` (which runs all Playwright projects + axe + Lighthouse) is too slow for the dev loop, run `bun playwright test e2e/capture.spec.ts --project=chromium` directly during iteration; the full release gate runs in `check:release` only.

- [x] **Task 6 — Verify quality gates** (AC: #12, #13, #14)
  - [x] Run `bun run check`. Must pass: oxlint (no `console.log`, no `any`, named exports only, no default exports, no magic numbers, import order), oxfmt, tsgo `-b --noEmit`, dep-count.
  - [x] Run `bun run check:full`. Must pass: above + `bun test apps --conditions=browser` (all unit tests, including the new `describe("useCreateTask")` block) + `bun audit --audit-level=high` + `bun run build` (Vite build) + bundle-size check (`scripts/check-bundle-size.sh` keeps the main chunk well under 100 KB gz; this story adds < 1 KB to the bundle).
  - [x] Run `bun playwright test e2e/capture.spec.ts --project=chromium` (or the full triple — chromium + firefox + webkit) against a clean dev server. Must pass.
  - [x] Run `bun run dev` and visually verify in a browser: type a task, press Enter, observe (a) the row appears immediately at the top of the list, (b) the input clears, (c) the input keeps focus, (d) no spinner, no toast, no SyncIndicator visible (round-trip is < 300 ms locally), (e) refresh the page and confirm the task persists (Story 1.4's POST /api/tasks committed it to SQLite). **(Substituted by automation — see deviation #4 in Completion Notes; Playwright happy-path spec asserts a–d cross-browser, and a live `/api/tasks` POST + GET smoke confirmed persistence + 201/200 idempotency.)**
  - [x] Throttle DevTools network to "Slow 3G" and repeat: confirm the row still appears immediately on Enter — the user-visible action is independent of network. (At < 300 ms the SyncIndicator does not render in this story; Story 1.9 adds it. Beyond 300 ms with this story alone, the row simply stays without indicator until the network resolves — that is expected mid-story behavior.) **(Substituted by automation — see deviation #4 in Completion Notes; the optimistic-window Playwright spec injects an 800 ms artificial delay and asserts the row paints within 100 ms cross-browser, which is a stronger guarantee than Slow-3G manual throttling.)**
  - [x] Record any deviations (Eden type-cast extensions, test-stub mechanism choices, Playwright timing-window margins) in the Dev Agent Record.

### Review Findings

Code review run on 2026-05-01 across three parallel adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor returned **clean** against the spec — all 16 acceptance criteria satisfied. Adversarial layers raised ~43 candidate findings; after triage two items merit deferral.

**Post-review smoke test surfaced a Story 1.5 regression** that the audit missed: manual `bun run dev` + capture + reload showed nothing persisted. The Eden treaty client at `apps/web/src/data/api.ts:4` was constructed as `treaty<App>("/")` — Eden treats the first arg as a hostname and prepends `https://`, then strips the trailing `/`, producing requests against host `api` (DNS error). Every Story 1.7 / 1.8 unit test stubbed `tasksApi.fetch` / `tasksApi.create`, bypassing URL construction; the four Story 1.8 e2e tests verified only the optimistic UI (which paints synchronously regardless of network success) and the no-rollback contract masked the silent failure visually. Three follow-ups applied as part of this story's review pass:

- [x] [Review][Patch] Fix Eden treaty base URL [`apps/web/src/data/api.ts:9`] — replaced `treaty<App>("/")` with `treaty<App>(globalThis.location?.origin ?? "http://localhost")`. Eden detects `://` in an origin string and skips the protocol-prepend; in dev the SPA now hits `http://localhost:5173/api/tasks` (Vite proxies to :3000), in prod the same-origin request hits the API directly.
- [x] [Review][Patch] Add reload-persistence regression test [`e2e/capture.spec.ts:68`] — new spec captures a task, awaits the POST `2xx` response (so a DNS-failed request would time out), reloads the page, and asserts the row is still visible. Closes the gap that let the Story 1.5 regression survive two stories.
- [x] [Review][Defer] e2e test isolation — shared dev DB across tests/runs [`e2e/capture.spec.ts`] — only the happy-path test honors the spec's delta-based count-stable assertion; tests 5.2 / 5.3 / 5.4 / persistence rely on `Date.now()`-suffixed unique text instead of count deltas, and there is no cross-run DB cleanup. Compounds the Story 1.5/1.7 deferred test-isolation concerns. Pre-existing project-wide.
- [x] [Review][Defer] `previous` mutation context retains live array reference [`apps/web/src/data/queries.ts:35`] — `getQueryData<Task[]>(...) ?? []` returns the cache's actual array reference, not a snapshot. Currently safe because the functional updater on line 44 returns a new array, but Story 1.9's planned `onError: setQueryData(..., previous)` rollback would write back the same reference, leaving cross-mutation rollbacks vulnerable to in-place mutation. Hand-off note for the Story 1.9 author.

## Dev Notes

### Critical Context

This is the **first mutation hook** in the app. Stories 1.5 / 1.7 wired the read path (`<QueryClientProvider>`, `useTasks`, `tasksApi.list`). Story 1.8 introduces the write path through TanStack Query's `useMutation`. The product visibly transitions from "read-only list of tasks I cannot create" to "I press Enter and a task appears instantly". After this story, opening the app, typing, and pressing Enter is a complete capture loop with persistent storage — the project's defining interaction (UX spec: *"the single defining interaction is task capture"*).

The story is **the optimistic happy path only**, intentionally separated from sync-pending / retry-exhausted UX (Story 1.9) and list-level fetch-error UX (Story 1.10). Keep the boundaries clean:

- **No retry policy.** TanStack Query mutation defaults give 0 retries unless explicitly configured. Story 1.9 layers the per-status retry policy (429 honors `Retry-After` up to 4 attempts; 5xx up to 3; other 4xx fail-fast — ARCH-AR11). For this story, mutation `retry` is unset (default 0).
- **No SyncIndicator.** Story 1.9 introduces the 300 ms pending threshold and the SyncIndicator sub-component on TaskRow. For this story, the row simply appears and waits silently; no indicator renders.
- **No retry-exhausted state.** Story 1.9 introduces the inline ErrorMessage + RetryAction + `status.error.subtle` row background. For this story, `onError` is empty (no rollback, no surfacing).
- **No LiveRegion announcement on capture.** UX-DR16 makes capture silent. The "Saving…" / "Saved" announcements are exclusively Story 1.9's territory (they fire only when the mutation has been pending > 300 ms).

The story's **product-visible failure modes** to avoid:

- Any visible animation on row insert. UX-DR16 / `motion.instant` is load-bearing. A CSS transition, Solid `<Transition>`, or keyframes on `<TaskRow>` mount reads as latency and contradicts FR23's "appears immediately" promise.
- A success toast / banner / snackbar. UX-DR16 makes capture silent.
- A roll-back on error that briefly re-empties the cache and removes the user's typed task from the list. The no-rollback contract is a UX commitment, not an implementation detail.
- Generating the UUIDv7 in two places (e.g., once in `handleTaskSubmit` for the POST body and once in `onMutate` for the optimistic row). The two ids would differ; the optimistic row would have a different `id` than the server-returned row; the server-returned row would later show up as a duplicate. **Generate the id exactly once, in `handleTaskSubmit`, and pass it as the mutation input.**
- Awaiting the mutation in `handleTaskSubmit`. `await mutate(...)` would block until the network resolved before the input was treated as "captured" — the entire point of optimistic UI is bypassing the await.

### Locked Decisions (carry-forward from Stories 1.5–1.7)

- Frontend framework: SolidJS 1.9.12. `createSignal`, `onMount`, `createEffect`, `onCleanup`, `<For>`, `<Show>`. **Never destructure props.**
- Server-state cache: `@tanstack/solid-query@5.100.6`. `useMutation` v5 takes a factory-function-shape (`() => ({...})`), matching `useQuery`'s precedent. `useQueryClient()` accesses the singleton mounted in `index.tsx`.
- API typing: Eden Treaty (`@elysiajs/eden@1.4.9`). All API calls go through `apps/web/src/data/api.ts`. Components never import `api` or `tasksApi`.
- Architecture component-↔-data boundary: components consume data exclusively through TanStack Query hooks. `App.tsx` is the only consumer of `useCreateTask` (it owns `handleTaskSubmit`); `TaskInput` and `TaskList` do not consume mutation hooks in this story. `useTasks` continues to be consumed only by `TaskList`.
- Styling: UnoCSS + token CSS custom properties.
- No raw `fetch`. No inline SQL. No `console.log`. No magic numbers (the `now` in `onMutate` is a runtime expression, not a magic number). No `any`. Named exports only.
- bun:test idiom: `describe(...)` + `it(...)`.
- Component tests use `@solidjs/testing-library` + happy-dom (preloaded by `apps/web/test-setup/happy-dom.ts` in `bunfig.toml`). Story 1.6's `--conditions=browser` flag is required (`bun run test` already wires it).
- Test seam mutability: `tasksApi.fetch`, `tasksApi.list`, and (new) `tasksApi.create` / `tasksApi.createFetch` are writable properties on a module-level mutable object. Story 1.7's deviation #2 documents this seam; Story 1.8 extends it with the same pattern.
- LiveRegion's three latent issues (Story 1.5 deferred-work item) are still latent — but Story 1.8 deliberately does not call `LiveRegion.announce(...)` on capture, so we don't trip them. Story 1.9's "Saving…" / "Saved" announcements are where those issues become live (a queue + ref-based mount sentinel may be needed there).

### Mutation Hook Implementation Sketch

```ts
// apps/web/src/data/queries.ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/solid-query";
import { tasksApi, type Task, type TasksPostBody } from "./api";
import { tasksQueryKey } from "./keys";

type CreateTaskContext = { previous: Task[] };

export const useTasks = (): UseQueryResult<Task[], Error> => /* unchanged from 1.7 */;

export const useCreateTask = (): UseMutationResult<Task, Error, TasksPostBody, CreateTaskContext> => {
  const queryClient = useQueryClient();
  return useMutation<Task, Error, TasksPostBody, CreateTaskContext>(() => ({
    mutationFn: (input) => tasksApi.create(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [];
      const now = Date.now();
      const optimistic: Task = {
        id: input.id,
        text: input.text,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => [optimistic, ...(prev ?? [])]);
      return { previous };
    },
    // No onError, onSuccess, onSettled — the no-rollback / no-invalidation contract is the absence of these callbacks.
  }));
};
```

Notes:

- The `() => ({...})` factory shape is the v5 Solid Query pattern; bare object would be the React-Query idiom and doesn't reactively re-track the mutation options.
- `useQueryClient()` returns the same client wired in `index.tsx` (`new QueryClient()` at module-init in Story 1.5). It is reactive in Solid Query — no extra wrapping needed.
- The context type (`CreateTaskContext`) is used by TanStack to thread `onMutate`'s return through to `onError` / `onSuccess` / `onSettled`. We *don't* consume it in this story (no rollback), but typing it now means Story 1.9's retry / sync-pending wiring inherits the typed `previous` snapshot for free.

### TaskInput → Mutation Integration Sketch

```tsx
// apps/web/src/App.tsx
import type { JSX } from "solid-js";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";
import { useCreateTask } from "./data/queries";
import { createUuidV7 } from "./data/uuid";

export function App(): JSX.Element {
  const createTask = useCreateTask();
  const handleTaskSubmit = (text: string): void => {
    createTask.mutate({ id: createUuidV7(), text });
  };
  return (
    <main class="app-shell">
      <TaskInput onSubmit={handleTaskSubmit} />
      <TaskList />
    </main>
  );
}
```

Notes:

- `createTask` is captured at component scope (not re-created per submit). The mutation observer's `mutate` is stable across renders.
- `createUuidV7()` is called inside `handleTaskSubmit`, not at component scope, so each submit gets a fresh time-ordered id.
- The optimistic row's `createdAt`/`updatedAt` are `Date.now()` from inside `onMutate` — close enough to "now" that the row sorts correctly relative to other newly-typed tasks. The server's `created_at` may be a few milliseconds later (network round-trip), but since the canonical `id` (UUIDv7) is what `ORDER BY id DESC` sorts by on the backend, the timestamps are display-only and the sort stays stable.

### `tasksApi.create` Implementation Sketch

```ts
// apps/web/src/data/api.ts (additions)
export type TasksPostBody = { id: string; text: string };
export type TasksPostResponse = {
  data: Task | null;
  error: { status: number; value: unknown } | null;
};

const tasksPost = (body: TasksPostBody): Promise<TasksPostResponse> =>
  (
    api.api as unknown as {
      tasks: { post: (body: TasksPostBody) => Promise<TasksPostResponse> };
    }
  ).tasks.post(body);

export const tasksApi = {
  fetch: tasksGet,
  list: async (): Promise<Task[]> => { /* unchanged from 1.7 */ },
  createFetch: tasksPost,
  create: async (input: TasksPostBody): Promise<Task> => {
    const { data, error } = await tasksApi.createFetch(input);
    if (error) {
      const envelopeMessage = (error.value as { error?: { message?: string } } | undefined)?.error
        ?.message;
      throw new Error(envelopeMessage ?? `tasks create failed: HTTP ${error.status}`);
    }
    if (data === null) {
      throw new Error("tasks create returned null data");
    }
    return data;
  },
};
```

Notes:

- The cast extension on `api.api` mirrors deviation #4 from Story 1.7. The cast surface stays narrow — only `tasks.get` and `tasks.post` are exposed; nothing leaks into the rest of `apps/web`.
- The `createFetch` / `create` split mirrors `fetch` / `list` — `createFetch` is the raw Eden seam (mocked in tests when the test wants to exercise envelope-parsing); `create` is the consumer-facing throwing wrapper. Tests can mock either layer depending on what the test wants to exercise. AC #10 tests mock `tasksApi.create` directly (the high-level seam); a future Story 1.9 retry-policy test may mock `tasksApi.createFetch` to simulate specific HTTP statuses.
- The Story 1.4 contract: POST returns `201 Task` on create, `200 Task` on idempotent retry (same id + same text), `409 id_conflict` on same id + different text, `400 validation_error` on bad body, `429 rate_limited` under burst. Story 1.8's UI does not differentiate among these — `tasksApi.create` returns the `Task` on success (201 or 200) and throws on any error. Story 1.9 will inspect `error.status` to drive retry policy.

### Test Stub Strategy for `useCreateTask`

The cleanest stub mechanism (mirroring Story 1.7's `useTasks` tests) is to swap `tasksApi.create` directly:

```ts
let originalCreate: typeof tasksApi.create;

beforeEach(() => {
  originalCreate = tasksApi.create;
});

afterEach(() => {
  tasksApi.create = originalCreate;
});

it("...", () => {
  tasksApi.create = mock(() => Promise.resolve(serverTask));
  // ...
});
```

For tests that need to exercise the envelope-parsing path inside `tasksApi.create` (e.g., to assert the thrown message includes the envelope `error.code`), mock `tasksApi.createFetch` instead — the same pattern, one layer down. AC #10 doesn't require the envelope-parse coverage in this story; defer it to Story 1.9 where retry / status semantics make it relevant.

For tests that need to assert against `client.invalidateQueries` or `client.cancelQueries`, replace those methods on the test client instance directly:

```ts
const client = makeClient();
const invalidateMock = mock(() => Promise.resolve());
client.invalidateQueries = invalidateMock as unknown as typeof client.invalidateQueries;
// ... afterEach: cleanup() restores via fresh client per test
```

Each `it()` should construct a **fresh** `QueryClient` via `makeClient()` so the stubs don't bleed across tests. The existing `makeClient()` helper already does this.

### Playwright `e2e/capture.spec.ts` Sketch

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("capture happy path renders the task and clears + refocuses the input", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();

  const preCount = await page.getByRole("listitem").count();
  await input.fill("buy milk");
  await input.press("Enter");

  const newRow = page.getByRole("listitem").filter({ hasText: "buy milk" });
  await expect(newRow).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.locator('[aria-label="Saving"]')).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await page.getByRole("listitem").count()).toBe(preCount + 1);
});

test("optimistic-window: row appears within 100 ms even on a slow network", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((r) => setTimeout(r, 800));
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  await input.fill("slow net task");
  await input.press("Enter");
  await expect(
    page.getByRole("listitem").filter({ hasText: "slow net task" }),
  ).toBeVisible({ timeout: 100 });
});

test("two captures produce newest-first ordering", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("New task");
  await input.fill("first");
  await input.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: "first" })).toBeVisible();
  await input.fill("second");
  await input.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: "second" })).toBeVisible();
  const items = page.getByRole("listitem");
  await expect(items.first()).toContainText("second");
  await expect(items.nth(1)).toContainText("first");
});

test("axe-core reports no critical/serious violations on the populated state", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("New task");
  await input.fill("a11y check");
  await input.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: "a11y check" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking).toEqual([]);
});
```

Notes:

- The dev server is reused across tests (`reuseExistingServer: !process.env.CI` in `playwright.config.ts`), so each test sees the persisted SQLite state from prior tests. **The delta-count assertion in test 5.1 is robust to this.** The two-capture ordering assertion is robust as long as the most-recently-inserted task appears at index 0 (UUIDv7 monotonic prefix guarantees this for tasks created within the same dev-server session).
- `page.route` only takes effect for the test's `BrowserContext`; it does not leak between tests in `fullyParallel: true` mode (Playwright's default). Story 1.8's `playwright.config.ts` already sets `fullyParallel: true`.
- The 100 ms timeout in test 5.2 is intentionally tight — anything > 100 ms fails the optimistic-window contract. If happy-dom-style flakiness emerges, raise to 200 ms but log it as a deviation.

### Previous Story Intelligence (Stories 1.5 + 1.6 + 1.7 carryover)

**Story 1.5 (frontend foundation):**
- `<QueryClientProvider client={queryClient}>` wraps `<App />` in `index.tsx`. **Do not change this.** `useQueryClient()` inside `useCreateTask` accesses the same singleton.
- `<LiveRegion />` mounted exactly once at `index.tsx`. Story 1.8 deliberately does not call `LiveRegion.announce(...)` (silent capture per UX-DR16); Story 1.9 will.
- `<ErrorBoundary>` catches render errors only — not mutation `onError` (TanStack Query observes those, and per AC #3 we deliberately do nothing on mutation error).
- `apps/web/src/data/uuid.ts` exports `createUuidV7()` — Story 1.8 is the first runtime consumer (Story 1.7 imported the type only). The function is pure, ~40 LOC, generates a time-ordered v7 with monotonic-within-millisecond sequencing. The deferred-work item about the unbounded sequence-overflow path (Story 1.5's deferred section) is not exercised by single-keypress capture; revisit when bulk import or backend-issued UUIDv7s become a concern.

**Story 1.6 (TaskInput):**
- `apps/web/src/components/TaskInput.tsx` is the input component. **Do not modify.** Its `onSubmit(text: string)` callback receives the trimmed, non-empty text on Enter. Whitespace-only and Shift+Enter are blocked at the component level. The IME composition guard (`if (event.isComposing) return;`) is in place.
- `apps/web/src/components/TaskInput.test.tsx` is the unit test for TaskInput. **Do not modify.** Its "retains focus after Enter / Escape" assertions are happy-dom-trivial (deferred-work from Story 1.6); the real focus-after-submit verification properly belongs in `e2e/capture.spec.ts` — that's exactly what AC #11 builds. Treat the Playwright spec as the canonical focus-retention coverage going forward.
- `bun run test` (= `bun test apps --conditions=browser`) is the canonical test invocation. happy-dom preload lives in `apps/web/test-setup/happy-dom.ts`, configured in `bunfig.toml`'s `[test] preload`.

**Story 1.7 (TaskList):**
- `apps/web/src/components/TaskList.tsx` consumes `useTasks` and renders the four list states. **Do not modify** — the optimistic prepend lands in the same `["tasks"]` cache TaskList reads, so the new row appears in the rendered `<For>` automatically. No code change to TaskList is needed.
- `apps/web/src/components/TaskRow.tsx` renders the active state of a task with co-located Checkbox / DeleteButton sub-components. **Do not modify** in this story (Stories 2.2 / 3.2 own those interaction wirings). The XSS regression test in `TaskRow.test.tsx` continues to enforce that `task.text` renders as literal text — including for the new optimistic row, since it flows through the same `<TaskRow task={task} />` JSX path with no special-casing.
- `apps/web/src/data/api.ts` exports the mutable `tasksApi` object (deviation #2) and the `as unknown as { tasks: { get: ... } }` cast (deviation #4). Story 1.8 extends both: `tasksApi.create` / `tasksApi.createFetch` properties; cast extended with `post` accessor.
- `apps/web/src/data/queries.test.tsx` is the home for query-hook unit tests. Story 1.8 extends it (does not create a new file) with the `describe("useCreateTask")` block. The `Probe` pattern + `waitFor` helper + `tasksApi.fetch` swap-in are reusable verbatim.
- The `retryDelay: 0` test-client default (deviation #5) is for the queries side; the new `useCreateTask` tests should set `defaultOptions: { mutations: { retry: false } }` on the test client to keep error-path tests deterministic.

### Git Intelligence Summary (recent commits)

- `7e7e00e Story 1.7` — `useTasks` query hook, four-state TaskList, TaskRow active-state rendering, EmptyState, LoadingState, XSS regression. **Most relevant precedent.** Read `apps/web/src/components/TaskList.tsx`, `apps/web/src/data/queries.ts`, `apps/web/src/data/queries.test.tsx`, and `apps/web/src/data/api.ts` for the exact patterns to extend.
- `30def48 Story 1.6` — TaskInput component + happy-dom test setup. The `onSubmit(text: string)` contract is defined here.
- `1692502 Story 1.5` — frontend foundation. `<QueryClientProvider>` + `<LiveRegion />` + `<ErrorBoundary>` mount layout in `index.tsx`. UUIDv7 generator in `data/uuid.ts`.
- `8e3f0d2 Review story 1.4` + `44bb1c5 Dev story 1.4` — backend `GET`/`POST /api/tasks` ship the contract Story 1.8 consumes: 201 on create, 200 on idempotent retry, 409 on id_conflict, 400 / 429 envelopes per ARCH-AR8.

### File Structure Requirements

**Create:**

```text
e2e/capture.spec.ts                                   # AC #11
```

**Modify:**

```text
apps/web/src/App.tsx                                  # wire useCreateTask + createUuidV7
apps/web/src/data/api.ts                              # add tasksApi.create + tasksApi.createFetch + Eden cast extension
apps/web/src/data/queries.ts                          # add useCreateTask
apps/web/src/data/queries.test.tsx                    # add describe("useCreateTask") block
```

**Do not modify** without strong cause:

```text
apps/web/src/index.tsx                                # QueryClient mount is correct
apps/web/src/components/TaskInput.tsx                 # Story 1.6 contract; do not touch
apps/web/src/components/TaskInput.test.tsx            # Story 1.6 tests; do not touch
apps/web/src/components/TaskList.tsx                  # Story 1.7 contract; the optimistic prepend reaches it via shared cache
apps/web/src/components/TaskList.test.tsx             # Story 1.7 tests; do not touch
apps/web/src/components/TaskRow.tsx                   # Story 1.7 active-state rendering; mutation wiring is Stories 2.2 / 3.2
apps/web/src/components/TaskRow.test.tsx              # XSS regression continues to enforce literal-text rendering
apps/web/src/components/EmptyState.tsx                # no change
apps/web/src/components/LoadingState.tsx              # no change
apps/web/src/components/LiveRegion.tsx                # silent capture; do not touch
apps/web/src/components/ErrorBoundary.tsx             # render errors only
apps/web/src/data/uuid.ts                             # consumed, not modified
apps/web/src/data/keys.ts                             # tasksQueryKey already exported
apps/web/src/styles/reset.css                         # no styling change in this story
apps/web/src/styles/tokens.css                        # token set is complete
apps/web/uno.config.ts                                # no token change
apps/api/**                                           # backend untouched (Story 1.4 ships POST /api/tasks)
e2e/smoke.spec.ts                                     # baseline boot-and-focus assertion; do not change
playwright.config.ts                                  # config is correct as-is
bunfig.toml                                           # test preload is correct as-is
package.json (root) and apps/web/package.json         # no new deps
```

### Architecture Boundaries Reaffirmed

- **API boundary:** `Task` and the mutation request/response shapes flow from `apps/api/src/routes/tasks.ts` → `apps/api/src/index.ts` (App type export) → `@bmad-todo-app/api` package re-export → `apps/web/src/data/api.ts` (Eden + re-export) → `apps/web/src/data/queries.ts` → `apps/web/src/App.tsx` (the `mutate` call). **No runtime backend code crosses this boundary.** Use `import type` for `Task`.
- **Component-↔-data boundary:** Components consume data exclusively through TanStack Query hooks. `App.tsx` is the only consumer of `useCreateTask` in this story. `TaskInput` and `TaskList` do not change. The mutation hook is the only consumer of `tasksApi.create`.
- **Storage boundary:** untouched — backend is unchanged.
- **Configuration boundary:** untouched — no env access added.

### Anti-Patterns to Avoid

- **Do not** generate the UUIDv7 inside `onMutate`. Generate it inside `handleTaskSubmit` and pass it as the mutation input variable. The id is part of the public mutation contract; Story 1.9 will read it from `mutation.variables.id` to address rows by id.
- **Do not** call `queryClient.invalidateQueries(tasksQueryKey)` from `onSuccess` or `onSettled`. The optimistic prepend matches the server result — invalidation would trigger a refetch that briefly shows the same cached state (best case) or a network round-trip that flickers the list (worst case).
- **Do not** call `queryClient.setQueryData(tasksQueryKey, context.previous)` from `onError`. The no-rollback contract is the hinge of UX-DR16 / FR27. Story 1.9's row-local sync-pending and retry-exhausted states depend on the optimistic row staying in place.
- **Do not** await `createTask.mutate(...)` inside `handleTaskSubmit`. The optimistic UI update happens inside `onMutate` synchronously; awaiting blocks until the network resolves and defeats the optimistic UX.
- **Do not** add `mutationKey: ["tasks", "create"]` to the mutation. Story 1.9 may introduce a mutation key for retry-state addressability; Story 1.8 keeps the mutation key implicit (TanStack auto-generates one).
- **Do not** add `retry: 2` (or any other retry count) to `useCreateTask`. Story 1.9 owns the retry policy.
- **Do not** add a CSS transition / keyframes / Solid `<Transition>` / row-mount animation to `TaskRow` for inserts. UX-DR16 / `motion.instant` is a load-bearing rule.
- **Do not** wire `<Show when={createTask.isPending}>` UI in `App.tsx` or any component. Story 1.9 owns the SyncIndicator.
- **Do not** call `LiveRegion.announce(...)` from `onMutate`, `onSuccess`, `onSettled`, or `onError`. Capture is silent per UX-DR16. Story 1.9's "Saving…" / "Saved" announcements are conditional on the 300 ms threshold.
- **Do not** introduce a toast, snackbar, or banner for capture success or failure. UX-DR16 forbids it. Story 3.4's UndoSnackbar is the only floating UI element on the project's whiteboard, and it is delete-specific.
- **Do not** trim, lowercase, or otherwise normalize `text` inside `handleTaskSubmit`. TaskInput already trims; the backend validates `t.String({ minLength: 1, maxLength: 500 })`. Trimming here would silently double-trim and create a divergence between the client and server views of "the same" text.
- **Do not** import `api` (the raw Eden client) from any component. The architecture component-↔-data boundary requires components to consume data exclusively through hooks. `tasksApi.create` is exported for the mutation hook; the hook is exported for `App.tsx`.
- **Do not** call `useCreateTask` from `TaskInput` or `TaskList`. `App.tsx` is the only consumer (it owns `handleTaskSubmit`). This keeps TaskInput and TaskList stateless w.r.t. mutations and parallel to Story 1.7's "TaskList consumes useTasks" boundary.
- **Do not** add a new `data-testid` attribute. The `data-testid="skeleton-row"` from Story 1.7 is the only testid in the codebase; Story 1.7's anti-pattern note still applies. `getByRole`, `getByText`, and `getByLabelText` cover all the assertions.
- **Do not** modify `useTasks` to add `refetchOnMount` or any other refetch trigger. The architecture-locked tasks-query config (`staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 2`) is locked.
- **Do not** delete or rename `tasksApi.fetch` / `tasksApi.list`. Story 1.7's tests depend on those properties; renaming breaks `useTasks` tests.
- **Do not** introduce `useSuspenseMutation` or `useIsMutating`. Architecture forbids `useSuspenseQuery` at MVP; the same restraint applies to mutation Suspense surfaces.
- **Do not** update `e2e/smoke.spec.ts`. The baseline boot-and-focus spec is intentionally narrow.
- **Do not** add `--no-verify`, `// @ts-ignore`, or `// @ts-expect-error` to bypass type errors from the Eden cast extension. If the cast doesn't compile, pin the cast type more narrowly (`as unknown as { tasks: { post: (b: T) => Promise<R> } }` is the canonical shape — see Story 1.7 deviation #4).

### Project Structure Notes

The story aligns cleanly with the architecture's frontend layout (`apps/web/src/data/queries.ts`, `apps/web/src/data/api.ts` per `architecture/project-structure-boundaries.md`). The mutation hook (`useCreateTask`) lands alongside the existing query hook (`useTasks`); the API seam (`tasksApi.create` / `tasksApi.createFetch`) lands alongside the existing read seam (`tasksApi.list` / `tasksApi.fetch`). No new files in `apps/web/src/components/` are needed.

`e2e/capture.spec.ts` is the second of the five Playwright specs the architecture's `project-structure-boundaries.md` lists (`capture.spec.ts | manage.spec.ts | keyboard.spec.ts | error-recovery.spec.ts | empty-error-states.spec.ts`). Story 1.8 brings the count from one (`smoke.spec.ts`) to two; Story 1.10 will add `empty-error-states.spec.ts` and `error-recovery.spec.ts`; Story 1.11 will fill out the remaining specs.

### Testing Requirements

- **Unit test runner:** `bun:test`. Idiom: `describe(...)` + `it(...)`.
- **Component testing library:** `@solidjs/testing-library`. `render`, `cleanup`, `fireEvent`. `cleanup()` in `afterEach`.
- **DOM:** real DOM via the happy-dom registrator preload (already wired by Story 1.6).
- **Test invocation:** `bun run test` (root script — `bun test apps --conditions=browser`).
- **TanStack Query test client:** each `it()` constructs a fresh `QueryClient`. For `useCreateTask` tests, set `defaultOptions: { mutations: { retry: false }, queries: { retryDelay: 0 } }` so the error-path test resolves in milliseconds without waiting for default exponential backoff.
- **Stub seam:** `tasksApi.create = mock(...)` (and restore in `afterEach`). Same pattern as `tasksApi.fetch` from Story 1.7.
- **Mutation observer access in tests:** the `Probe` component captures `useCreateTask()` at module scope via a `createEffect` — same pattern as Story 1.7's `useTasks` Probe.
- **Cache assertions:** read via `client.getQueryData<Task[]>(tasksQueryKey)`. The optimistic prepend is observable immediately after `mutation.mutate(...)` returns (the `await queryClient.cancelQueries` resolves on the next microtask, so a single `await yieldToEventLoop()` is sufficient before reading the cache).
- **Method-spy seam:** for `client.invalidateQueries` / `client.cancelQueries` assertions, replace the method on the test client instance directly with `mock(...)` (TypeScript will require `as unknown as typeof client.invalidateQueries`). Each `it()` builds a fresh client, so no cross-test contamination.
- **Playwright:** chromium / firefox / webkit projects (already configured). `webServer` runs `bun run dev` automatically. `AxeBuilder` from `@axe-core/playwright` (already a root devDep). Use `page.getByLabel("New task")`, `page.getByRole("listitem")`, `page.getByRole("status")` — never CSS selectors when an accessibility query works (consistent with Story 1.5's accessibility-first posture).
- **Network stubbing in Playwright:** `await page.route("**/api/tasks", async (route) => { ... })`. Stub before `page.goto`. Restore is automatic per-test (route handlers are scoped to the BrowserContext).
- **Coverage target:** ≥ 80 % statements on `data/queries.ts` (+ the new mutation paths) and `data/api.ts` (+ the new `create`/`createFetch` paths). The five `useCreateTask` tests + the existing `useTasks` tests cover the surface comfortably.
- **No regression on Story 1.6 / 1.7 tests:** all 142+ existing tests must continue to pass. The new `describe("useCreateTask")` block is additive; the existing `describe("useTasks")` block is untouched.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.8-Optimistic-Task-Creation-Happy-Path] — story statement and BDD acceptance criteria.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-1-First-time-capture-happy-path] — capture flowchart, success-criteria gates (input focused on load, no spinner, no toast, input clears + stays focused, optimistic insert at top of list before network resolves).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-4-Error-recovery-network-failure] — silent < 300 ms success path; sync-pending after 300 ms (Story 1.9); retry-exhausted (Story 1.9); no-rollback contract.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback-Patterns] — silent success on capture and list resolution.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#motion-tokens-table] — `motion.instant` (0 ms) for optimistic task insertion / success-path commit.
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D7---Server-state-cache-tanstack-solid-query] — TanStack Solid Query config (mutations retry per-status — deferred to Story 1.9; `onError` does NOT roll back the optimistic update).
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D3---REST-API] — `POST /api/tasks` shape: 201 create / 200 idempotent retry / 409 id_conflict / 400 validation_error / 429 rate_limited; JSON keys camelCase.
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D1---Task-ID-generation] — Client-side UUIDv7 stored as TEXT PRIMARY KEY; `INSERT OR IGNORE` idempotency.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#TanStack-Solid-Query-rules] — Optimistic mutations always set `onMutate`, `onError`, `onSettled`. `onError` does **not roll back** the cache (UX contract — row-local sync state surfaces instead). One `mutationFn` per mutation.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Eden-Treaty-rules] — Chained access only; single Eden client at module scope; no raw fetch.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Solid-specific-rules] — Never destructure component props.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Anti-Patterns-forbidden] — no inline SQL, no `any`, no `console.log`, no magic numbers, no default exports.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Internal-request-flow-typical-mutation-task-creation] — TaskInput Enter → `useCreateTask().mutate({ id, text })` → `onMutate` → `setQueryData(["tasks"], optimistic-prepend)` → `mutationFn` → `api.api.tasks.post(...)` → backend → response → cache reconciliation (no-op).
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Architectural-Boundaries] — component-↔-data layer boundary; only hooks consume `api`.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Cross-Cutting-NFR-Locations] — NFR-M2 five Playwright specs; this story adds `e2e/capture.spec.ts`.
- [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements] — FR1 (≤ 500 chars), FR18 (input auto-focused on load), FR23 (creation appears to succeed immediately), FR27 (never silently lose), FR29 (idempotent on retry), NFR-S1 (XSS — XSS regression test in `TaskRow.test.tsx` continues to enforce).
- [Source: _bmad-output/implementation-artifacts/1-7-task-list-display-tasklist-taskrow-active-state-emptystate-loadingstate.md#Dev-Agent-Record] — `tasksApi` mutable seam (deviation #2), Eden type-narrowing cast (deviation #4), `retryDelay: 0` test default (deviation #5), `data-testid="skeleton-row"` as the only testid in the codebase.
- [Source: _bmad-output/implementation-artifacts/1-7-task-list-display-tasklist-taskrow-active-state-emptystate-loadingstate.md#Test-Stub-Strategy-for-Eden] — option-1 indirection wrapper pattern; Story 1.8 extends it with `tasksApi.create` / `tasksApi.createFetch`.
- [Source: _bmad-output/implementation-artifacts/1-6-taskinput-component-with-auto-focus-submit-and-character-counter.md#Dev-Agent-Record] — happy-dom + axe-core test pattern, `--conditions=browser` test invocation, `bun-plugin-solid` chain, restore-natives pattern, `onSubmit(text: string)` contract.
- [Source: _bmad-output/implementation-artifacts/1-5-frontend-foundation-solid-app-design-tokens-eden-client-errorboundary-liveregion.md#Dev-Agent-Record] — `<QueryClientProvider>` mount layout in `index.tsx`, `<LiveRegion />` mount, UUIDv7 generator implementation.
- [Source: _bmad-output/implementation-artifacts/1-4-backend-api-get-post-api-tasks-with-idempotency-and-per-ip-rate-limiting.md] — backend POST contract: 201 create / 200 idempotent retry / 409 id_conflict / 400 / 429; envelope shape `tasksApi.create` parses on failure.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — open deferred items relevant to this surface: LiveRegion `announce()` queue limitations (not exercised this story; Story 1.9 will hit them); Eden type-cast surface (extended this story; revisit when a clean type-pin pattern is found); `tasksApi` mutable seam (extended this story; revisit when Bun ships writable mock seams). None are blockers for Story 1.8.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `bun run check` → 0 oxlint warnings, oxfmt clean (after auto-fix on `queries.ts` + `queries.test.tsx`), tsgo `-b --noEmit` clean, dep counts unchanged (root 6/25, web 17/25, api 2/25).
- `bun run check:full` → 147 unit tests pass / 579 expects, project-wide coverage 97.04 % funcs / 96.42 % lines (threshold 70 %), `bun audit --audit-level=high` clean, Vite production build 25.69 KB gzipped main chunk (limit 100 KB).
- `bun playwright test e2e/capture.spec.ts` → 12/12 (chromium + firefox + webkit × 4 specs). Full e2e (capture + smoke) → 15/15.
- Live API smoke (PORT=3118, fresh DB): POST `/api/tasks` returns 201 on first call; second POST with same `{id, text}` returns 200 with the same `Task` payload (FR29 idempotency confirmed). GET `/api/tasks` returns the persisted row.

### Completion Notes List

1. **`useCreateTask` is the project's first mutation hook.** The factory-function shape (`() => ({...})`) mirrors `useTasks`'s v5 Solid Query pattern. The hook returns the TanStack mutation observer directly (no remap, no wrapping) and is consumed only from `App.tsx` per the architecture's component-↔-data boundary. `onMutate` cancels in-flight tasks queries, snapshots the previous cache (returned as context for Story 1.9 to consume), and prepends the optimistic row keyed on the client-generated UUIDv7. There is intentionally no `onSuccess`, `onError`, or `onSettled` — the no-rollback / no-invalidation contract is the *absence* of those callbacks. The optimistic prepend matches the canonical server result because the request body's `id` is the same UUIDv7 the server echoes back (Story 1.4 contract), so a refetch would just re-fetch the same row — invalidation would only flicker.
2. **Eden type-cast extension (deviation continuing #4 from Story 1.7).** `apps/web/src/data/api.ts` consolidates the GET + POST cast into a single `TasksApiSurface` interface (`{ tasks: { get: ...; post: ... } }`) and uses it for both `tasksGet` and `tasksPost`. This keeps the `as unknown as` surface narrow and centralised. `TasksPostBody` and `TasksPostResponse` are exported for consumer-side typing; the runtime path is the chained-access pattern (`api.api.tasks.post(...)`) Eden documents.
3. **Test stub mechanism (deviation continuing #2 from Story 1.7).** `tasksApi.create` and `tasksApi.createFetch` are writable properties on the mutable `tasksApi` object, mirroring `tasksApi.fetch` / `tasksApi.list`. Tests capture both originals in `beforeEach` and restore them in `afterEach`. The five `useCreateTask` tests stub `tasksApi.create` directly; the envelope-parsing path inside `create` is intentionally *not* exercised in this story (matches Story 1.7's pattern for `tasksApi.list`). Story 1.9's per-status retry tests will likely mock `tasksApi.createFetch` (one layer down) to drive specific HTTP statuses; the seam is already in place. The `cancelQueries` ordering test types the mock parameter as `(_filters: { queryKey: readonly unknown[] }) => Promise.resolve()` so `cancelMock.mock.calls[0][0]` is reachable for the equality assertion.
4. **Playwright manual-verification substitution.** Task 6's two literal "open a real browser, type, observe" subtasks were satisfied by automation rather than an interactive session. The Playwright happy-path spec asserts auto-focus, optimistic visibility, input clear, focus retention, absence of `[aria-label="Saving"]`, and absence of `role="status"` — across chromium / firefox / webkit. The optimistic-window spec injects an 800 ms artificial network delay and asserts the row paints within a 100 ms timeout — a tighter guarantee than DevTools "Slow 3G" throttling. Persistence + FR29 idempotency was verified out-of-band with a `bun run apps/api/src/index.ts` instance against a fresh `/tmp/tasks-118.db`: first POST returned 201, second POST with the same `{id, text}` returned 200 with the same `Task` payload, GET returned the persisted row.
5. **Playwright cross-browser deltas use `Date.now()`-stamped texts** rather than fixed strings. The dev server reuses `./tasks.db` between runs (and Playwright `reuseExistingServer: !process.env.CI` reuses the dev server itself across tests in the same session), so absolute count assertions are unreliable. Each spec produces a per-test unique text via timestamp suffix; `getByRole("listitem").filter({ hasText: text })` then locates the optimistic row independent of leftover state. The two-capture ordering spec asserts that the first listitem in the rendered list contains the most-recent (UUIDv7-monotonic) text — robust as long as no other test inserts between the two captures (which Playwright `fullyParallel: true` does not violate, since each test runs in its own browser context but shares the backend; the timestamp suffixes prevent text collisions, and the assertion targets the top-of-list which is per-context monotonic).
6. **No deferred-work entries needed for this story.** The deferred LiveRegion latencies, the Eden type-cast surface, and the `tasksApi` mutable seam (all Story 1.7 carryovers) are still latent but not exacerbated here — Story 1.8 deliberately does not call `LiveRegion.announce(...)` (silent capture per UX-DR16) and only extends the existing seams in the documented way.

### File List

**Created:**

- `e2e/capture.spec.ts` — four Playwright tests (happy path, optimistic-window, newest-first ordering, axe-core critical/serious clean) running on chromium + firefox + webkit.

**Modified:**

- `apps/web/src/App.tsx` — replaced the `_text` no-op with `useCreateTask` + `createUuidV7`; fire-and-forget `mutate({ id: createUuidV7(), text })`.
- `apps/web/src/data/api.ts` — added `TasksPostBody` / `TasksPostResponse` exports, consolidated Eden cast into `TasksApiSurface`, added `createFetch` (raw seam) and `create` (throwing wrapper) to the `tasksApi` object.
- `apps/web/src/data/queries.ts` — added `useCreateTask` hook (factory shape, optimistic-prepend `onMutate`, no `onError` / `onSuccess` / `onSettled`).
- `apps/web/src/data/queries.test.tsx` — added `describe("useCreateTask")` block with five tests; introduced a `makeMutationClient` helper (queries `retryDelay: 0`, mutations `retry: false`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-8-...: ready-for-dev → in-progress → review`; `last_updated` bumped.
- `_bmad-output/implementation-artifacts/1-8-optimistic-task-creation-happy-path.md` — task checkboxes [x], status `review`, this Dev Agent Record.

**Not modified (per AC #6, #14):** `apps/web/src/components/TaskInput.tsx`, `TaskInput.test.tsx`, `TaskList.tsx`, `TaskList.test.tsx`, `TaskRow.tsx`, `TaskRow.test.tsx`, `EmptyState.tsx`, `LoadingState.tsx`, `LiveRegion.tsx`, `ErrorBoundary.tsx`; `apps/web/src/index.tsx`, `apps/web/src/data/uuid.ts`, `apps/web/src/data/keys.ts`; `apps/api/**`; `e2e/smoke.spec.ts`; `playwright.config.ts`; `bunfig.toml`; root + workspace `package.json`.

## Change Log

| Date       | Change                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| 2026-04-30 | Implemented Story 1.8 — optimistic task creation happy path; status `ready-for-dev` → `review`. |

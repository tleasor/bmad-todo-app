# Story 2.2: Frontend Toggle — Checkbox Sub-Component, Optimistic Mutation, Completed Visual Treatment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to click a task's checkbox and see it instantly become completed (or active again), with a clear visual distinction from active tasks,
so that I can clear my done items at a glance without waiting for the network.

## Acceptance Criteria

1. **Checkbox renders correctly in both states** — Active: 20×20 px circle, 2 px border `color.border.strong`, transparent fill. Completed: solid `color.accent.default` fill with an inset white SVG checkmark (no emoji). Checkbox has `role="checkbox"`, `aria-checked="true|false"` matching `props.task.completed`, is in the natural Tab order.

2. **Checkbox hover and focus styling** — On hover (in environments that support hover), the active-state border transitions to `color.accent.default`. On focus: 2 px `color.accent.default` outer ring with 2 px offset (matching existing focus-ring spec). On `@media (hover: none)` the Checkbox renders without hover styling.

3. **Clicking the Checkbox triggers `useToggleTask` mutation** — `onClick` on the Checkbox calls `toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed })`. The mutation key is `["tasks", "toggle"]`. The `mutationFn` calls `tasksApi.toggle({ id, completed })` which maps to Eden `api.api.tasks({ id }).patch({ completed })`.

4. **Optimistic update on `onMutate`** — `onMutate` cancels outstanding queries (`queryClient.cancelQueries`), then sets the cached task row's `completed` field to the target state via `queryClient.setQueryData<Task[]>()` returning a new array with the updated row (`completed` and `updatedAt: Date.now()`). No snapshot is saved for rollback (FR27 — `onError` does not roll back).

5. **Sync-pending and retry-exhausted states reuse existing primitives** — `SyncIndicator`, `ErrorMessage`, and `RetryAction` from `TaskRow.tsx` are used as-is; no new components are introduced. Toggle sync state is tracked in a new `toggleSyncStore.ts` (mirroring `captureSyncStore.ts`). `TaskRow` reads from BOTH stores and resolves whichever is active: `const sync = () => toggleSync() ?? captureSync()`.

6. **Completed text visual treatment** — When `task.completed` is true, the row text (`task-row__text`) renders in `color.text.muted` with `text-decoration: line-through; text-decoration-thickness: 1px`. The color transition uses `motion.short` (120 ms ease-out). Under `prefers-reduced-motion: reduce`, the transition is instant (no animation). Strike-through and muted color are applied together (WCAG 1.4.1 — non-color signalling).

7. **Task position does not change on toggle** — Toggling completion is a row-level state change only; no re-sort, no list reordering (FR9). The `setQueryData` updater uses `.map()` to update only the toggled row, preserving array order.

8. **`onError` does NOT roll back the optimistic update** — Per FR27 / UX-DR16, toggle failures surface row-local sync state (via `toggleSyncStore`) and the `announce(LIVE_REGION_RETRY_EXHAUSTED)` announcement. No `setQueryData` rollback. The optimistic completed state remains in the UI while the error indicator appears.

9. **Retry logic follows the same policy as `useCreateTask`** — `retry: computeRetryDecision`, `retryDelay: computeRetryDelay` (both already exported from `queries.ts`). 429 → up to 4 retries honouring `Retry-After`; 5xx → up to 3; other 4xx → fail-fast.

10. **All `bun run check` quality gates pass** — oxlint zero warnings, oxfmt clean, tsgo `-b --noEmit` clean, dep-count unchanged (web 17/25). No new production dependencies.

11. **All `bun run check:full` quality gates pass** — all 203+ tests pass (no regressions on existing 203 from Story 2.1), coverage ≥ 70%, audit clean, build clean.

12. **Playwright `e2e/manage.spec.ts` asserts real toggle behavior** — Replace the `test.describe.skip` stub with real assertions: click checkbox → task visually completed (text has `line-through` and `color.text.muted`); click again → active; task stays at same list index position (no re-sort). Include axe-core assertion on the toggled row.

## Tasks / Subtasks

- [x] **Task 1 — Create `apps/web/src/data/toggleSyncStore.ts`** (AC: #5)
  - [x] Mirror the exact structure of `captureSyncStore.ts`: `ToggleSyncStatus`, `ToggleSyncEntry`, `entries` store, `useToggleSyncStatus`, `__toggleSyncStorePeek`, `__toggleSyncMutators` (markPending, markExhausted, clear), `__resetToggleSyncStoreForTests`
  - [x] Export names use `Toggle` prefix throughout (e.g., `useToggleSyncStatus`, `__toggleSyncMutators`)

- [x] **Task 2 — Extend `apps/web/src/data/api.ts` with toggle API method** (AC: #3)
  - [x] Add `TasksPatchBody = { completed: boolean }` and `TasksPatchResponse` type exports (same shape as `TasksPostResponse` but for Task response)
  - [x] Extend `TasksApiSurface` with a callable form for dynamic `:id` segment: the `tasks` property must also be callable: `(params: { id: string }): { patch: (body: TasksPatchBody) => Promise<TasksPatchResponse> }`
  - [x] Add `tasksPatch` private fetcher: `const tasksPatch = (id: string, body: TasksPatchBody): Promise<TasksPatchResponse> => (api.api as unknown as TasksApiSurface).tasks({ id }).patch(body)`
  - [x] Add `patchFetch` seam to `_tasksApiSeams`: `patchFetch: tasksPatch`
  - [x] Add `tasksApi.toggle` method: validates response, throws `TasksApiError` on error (same pattern as `tasksApi.create`), parses `Retry-After` on 429, validates `data.id` and `data.completed` fields

- [x] **Task 3 — Add `useToggleTask` to `apps/web/src/data/queries.ts`** (AC: #3, #4, #8, #9)
  - [x] Add `pendingToggleTimers = new Map<string, ReturnType<typeof setTimeout>>()` at module scope (separate from `pendingTimers` to avoid key collisions with capture operations)
  - [x] Add `__clearTogglePendingTimersForTests` export
  - [x] Add local `clearTogglePendingTimer(id)` helper
  - [x] Add `ToggleTaskInput = { id: string; completed: boolean }` type
  - [x] Implement `useToggleTask` following the same lifecycle pattern as `useCreateTask`:
    - `mutationKey: ["tasks", "toggle"]`
    - `mutationFn: (input) => tasksApi.toggle(input)`
    - `retry: computeRetryDecision`, `retryDelay: computeRetryDelay`
    - `onMutate`: cancel queries, optimistic `.map()` update on tasksQueryKey, start pending timer → `__toggleSyncMutators.markPending(id, retry)` + `announce(LIVE_REGION_SAVING)` after `SYNC_PENDING_DELAY_MS`
    - `onSuccess`: clear timer, clear toggleSync entry, announce saved if was pending
    - `onError`: clear timer, mark exhausted, announce retry-exhausted; NO cache rollback
  - [x] The `retry` closure in `onMutate` and `onError` references the `observer` variable (same pattern as `useCreateTask`)

- [x] **Task 4 — Update `apps/web/src/components/TaskRow.tsx`** (AC: #1, #2, #3, #5, #6, #7)
  - [x] Import `useToggleSyncStatus`, `__toggleSyncMutators`, `__toggleSyncStorePeek` from `toggleSyncStore`
  - [x] Import `useToggleTask` from `queries`
  - [x] Call `useToggleTask()` inside `TaskRow` component body
  - [x] Add `useToggleSyncStatus(() => props.task.id)` alongside existing `useCaptureSyncStatus`; compose: `const sync = () => toggleSync() ?? captureSync()`
  - [x] Apply `task-row--completed` CSS class when `props.task.completed` is true (via `classList`)
  - [x] Update `Checkbox` to accept `checked: boolean` and `onToggle: () => void` props; set `aria-checked` dynamically; apply `task-row__checkbox--completed` class when checked; call `props.onToggle()` in `onClick`; show checkmark SVG when checked (white, inset)
  - [x] Wire `Checkbox` props from `TaskRow`: `checked={props.task.completed}`, `onToggle={() => toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed })}`
  - [x] Do NOT destructure `props` on the `Checkbox` sub-component — access as `props.checked` / `props.onToggle` (SolidJS reactivity rule)

- [x] **Task 5 — Update `apps/web/src/components/TaskRow.css`** (AC: #2, #6)
  - [x] Add completed text styles under `.task-row--completed .task-row__text`: `color: var(--color-text-muted)`, `text-decoration: line-through`, `text-decoration-thickness: 1px`
  - [x] Add transition to `.task-row__text`: `transition: color var(--motion-short) ease-out`
  - [x] Add `@media (prefers-reduced-motion: reduce) { .task-row__text { transition: none; } }`
  - [x] Add checkbox completed styles `.task-row__checkbox--completed`: `background: var(--color-accent-default)`, `border-color: var(--color-accent-default)`, `display: flex; align-items: center; justify-content: center`
  - [x] Add hover style (hover-capable devices only): `@media (hover: hover) { .task-row__checkbox:hover { border-color: var(--color-accent-default); transition: border-color var(--motion-short) ease-out; } }`
  - [x] Add focus-visible style for checkbox: `outline: 2px solid var(--color-accent-default); outline-offset: 2px` (matches existing `.task-row__retry-action:focus-visible` pattern)

- [x] **Task 6 — Update `apps/web/src/components/TaskRow.test.tsx`** (AC: #1, #2, #5, #6)
  - [x] Import `__resetToggleSyncStoreForTests`, `__toggleSyncMutators` from `toggleSyncStore`
  - [x] Add `__resetToggleSyncStoreForTests()` to `beforeEach` and `afterEach`
  - [x] Update `"renders <li tabindex=0> with checkbox, text, and delete button"` — `aria-checked` should match the task's `completed` value (use `baseTask()` which has `completed: false` → expect `"false"`)
  - [x] Update `"does not throw or change aria-checked when the checkbox is clicked (no mutation wired)"` — wrapped in `QueryClientProvider` with no-retry `QueryClient`; mocks `patchFetch`; asserts `aria-checked` stays `"false"` immediately after click
  - [x] Add `describe("TaskRow completed state")` block with 3 tests (completed class, checkmark SVG, aria-label)
  - [x] Add toggle sync state tests for toggle (mirror existing capture sync tests): pending, exhausted, compose priority

- [x] **Task 7 — Update `e2e/manage.spec.ts`** (AC: #12)
  - [x] Remove `test.describe.skip` and replace with `test.describe("manage tasks — toggle")`
  - [x] Add test: `"clicking the checkbox toggles a task to completed"`
  - [x] Add test: `"clicking the checkbox again toggles back to active"`
  - [x] Add test: `"completed task stays at same list position (no re-sort)"`
  - [x] Add axe-core assertion on the completed row state

- [x] **Task 8 — Quality gate verification** (AC: #10, #11)
  - [x] Run `bun run check` — passed: oxlint, oxfmt, tsgo, dep-count (root 6/25, web 17/25, api 2/25)
  - [x] Run `bun run check:full` — passed: 217 tests, coverage 97.93%/97.24% (≥70%), audit clean, build clean (27KB gzipped)
  - [x] Confirm dep counts: root 6/25, web 17/25, api 2/25 — no new deps

### Review Findings

- [x] [Review][Decision] Checkbox not disabled during in-flight toggle — clicking rapidly fires two concurrent PATCH requests with conflicting `completed` states. Timer and sync-store state are keyed by task ID, so the second `onMutate` clobbers the first mutation's pending timer, and the first `onSuccess` silently clears sync state that belongs to the second mutation. Decide: (a) disable the checkbox while `toggleMutation.isPending`, or (b) accept the race and guard the timer/store ops defensively.
- [x] [Review][Decision] `onSuccess` discards the server response entirely — `_data` (the canonical server `Task`) is unused; the cache permanently reflects the optimistic guess. Server-authoritative fields (`updatedAt` from the DB timestamp, any corrected values) never reach the cache, and the query is not invalidated. Decide: (a) update the cache with the server response in `onSuccess`, (b) invalidate the query to force a refetch, or (c) leave as-is (intentional optimistic-final policy — document it explicitly).
- [x] [Review][Patch] `aria-label` is static "Mark task as complete" in both completed and active states — when the task is already done, the label should read "Mark task as incomplete" [apps/web/src/components/TaskRow.tsx]
- [x] [Review][Patch] Concurrent same-ID toggle: second `onMutate` cancels the first mutation's pending timer via `clearTogglePendingTimer(input.id)`, so the first mutation's spinner never appears [apps/web/src/data/queries.ts]
- [x] [Review][Patch] `onSuccess` unconditionally clears the sync store entry for `input.id`, silently dropping pending/exhausted state that belongs to a concurrent second mutation [apps/web/src/data/queries.ts]
- [x] [Review][Patch] Checkbox hover `transition: border-color ...` inside `@media (hover: hover)` is not suppressed under `@media (prefers-reduced-motion: reduce)` — violates AC2 / Task 5 [apps/web/src/components/TaskRow.css]
- [x] [Review][Patch] Axe-core E2E assertion runs `new AxeBuilder({ page }).analyze()` (full-page scan) — AC12 specifies "axe-core assertion on the toggled row" [e2e/manage.spec.ts]
- [x] [Review][Patch] E2E missing `color.text.muted` CSS assertion — AC12 requires both `line-through` and `color.text.muted` on the completed row; only `text-decoration-line` is checked [e2e/manage.spec.ts]
- [x] [Review][Patch] No test covers the `SYNC_PENDING_DELAY_MS` → `markPending` → `LIVE_REGION_SAVING` announcement path, nor the `wasPending` → `LIVE_REGION_SAVED` branch in `onSuccess` — mirrors the gap the `useCreateTask sync state` suite fills [apps/web/src/data/queries.test.tsx]
- [x] [Review][Patch] Retry path re-announces `LIVE_REGION_SAVING` — the `retry()` closure calls `observer.mutate(input)` which re-runs `onMutate`, starting a new `SYNC_PENDING_DELAY_MS` timer and firing `announce(LIVE_REGION_SAVING)` again on every retry attempt [apps/web/src/data/queries.ts]
- [x] [Review][Defer] `renderRowWithClient` captures `originalPatchFetch` at module load time — if a prior test suite mutates `_tasksApiSeams.patchFetch` before the first `renderRowWithClient` call, the outer `afterEach` restores the wrong value [apps/web/src/components/TaskRow.test.tsx] — deferred, pre-existing test-isolation pattern
- [x] [Review][Defer] `waitForListSettled` resolves immediately when pre-existing list items are visible — can exit before freshly-loaded data is ready [e2e/manage.spec.ts] — deferred, pre-existing E2E pattern
- [x] [Review][Defer] `toggleSyncStore` key accumulation — `clear(id)` sets the key to `undefined` but does not delete it; store grows monotonically over a long session [apps/web/src/data/toggleSyncStore.ts] — deferred, pre-existing pattern (mirrors `captureSyncStore`)
- [x] [Review][Defer] `capturedCancelCount` initialized to `-1` — assertion depends on `cancelQueries` firing before `tasksApi.toggle`'s mock body; timing-sensitive [apps/web/src/data/queries.test.tsx] — deferred, pre-existing test fragility
- [x] [Review][Defer] `pendingToggleTimers` not cleaned up on component unmount — timer fires after unmount, marks pending on a dead task ID [apps/web/src/data/queries.ts] — deferred, pre-existing pattern (mirrors capture timers)
- [x] [Review][Defer] Capture sync state permanently masked when toggle sync takes priority — `sync() = toggleSync() ?? captureSync()` means an exhausted capture sync entry has no UI path to retry while a toggle sync entry is active [apps/web/src/components/TaskRow.tsx] — deferred, architectural decision per spec (AC5)

## Dev Notes

### Critical Context

This is **Story 2.2** — the first frontend story in Epic 2. It wires the completed toggle to the UI using the PATCH endpoint delivered in Story 2.1. The backend is already done and tested.

**The three hardest parts of this story:**
1. Composing toggle sync state with capture sync state in `TaskRow` without breaking existing capture sync tests
2. Extending `TasksApiSurface` to handle Eden Treaty's function-call pattern for dynamic path segments (`:id`)
3. Properly wrapping `TaskRow` tests in `QueryClientProvider` since `useToggleTask` calls `useMutation` internally

### Files Being Modified — Current State

**`apps/web/src/components/TaskRow.tsx`** (full file — 99 lines):
- `Checkbox` sub-component has `aria-checked="false"` hardcoded and no `onClick` handler
- `useCaptureSyncStatus` reads from `captureSyncStore` — this covers CREATE mutations only
- `sync()` is currently just `useCaptureSyncStatus(() => props.task.id)` — Story 2.2 composes it with `useToggleSyncStatus`
- The `TaskRow` `<li>` has `classList={{ "task-row--retry-exhausted": ... }}` — Story 2.2 adds `"task-row--completed": props.task.completed`
- **DO NOT** remove the existing `sync()` usage — the SyncIndicator, RetryAction, ErrorMessage are reused

**`apps/web/src/components/TaskRow.css`** (current — 64 lines):
- Has `.task-row__sync-indicator`, `.task-row--retry-exhausted`, `.task-row__error-message`, `.task-row__retry-action`
- Missing: completed text styles, checkbox completed styles, checkbox hover styles, text transition
- The `.task-row__retry-action:focus-visible` sets the pattern for focus rings — follow same `outline: 2px solid var(--color-accent-default); outline-offset: 2px`

**`apps/web/src/data/api.ts`** (full file — 131 lines):
- `TasksApiSurface` type currently only covers `tasks.get` and `tasks.post` (no `:id` routes)
- `_tasksApiSeams` has `fetch` and `createFetch` only — add `patchFetch`
- Pattern for extending: add callable signature to `tasks` property type; add private fetcher; add seam; add `tasksApi.toggle` method
- The existing `readEnvelopeMessage` / `readEnvelopeCode` helpers can be reused in `tasksApi.toggle`

**`apps/web/src/data/queries.ts`** (full file — 136 lines):
- `pendingTimers` at line 28 is for capture mutations — add a **separate** `pendingToggleTimers` map to avoid key collision
- `computeRetryDecision`, `computeRetryDelay`, `clearPendingTimer` pattern is the template for toggle
- `__clearPendingTimersForTests` export is the pattern — add `__clearTogglePendingTimersForTests`
- The `useCreateTask` observer pattern (declared with `let`, initialized with `useMutation`) is the exact pattern for `useToggleTask`

**`apps/web/src/components/TaskRow.test.tsx`** (full file — 202 lines):
- Line 67: `"does not throw or change aria-checked when the checkbox is clicked"` — currently works because `Checkbox` has no `onClick`. Must be updated: wrap in `QueryClientProvider` + mock `_tasksApiSeams.patchFetch`
- Line 52: `aria-checked` assertion against `"false"` — correct for `baseTask()` (completed: false), but now dynamically driven from `props.task.completed`
- The `assertNoEventHandlerAttributes` helper checks all elements — after Story 2.2 the checkbox has an `onClick` which SolidJS compiles to a delegated event (NOT an `onclick` attribute) so this helper should still pass

**`e2e/manage.spec.ts`** (current — stub with `test.describe.skip`):
- Remove `test.describe.skip` entirely; add real `test.describe("manage tasks — toggle")`

### New File: `apps/web/src/data/toggleSyncStore.ts`

Exact mirror of `captureSyncStore.ts` with `Toggle` prefix:

```ts
import { createStore, reconcile } from "solid-js/store";

export type ToggleSyncStatus = "pending" | "exhausted";
export type ToggleSyncEntry = { status: ToggleSyncStatus; retry: () => void };

const [entries, setEntries] = createStore<Record<string, ToggleSyncEntry | undefined>>({});

export const useToggleSyncStatus =
  (id: () => string): (() => ToggleSyncEntry | undefined) =>
  () =>
    entries[id()];

export const __toggleSyncStorePeek = (id: string): ToggleSyncEntry | undefined => entries[id];

export const __toggleSyncMutators = {
  markPending: (id: string, retry: () => void): void =>
    setEntries(id, { status: "pending", retry }),
  markExhausted: (id: string, retry: () => void): void =>
    setEntries(id, { status: "exhausted", retry }),
  clear: (id: string): void => setEntries(id, undefined),
};

export const __resetToggleSyncStoreForTests = (): void => {
  setEntries(reconcile({}));
};
```

### Exact API Extension in `api.ts`

**Step 1 — Add types:**
```ts
export type TasksPatchBody = { completed: boolean };
export type TasksPatchResponse = {
  data: Task | null;
  error: { status: number; value: unknown } | null;
  response?: Response;
};
```

**Step 2 — Extend `TasksApiSurface`:**
```ts
type TasksApiSurface = {
  tasks: {
    get: () => Promise<TasksGetResponse>;
    post: (body: TasksPostBody) => Promise<TasksPostResponse>;
    (params: { id: string }): {
      patch: (body: TasksPatchBody) => Promise<TasksPatchResponse>;
    };
  };
};
```
TypeScript allows a type to have both property signatures and call signatures on the same interface. This is the correct shape for Eden Treaty's dynamic segment pattern.

**Step 3 — Add private fetcher and seam:**
```ts
const tasksPatch = (id: string, body: TasksPatchBody): Promise<TasksPatchResponse> =>
  (api.api as unknown as TasksApiSurface).tasks({ id }).patch(body);

export const _tasksApiSeams = {
  fetch: tasksGet,
  createFetch: tasksPost,
  patchFetch: tasksPatch,          // ADD THIS
};
```

**Step 4 — Add `tasksApi.toggle` method:**
```ts
export const tasksApi = {
  // ... existing list, create ...
  toggle: async (input: { id: string; completed: boolean }): Promise<Task> => {
    const { data, error, response } = await _tasksApiSeams.patchFetch(
      input.id,
      { completed: input.completed },
    );
    if (error) {
      const message =
        readEnvelopeMessage(error.value) ?? `tasks toggle failed: HTTP ${error.status}`;
      const retryAfterMs =
        error.status === 429
          ? parseRetryAfter(response?.headers.get("retry-after") ?? null)
          : undefined;
      throw new TasksApiError({
        status: error.status,
        message,
        code: readEnvelopeCode(error.value),
        retryAfterMs,
      });
    }
    if (data === null) {
      throw new Error("tasks toggle returned null data");
    }
    if (typeof data.id !== "string" || typeof data.completed !== "boolean") {
      throw new Error("tasks toggle: response body is not a valid Task");
    }
    return data;
  },
};
```

### Exact `useToggleTask` in `queries.ts`

```ts
// Add at module scope alongside pendingTimers:
const pendingToggleTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const __clearTogglePendingTimersForTests = (): void => {
  for (const timer of pendingToggleTimers.values()) clearTimeout(timer);
  pendingToggleTimers.clear();
};

const clearTogglePendingTimer = (id: string): void => {
  const timer = pendingToggleTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  pendingToggleTimers.delete(id);
};

type ToggleTaskInput = { id: string; completed: boolean };

export const useToggleTask = (): UseMutationResult<Task, Error, ToggleTaskInput, void> => {
  const queryClient = useQueryClient();
  // eslint-disable-next-line prefer-const
  let observer: UseMutationResult<Task, Error, ToggleTaskInput, void>;
  observer = useMutation<Task, Error, ToggleTaskInput, void>(() => ({
    mutationKey: ["tasks", "toggle"],
    mutationFn: (input) => tasksApi.toggle(input),
    retry: computeRetryDecision,
    retryDelay: computeRetryDelay,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const now = Date.now();
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
        if (!prev) return prev;
        return prev.map((t) =>
          t.id === input.id ? { ...t, completed: input.completed, updatedAt: now } : t,
        );
      });
      const retry = (): void => {
        observer.mutate(input);
      };
      clearTogglePendingTimer(input.id);
      const timer = setTimeout(() => {
        __toggleSyncMutators.markPending(input.id, retry);
        announce(LIVE_REGION_SAVING);
      }, SYNC_PENDING_DELAY_MS);
      pendingToggleTimers.set(input.id, timer);
    },
    onSuccess: (_data, input) => {
      clearTogglePendingTimer(input.id);
      const wasPending = __toggleSyncStorePeek(input.id)?.status === "pending";
      __toggleSyncMutators.clear(input.id);
      if (wasPending) announce(LIVE_REGION_SAVED);
    },
    onError: (_error, input) => {
      clearTogglePendingTimer(input.id);
      const retry = (): void => {
        observer.mutate(input);
      };
      __toggleSyncMutators.markExhausted(input.id, retry);
      announce(LIVE_REGION_RETRY_EXHAUSTED);
      // No cache rollback — FR27 / UX-DR16: optimistic toggle stays in place.
    },
  }));
  return observer;
};
```

Key details:
- `onMutate` context type is `void` (no snapshot returned — no rollback needed; the `<void>` generic explicitly signals no-rollback contract)
- Import `__toggleSyncMutators`, `__toggleSyncStorePeek` from `./toggleSyncStore`
- Import `UseMutationResult` is already imported in the file — add `ToggleTaskInput` and the new hook

### Exact `TaskRow.tsx` Changes

**Updated `TaskRow` body:**
```tsx
export function TaskRow(props: TaskRowProps): JSX.Element {
  const captureSync = useCaptureSyncStatus(() => props.task.id);
  const toggleSync = useToggleSyncStatus(() => props.task.id);
  const sync = (): CaptureSyncEntry | ToggleSyncEntry | undefined =>
    toggleSync() ?? captureSync();
  const toggleMutation = useToggleTask();

  return (
    <li
      tabindex="0"
      class="task-row flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle"
      classList={{
        "task-row--retry-exhausted": sync()?.status === "exhausted",
        "task-row--completed": props.task.completed,
      }}
    >
      <div class="task-row__primary">
        <Checkbox
          checked={props.task.completed}
          onToggle={() => toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed })}
        />
        <span class="task-row__text">{props.task.text}</span>
        <Show when={sync()?.status === "pending"}>
          <SyncIndicator />
        </Show>
        <Show when={sync()?.status === "exhausted"}>
          <RetryAction onRetry={sync()?.retry ?? noop} />
        </Show>
        <DeleteButton />
      </div>
      <Show when={sync()?.status === "exhausted"}>
        <ErrorMessage />
      </Show>
    </li>
  );
}
```

**Updated `Checkbox` sub-component:**
```tsx
interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
}

function Checkbox(props: CheckboxProps): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-label="Mark task as complete"
      class="task-row__checkbox shrink-0 w-5 h-5 rounded-full border-2 border-token-border-strong bg-transparent"
      classList={{ "task-row__checkbox--completed": props.checked }}
      onClick={() => props.onToggle()}
    >
      <Show when={props.checked}>
        <CheckmarkIcon />
      </Show>
    </button>
  );
}

function CheckmarkIcon(): JSX.Element {
  return (
    <svg
      width="10"
      height="8"
      viewBox="0 0 10 8"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 4L3.5 6.5L9 1"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
```

Key details:
- `aria-checked={props.checked}` — SolidJS converts `boolean` to `"true"` / `"false"` attributes correctly
- `classList={{ "task-row__checkbox--completed": props.checked }}` — dynamic class for filled state
- Do NOT destructure `props` — access as `props.checked`, `props.onToggle` (SolidJS reactivity)
- `CheckmarkIcon` is a separate sub-component (no props, clean)
- The return type annotation needed on exported functions (oxlint enforces explicit return types)

**Import additions for `TaskRow.tsx`:**
```ts
import { useToggleSyncStatus } from "../data/toggleSyncStore";
import type { ToggleSyncEntry } from "../data/toggleSyncStore";
import { useToggleTask } from "../data/queries";
```

The `CaptureSyncEntry` type will need to be imported or the union type annotated correctly.

### Exact CSS Changes in `TaskRow.css`

**Append to TaskRow.css:**
```css
/* Completed text treatment */
.task-row__text {
  transition: color var(--motion-short) ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .task-row__text {
    transition: none;
  }
}

.task-row--completed .task-row__text {
  color: var(--color-text-muted);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

/* Checkbox completed state */
.task-row__checkbox--completed {
  background: var(--color-accent-default);
  border-color: var(--color-accent-default);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Checkbox hover — only on hover-capable devices */
@media (hover: hover) {
  .task-row__checkbox:hover {
    border-color: var(--color-accent-default);
    transition: border-color var(--motion-short) ease-out;
  }
}

/* Checkbox focus ring */
.task-row__checkbox:focus-visible {
  outline: 2px solid var(--color-accent-default);
  outline-offset: 2px;
}
```

Key details:
- `transition` on `.task-row__text` is at the element level (not state level) so it animates in both directions
- `@media (hover: hover)` (not `hover: none`) — include hover styles ONLY when hover is available
- The `display: flex` on completed checkbox is needed to center the SVG checkmark
- `border-color: var(--color-accent-default)` on completed checkbox because the border persists but should match the fill

### Testing Requirements

**`queries.test.tsx` additions:**
- Import `__clearTogglePendingTimersForTests`, `useToggleTask` from `./queries`
- Import `__toggleSyncStorePeek`, `__resetToggleSyncStoreForTests`, `__toggleSyncMutators` from `./toggleSyncStore`
- Add `__clearTogglePendingTimersForTests()` and `__resetToggleSyncStoreForTests()` to afterEach
- Add `describe("useToggleTask")` block covering:
  - `it("optimistic update flips completed on the cached task")` — seed cache, mutate, check `queryClient.getQueryData` reflects flip before response
  - `it("success clears toggle sync state without rollback")` — successful toggle; verify task stays completed; no sync entry
  - `it("onError marks exhausted and does NOT roll back the optimistic update")` — fail the mutation; verify cache still shows completed; verify `__toggleSyncStorePeek` is `exhausted`
  - `it("computeRetryDecision is shared: 429 retries, 4xx fails fast")` — these are already tested via the shared `computeRetryDecision` unit tests; no need to re-test

**`TaskRow.test.tsx` — `QueryClientProvider` pattern:**
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { _tasksApiSeams } from "../data/api";

const noRetryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { mutations: { retry: false } } });

const renderRowWithClient = (task: Task): ReturnType<typeof render> => {
  const client = noRetryClient();
  // Prevent mutation from firing network — hang forever
  _tasksApiSeams.patchFetch = () => new Promise(() => undefined);
  return render(() => (
    <QueryClientProvider client={client}>
      <ul><TaskRow task={task} /></ul>
    </QueryClientProvider>
  ));
};
```

Restore `_tasksApiSeams.patchFetch` in `afterEach`:
```tsx
afterEach(() => {
  _tasksApiSeams.patchFetch = tasksPatch; // need to import the original
  // ...
});
```

Wait — this pattern gets complicated because `_tasksApiSeams.patchFetch` needs to be reassigned. A simpler approach matching the codebase: use `mock()` from `bun:test`:
```tsx
beforeEach(() => {
  _tasksApiSeams.patchFetch = mock(() => new Promise(() => undefined)); // hang
});
afterEach(() => {
  // Restore by importing the original tasksGet/tasksPost/tasksPatch functions
  // OR just set it to a mock that doesn't affect the test
  mock.restore(); // if bun:test supports this
});
```

Actually, looking at `queries.test.tsx` line 22: `import { _tasksApiSeams, ... } from "./api"` and tests do `_tasksApiSeams.fetch = mock(...)` directly. The `TaskRow.test.tsx` doesn't currently do any API mocking because `Checkbox` had no handler. After Story 2.2, the simplest fix is:
1. Wrap tests that click the checkbox in `QueryClientProvider`
2. Set `_tasksApiSeams.patchFetch` to a never-resolving mock in `beforeEach`
3. Reset to the original in `afterEach` (import the original private function or re-assign from a saved reference)

The cleanest approach — save original before overriding:
```ts
const originalPatchFetch = _tasksApiSeams.patchFetch;
beforeEach(() => { _tasksApiSeams.patchFetch = mock(() => new Promise(() => undefined)); });
afterEach(() => { _tasksApiSeams.patchFetch = originalPatchFetch; });
```

**Important:** The `renderRow` helper in the existing tests does NOT wrap in `QueryClientProvider`. Tests that do NOT interact with the checkbox can continue using `renderRow`. Tests that click the checkbox must use the new `renderRowWithClient` wrapper. The existing `assertNoEventHandlerAttributes` helper should still pass because SolidJS delegates events (no `onclick` HTML attribute).

**Playwright `manage.spec.ts` pattern:**
Follow the same structure as `capture.spec.ts` — use `page.goto("/")`, `waitForListSettled`, add a task, then target it via `getByRole("listitem").filter({ hasText: text })`.

For visual assertions in Playwright: `expect(row.locator(".task-row__text")).toHaveCSS("text-decoration-line", "line-through")` and check the `aria-checked` attribute via `expect(row.getByRole("checkbox")).toHaveAttribute("aria-checked", "true")`.

Note: Playwright E2E runs against the real running app (dev server or container). The toggle hits the live PATCH endpoint delivered in Story 2.1.

### Architecture Compliance

- **No rollback in `onError`** — FR27 / UX-DR16: `onError` does not call `setQueryData` to restore previous state. The optimistic completed state remains. Failures surface via `toggleSyncStore` + `RetryAction` UI.
- **Named exports only** — no `export default`. [Source: architecture/implementation-patterns-consistency-rules.md#Module-Conventions]
- **No props destructuring in Solid components** — `props.checked` not `const { checked } = props`. [Source: architecture/implementation-patterns-consistency-rules.md#Solid-specific-rules]
- **No raw `fetch`** — all API calls go through `tasksApi.toggle()` which uses Eden. [Source: architecture/implementation-patterns-consistency-rules.md#Eden-Treaty-rules]
- **Repository pattern on frontend** — all API calls go through `tasksApi`; no direct Eden treaty calls in components or hooks.
- **`async/await` only** — no `.then()` chains. [Source: architecture/implementation-patterns-consistency-rules.md#Async-pattern]
- **No `console.log`** in production code. [Source: architecture/implementation-patterns-consistency-rules.md#Logging]
- **Explicit return types on exported functions** — oxlint enforces this. [Source: architecture/implementation-patterns-consistency-rules.md#Anti-Patterns]
- **No magic numbers** — `SYNC_PENDING_DELAY_MS`, `motion.short` via CSS var, not literals.
- **Target-state semantics preserved** — `toggleMutation.mutate({ id, completed: !props.task.completed })` computes the target state; retrying with the same input is idempotent (Story 2.1's PATCH is target-state).

### File Structure Requirements

**NEW files (create):**
```text
apps/web/src/data/toggleSyncStore.ts      # Toggle sync state (mirror of captureSyncStore)
```

**Modify only these files:**
```text
apps/web/src/components/TaskRow.tsx        # Toggle wiring, Checkbox props, completed class
apps/web/src/components/TaskRow.css        # Completed text, checkbox states, hover, focus
apps/web/src/data/api.ts                   # TasksApiSurface extension, tasksPatch, tasksApi.toggle
apps/web/src/data/queries.ts               # useToggleTask, pendingToggleTimers
apps/web/src/components/TaskRow.test.tsx   # Updated/new tests
apps/web/src/data/queries.test.tsx         # useToggleTask tests
e2e/manage.spec.ts                         # Real toggle assertions
```

**Do NOT modify:**
```text
apps/web/src/data/captureSyncStore.ts      # Capture sync — leave untouched
apps/web/src/data/keys.ts                  # tasksQueryKey unchanged
apps/web/src/styles/tokens.css             # Tokens are already correct; contrast test already passes
apps/web/src/styles/tokens.test.ts         # Contrast test already validates text.muted ≥ 4.5:1 on canvas AND subtle
apps/web/src/data/announcements.ts         # Announcement strings reused as-is
apps/api/**                                # Backend complete; no changes
```

### Previous Story Intelligence (from Story 2.1 Dev Agent Record)

- **`TaskRow.tsx` already imports `LIVE_REGION_RETRY_EXHAUSTED`** from announcements — the same constant is used in `useToggleTask` `onError`
- **`_tasksApiSeams` is a mutable object** that tests can overwrite individual functions on — this is the intended seam pattern for Story 2.2 (`patchFetch`)
- **`App` type exported from `apps/api/src/index.ts`** now includes the PATCH route via `tasksRoute`. Eden Treaty's `treaty<App>()` call in `api.ts` already has the type information for `PATCH /api/tasks/:id` — the cast to `TasksApiSurface` is the workaround for the union-with-catch-all hiding issue
- **Test count baseline:** 203 tests as of Story 2.1. Story 2.2 adds new tests; all 203 existing must still pass
- **dep-count baseline:** root 6/25, web 17/25, api 2/25. No new deps permitted
- **`bun run check:full` bundle size threshold** — currently 27KB gzipped for the SPA; adding a toggle handler and checkmark SVG should be negligible

### Anti-Patterns to Avoid

- **Do NOT** destructure Solid component props (`const { checked } = props` breaks reactivity)
- **Do NOT** use `emoji` for the checkmark — the spec explicitly says "SVG, no emoji"
- **Do NOT** use a shared `pendingTimers` map for toggle (use `pendingToggleTimers` to avoid key collision with capture operations on the same task ID)
- **Do NOT** call `setQueryData` in `onError` to roll back — FR27 forbids rollback; the optimistic toggle stays
- **Do NOT** modify `captureSyncStore.ts` — capture sync state is separate from toggle sync state
- **Do NOT** re-sort the list on toggle — `setQueryData` must use `.map()` to update only the target row, preserving array order
- **Do NOT** add a new LiveRegion — the existing global `announce()` function is reused
- **Do NOT** add `type="button"` omission — all buttons in this codebase have explicit `type="button"`
- **Do NOT** use `aria-selected` on the row — per UX spec, focus is selection; no `aria-selected` attribute
- **Do NOT** create a new `ErrorCode` or `AppError` subclass — toggle errors flow through the existing `TasksApiError`
- **Do NOT** touch `apps/api/**` — the backend is done
- **Do NOT** add `default export` — named exports only

### Project Structure Notes

- `toggleSyncStore.ts` goes in `apps/web/src/data/` alongside `captureSyncStore.ts` (not in `components/`)
- `useToggleTask` goes in `queries.ts` alongside `useCreateTask` and `useTasks` — all query/mutation hooks in one file
- `TaskRow.css` is the only CSS file for `TaskRow` sub-components — add all new styles there
- The `Checkbox`, `SyncIndicator`, `ErrorMessage`, `RetryAction`, `DeleteButton` sub-components remain in `TaskRow.tsx` (co-located, used only by one parent)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2] — story statement, BDD acceptance criteria, toggle + visual treatment
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Checkbox-affordance] — 20×20 circle, hover border, completed fill + white SVG checkmark
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Task-text] — completed: text.muted + line-through + 1px thickness, motion.short ease-out
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#TaskRow-component] — aria-checked, role=checkbox, Tab order, states compose
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D7] — TanStack Query config: onError does NOT roll back; `onMutate`, `onError`, `onSettled` required; no `useSuspenseQuery`
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D3] — PATCH body is target state, not action; retries are idempotent
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Solid-specific-rules] — no prop destructuring; `classList` for dynamic classes; `createMemo` / `createEffect` patterns
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Eden-Treaty-rules] — single client, chained access, no raw fetch
- [Source: _bmad-output/implementation-artifacts/2-1-backend-patch-api-tasks-id-for-completion-toggle.md] — `TasksApiSurface` extension note, _tasksApiSeams pattern, App type exports PATCH
- [Source: _bmad-output/implementation-artifacts/1-9-sync-pending-indicator-and-retry-exhausted-state-for-capture.md] — sync store pattern, pendingTimers, SYNC_PENDING_DELAY_MS, LiveRegion announce pattern
- [Source: apps/web/src/data/captureSyncStore.ts] — exact mirror template for toggleSyncStore
- [Source: apps/web/src/data/queries.ts] — useCreateTask as exact template for useToggleTask
- [Source: apps/web/src/components/TaskRow.tsx] — current TaskRow structure to extend
- [Source: apps/web/src/styles/tokens.css] — design token variable names for CSS
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#From-1-5] — LiveRegion announce-once-per-transition rule; existing 203 test count baseline

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `toggleSyncStore.ts` as exact mirror of `captureSyncStore.ts` with Toggle prefix throughout.
- Extended `TasksApiSurface` type with callable signature for Eden Treaty's dynamic `:id` segment pattern; added `tasksPatch` fetcher, `patchFetch` seam, and `tasksApi.toggle` method.
- Added `useToggleTask` in `queries.ts` mirroring `useCreateTask` lifecycle; uses separate `pendingToggleTimers` map to avoid key collision with capture operations; `onError` does NOT roll back (FR27).
- Updated `TaskRow.tsx`: `Checkbox` sub-component now accepts `checked`/`onToggle` props; `CheckmarkIcon` sub-component added; toggle sync composes with capture sync via `toggleSync() ?? captureSync()`.
- Updated `TaskRow.css` with completed text treatment (line-through + muted color), checkbox completed fill, hover (hover-capable only), and focus-visible ring.
- Updated `TaskRow.test.tsx`: all renders now wrap in `QueryClientProvider` (required since `useToggleTask` calls `useMutation` unconditionally); added 10 new tests across completed state, toggle sync state, and CSS contract.
- Added `useToggleTask` tests in `queries.test.tsx` covering optimistic update, success without rollback, error without rollback, and cancel-before-mutate.
- Replaced `test.describe.skip` stub in `e2e/manage.spec.ts` with 4 real toggle tests including axe-core assertion.
- All 217 unit tests pass (14 new from Story 2.2); coverage 97.93% functions / 97.24% lines; bundle 27KB gzipped; no new dependencies.

### File List

- `apps/web/src/data/toggleSyncStore.ts` (new)
- `apps/web/src/data/api.ts` (modified)
- `apps/web/src/data/queries.ts` (modified)
- `apps/web/src/components/TaskRow.tsx` (modified)
- `apps/web/src/components/TaskRow.css` (modified)
- `apps/web/src/components/TaskRow.test.tsx` (modified)
- `apps/web/src/data/queries.test.tsx` (modified)
- `e2e/manage.spec.ts` (modified)

## Change Log

- 2026-05-01: Story 2.2 implemented — checkbox toggle UI, optimistic mutation, completed visual treatment, toggle sync state, 14 new unit tests, 4 E2E tests (Date: 2026-05-01)

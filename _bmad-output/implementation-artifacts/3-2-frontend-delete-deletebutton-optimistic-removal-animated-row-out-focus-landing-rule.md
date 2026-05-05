# Story 3.2: Frontend Delete — DeleteButton, Optimistic Removal, Animated Row-Out, Focus-Landing Rule

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to click a task's delete button and see it animate out, with focus landing predictably on the next logical task,
so that I can clear stale items without losing my place in the list.

## Acceptance Criteria

1. **DeleteButton sub-component renders correctly** — DeleteButton renders a 16×16 px trash icon (SVG, no emoji) on the right edge of the row. Has `aria-label="Delete task"` and the spec'd 2 px `accent.default` focus ring with 2 px offset when focused (UX-DR7, UX-DR22, FR19).

2. **DeleteButton desktop visibility** — Default state is `opacity: 0` — present in DOM and tab order, visually hidden. On row hover (`.task-row:hover`) or row focus (`.task-row:focus`), DeleteButton opacity transitions to 1 with color `color.text.muted`. On DeleteButton hover (hover-capable devices only) or DeleteButton focus, color shifts to `color.status.error` and button is fully opaque (UX-DR7).

3. **DeleteButton touch visibility** — On `@media (hover: none)`, DeleteButton is always `opacity: 1` with color `color.text.muted` — never hidden on touch devices (UX-DR19).

4. **`useDeleteTask` mutation fires on click** — Clicking DeleteButton fires `useDeleteTask` mutation with optimistic removal of the row from the `["tasks"]` cache (FR23). The mutation calls Eden `api.api.tasks({ id }).delete()` and retries failed DELETEs with the same backoff policy as other mutations (429 → up to 4 retries; 5xx → up to 3 retries; other 4xx fail-fast).

5. **Row animates out on `motion.medium`** — When a delete fires, the row plays a CSS exit animation of 180 ms ease-out (`var(--motion-medium)`). The mutation's cache update fires after the animation completes via `animationend` event. Under `prefers-reduced-motion: reduce`, `animation-duration` is 0 ms (already enforced by `reset.css`), so `animationend` fires immediately and removal is instant (UX-DR20).

6. **No-rollback contract on retry exhaustion** — `onError` does NOT restore the row to the cache. The row stays optimistically removed. The next `refetchOnReconnect` or manual refetch will reconcile server truth with the local cache (FR27, UX-DR16). `onSuccess` is a no-op (row already removed).

7. **Focus-landing-after-delete rule** — When any row is deleted via click, focus moves per UX-DR13:
   - If the deleted row had a row below it in the list → focus that row (now at the deleted row's position)
   - Else if it had a row above → focus the row above
   - Else (it was the only row) → focus TaskInput (`[aria-label="New task"]`)
   - Focus must move BEFORE the animation starts (so the focus target is still in the DOM and can receive focus). Focus must NEVER dump to document body.

8. **`data-task-id` attribute on every TaskRow `<li>`** — Required for the focus-landing DOM query (`querySelectorAll('[data-task-id]')`). The attribute value is the task's UUID string. All rows in document order will be queried at click time before optimistic removal.

9. **Pre-epic-3 deferred item resolved: toggle pending timer cleanup** — When a TaskRow unmounts (due to delete optimistic removal), any in-flight `pendingToggleTimer` for that task ID must be cancelled. Implement by exporting `clearTogglePendingTimerForTask(id: string)` from `queries.ts` and calling it in TaskRow's `onCleanup`. Prevents stale timer callbacks writing to `toggleSyncStore` for a task that no longer exists in the DOM. [Source: deferred-work.md, "pre-epic-3 — `pendingToggleTimers` entries are never removed when a TaskRow component unmounts"]

10. **`manage.spec.ts` adds beforeEach fixture reset** — Story 3.1 enabled `DELETE /api/tasks` (dev-only bulk reset). This story wires `test.beforeEach` in `e2e/manage.spec.ts` using the same pattern as `e2e/capture.spec.ts`. This resolves the deferred item from Story 2.2 code review: "waitForListSettled resolves as soon as any list item is visible, which can be satisfied by pre-existing rows from prior test runs." [Source: deferred-work.md, "pre-epic-3 — e2e/manage.spec.ts"]

11. **Playwright `e2e/manage.spec.ts` covers the 3 focus-landing branches** — Tests assert:
    - Clicking DeleteButton removes the row visually within the optimistic window
    - Focus lands on the row that was below the deleted row (next-row branch)
    - Focus lands on the row that was above (prev-row branch, when deleting the last row)
    - Focus lands on TaskInput when the only row is deleted (input branch)
    - axe-core reports zero critical or serious violations after delete (NFR-A2)

12. **Quality gates pass** — `bun run check` and `bun run check:full` pass: oxlint zero warnings, oxfmt clean, tsgo `-b --noEmit` clean, dep-count unchanged (web 17/25), all tests pass, coverage ≥ 70%.

## Tasks / Subtasks

- [x] **Task 1 — Extend `apps/web/src/data/api.ts` with delete API layer** (AC: #4)
  - [x] Add `TasksDeleteResponse` type: `{ data: null; error: { status: number; value: unknown } | null; response?: Response; }`
  - [x] Update `TasksApiSurface` type: add `delete: () => Promise<TasksDeleteResponse>` alongside `patch` on the parameterized `(params: { id: string })` call signature
  - [x] Add private `tasksDelete(id: string)` function: `(api.api as unknown as TasksApiSurface).tasks({ id }).delete()`
  - [x] Add `deleteFetch: tasksDelete` to `_tasksApiSeams` object
  - [x] Add `delete` method to `tasksApi`: calls `_tasksApiSeams.deleteFetch(id)`, throws `TasksApiError` on error (same shape as `toggle` and `create`), returns `void` on 204 (no body to validate)

- [x] **Task 2 — Add `useDeleteTask` hook and export cleanup helper in `apps/web/src/data/queries.ts`** (AC: #4, #6, #9)
  - [x] Export `clearTogglePendingTimerForTask(id: string): void` — thin wrapper that calls the existing private `clearTogglePendingTimer(id)`. Needed by TaskRow's `onCleanup`.
  - [x] Add `useDeleteTask()` hook using `useMutation`:
    - `mutationKey: ["tasks", "delete"]`
    - `mutationFn: (id: string) => tasksApi.delete(id)`
    - `retry: computeRetryDecision` (existing helper — 429 → 4 retries, 5xx → 3, other 4xx fail-fast)
    - `retryDelay: computeRetryDelay` (existing helper — exponential + jitter, honors Retry-After)
    - `onMutate`: cancel queries, then `setQueryData` to filter out the deleted task ID: `prev?.filter((t) => t.id !== id)`
    - `onSuccess`: no-op (row already absent from cache)
    - `onError`: no-op — no rollback; FR27/UX-DR16 no-rollback contract; subsequent refetch reconciles
  - [x] Export `useDeleteTask` using named export (no `export default` — ARCH-AR18)

- [x] **Task 3 — Update `apps/web/src/components/TaskRow.tsx`** (AC: #4, #5, #7, #8, #9)
  - [x] Import `onCleanup` from `solid-js`
  - [x] Import `useDeleteTask` and `clearTogglePendingTimerForTask` from `../data/queries`
  - [x] Add `createSignal<boolean>(false)` for `isLeaving` local state
  - [x] Add `data-task-id={props.task.id}` attribute to the `<li>` element (alongside `tabindex="0"`)
  - [x] Add `classList={{ "task-row--leaving": isLeaving() }}` to the `<li>` classList
  - [x] Add `on:animationend` handler to the `<li>`: `() => { if (isLeaving()) deleteMutation.mutate(props.task.id); }`
  - [x] Implement `handleDelete()` function:
    ```
    const allRows = Array.from(document.querySelectorAll('[data-task-id]')) as HTMLElement[];
    const idx = allRows.findIndex(el => el.dataset.taskId === props.task.id);
    const focusTarget = allRows[idx + 1] ?? allRows[idx - 1] ?? null;
    if (focusTarget) {
      focusTarget.focus();
    } else {
      (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
    }
    setIsLeaving(true);
    // mutation fires via animationend handler after animation completes
    ```
  - [x] Add `onCleanup(() => clearTogglePendingTimerForTask(props.task.id))` inside the `TaskRow` function body
  - [x] Wire `useDeleteTask`: `const deleteMutation = useDeleteTask();`
  - [x] Pass `onDelete={handleDelete}` to `<DeleteButton />`
  - [x] Update `DeleteButton` component signature to accept `{ onDelete: () => void }` and wire `onClick={props.onDelete}`

- [x] **Task 4 — Update `apps/web/src/components/TaskRow.css`** (AC: #1, #2, #3, #5)
  - [x] Add DeleteButton base styles:
    ```css
    .task-row__delete {
      color: var(--color-text-muted);
      opacity: 0;
      transition: opacity var(--motion-short) ease-out, color var(--motion-short) ease-out;
    }
    ```
  - [x] Suppress transitions under reduced-motion (inside existing `@media (prefers-reduced-motion: reduce)` block):
    ```css
    .task-row__delete { transition: none; }
    ```
  - [x] Add row-hover and row-focus visibility rules (outside hover media query — :focus applies on all devices):
    ```css
    .task-row:focus .task-row__delete { opacity: 1; }
    ```
  - [x] Inside the existing `@media (hover: hover)` block, add:
    ```css
    .task-row:hover .task-row__delete { opacity: 1; }
    .task-row__delete:hover { color: var(--color-status-error); opacity: 1; }
    ```
  - [x] Add focus-visible rule (outside any media query):
    ```css
    .task-row__delete:focus-visible {
      color: var(--color-status-error);
      opacity: 1;
      outline: 2px solid var(--color-accent-default);
      outline-offset: 2px;
    }
    ```
  - [x] Add touch-always-visible rule:
    ```css
    @media (hover: none) {
      .task-row__delete { opacity: 1; }
    }
    ```
  - [x] Add exit animation and keyframe:
    ```css
    .task-row--leaving {
      animation: task-row-leave var(--motion-medium) ease-out forwards;
      pointer-events: none;
    }

    @keyframes task-row-leave {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    ```
  - [x] Note: `@media (prefers-reduced-motion: reduce)` in `reset.css` already sets `animation-duration: 0ms !important`, collapsing the exit to instant. No additional CSS needed for reduced-motion on this animation.

- [x] **Task 5 — Update `apps/web/src/components/TaskRow.test.tsx`** (AC: #4, #5, #8)
  - [x] Import `_tasksApiSeams` and add `TasksDeleteResponse` to the import list
  - [x] Add `deleteFetch` mock helper in `beforeEach`/`afterEach` (same pattern as `patchFetch`): save `originalDeleteFetch`, restore in `afterEach`
  - [x] Create `renderRowWithDeleteClient(task)` helper that mocks `_tasksApiSeams.deleteFetch` to a pending promise (same pattern as `renderRowWithClient`)
  - [x] Replace the existing test `"does not throw or remove the row when the delete button is clicked (no mutation wired)"` with:
    - `"clicking DeleteButton applies task-row--leaving class before animationend"` — click delete, assert `li.classList.contains('task-row--leaving')` is true; assert the row is still in the DOM (mutation not fired yet because animationend not triggered)
    - `"clicking DeleteButton calls deleteFetch with the task id after animationend"` — mock deleteFetch with pending promise; click delete; fire `fireEvent.animationEnd(li)`; await microtask; assert deleteFetch was called with correct ID
  - [x] Add test: `"DeleteButton has aria-label Delete task and the delete icon SVG"` (if not already covered; the existing test checks aria-label)
  - [x] Add test: `"data-task-id attribute matches task.id"` — render row, assert `li.dataset.taskId === task.id`

- [x] **Task 6 — Update `e2e/manage.spec.ts`** (AC: #10, #11)
  - [x] Add `test.beforeEach` fixture reset at the top (after imports, before `test.describe` blocks):
    ```ts
    test.beforeEach(async ({ request }) => {
      await request.delete("/api/tasks");
    });
    ```
  - [x] Add `test.describe("manage tasks — delete")` block with tests:
    - `"clicking DeleteButton removes the row"` — add 2 tasks, click delete on the first row, assert that row is gone from the list; the remaining row is still present
    - `"focus lands on the next row when a middle or first row is deleted"` — add 3 tasks (A, B, C; newest-first = C, B, A). Click delete on C (index 0). Assert focus is on B (now index 0). Check `document.activeElement` via `evaluate`.
    - `"focus lands on the previous row when the last row is deleted"` — add 2 tasks (newest-first: B, A). Click delete on A (index 1). Assert focus is on B (index 0).
    - `"focus lands on TaskInput when the only row is deleted"` — add 1 task. Click delete. Assert focus is on `[aria-label="New task"]`.
    - `"axe-core reports no critical or serious violations after delete"` — add a task, delete it, run AxeBuilder and filter `violations` to critical/serious, assert empty.

- [x] **Task 7 — Quality gate verification** (AC: #12)
  - [x] Run `bun run check` — oxlint zero, oxfmt clean, tsgo clean, dep-count web 17/25 (no new deps)
  - [x] Run `bun run check:full` — all tests pass (233 pass, 0 fail), coverage 97.34% ≥ 70%, audit clean, build succeeds, bundle-size within limit

## Dev Notes

### Architecture — Critical Patterns to Follow

**TanStack Query mutation pattern (mirrors `useToggleTask`):**
The existing `useToggleTask` in `queries.ts` is the template. `useDeleteTask` follows the exact same structure: `useMutation` with `mutationKey`, `mutationFn`, `retry`, `retryDelay`, `onMutate`, `onSuccess`, `onError`. The no-rollback contract in `onError` is non-negotiable (FR27, UX-DR16). Unlike toggle, there is no sync store for delete — the row is gone from the cache immediately and there is no visible row to show sync state on.

**`computeRetryDecision` and `computeRetryDelay` are shared:**
Both are already exported from `queries.ts`. Use them directly in `useDeleteTask` without copying or modifying.

**Named exports only:**
All exports must be named. No `export default`. (ARCH-AR18, architecture/implementation-patterns-consistency-rules.md)

**No `any`, no magic numbers:**
The `180` in `motion.medium` is NOT a magic number in JS — the animation duration lives in CSS as `var(--motion-medium)`. The JS side uses the `animationend` event, not a hardcoded timeout. Do not add `const MOTION_MEDIUM_MS = 180` to constants.ts.

**Repository pattern stays on the backend:**
This story touches only `apps/web/`. No backend changes.

**`_tasksApiSeams` DI pattern:**
Every API call is surfaced through `_tasksApiSeams` so tests can swap the fetch function without network calls. `tasksApi.delete` must route through `_tasksApiSeams.deleteFetch`. Same pattern as `list`, `create`, `toggle`.

### Focus-Landing Implementation Detail

The focus target is computed at click time (before `setIsLeaving(true)`) by querying the live DOM:

```ts
const allRows = Array.from(document.querySelectorAll('[data-task-id]')) as HTMLElement[];
const idx = allRows.findIndex(el => el.dataset.taskId === props.task.id);
const focusTarget = allRows[idx + 1] ?? allRows[idx - 1] ?? null;
```

This is safe because:
- All `<li>` elements with `data-task-id` appear in document order matching visual order (no CSS reordering)
- The query runs before `setIsLeaving(true)`, so all rows are still in the DOM and focusable
- `dataset.taskId` reads the `data-task-id` attribute (camelCase conversion is automatic in HTML)

UUIDs only contain `[0-9a-f-]`, so `CSS.escape()` is not required for the `querySelectorAll` selector, but is good defensive practice if added.

**TaskInput focus fallback**: `document.querySelector('[aria-label="New task"]')` matches the `<input>` inside `TaskInput.tsx`. This is stable — the aria-label is set in source and never computed. Cast to `HTMLElement` before calling `.focus()`.

### Animation and `animationend` in Solid.js

Solid.js JSX uses `on:animationend` (lowercase, non-delegated event prefix) for the `animationend` DOM event. Do NOT use `onAnimationEnd` — Solid's delegated event system may not include animation events in all versions.

```tsx
<li
  on:animationend={() => { if (isLeaving()) deleteMutation.mutate(props.task.id); }}
  classList={{ "task-row--leaving": isLeaving() }}
  ...
>
```

Under `prefers-reduced-motion: reduce`, `reset.css` sets `animation-duration: 0ms !important`. Browsers still fire `animationend` after 0ms. The row disappears instantly to the user while the JS path remains identical.

The `pointer-events: none` on `.task-row--leaving` prevents a double-click on the delete button during the animation from re-triggering deletion.

### DeleteButton CSS Gotcha: `:focus` vs `:focus-within`

- `.task-row:focus` — the `<li tabindex="0">` itself received focus via keyboard Tab
- `.task-row:focus-within` — a descendant (Checkbox, RetryAction, DeleteButton) received focus

When the `<li>` is focused via Tab, `:focus` fires (not `:focus-within`). Use `.task-row:focus .task-row__delete` to show the button when the row is focused.

When DeleteButton is focused via Tab (into the row's interactive elements), use `.task-row__delete:focus-visible` for the error-color + focus ring. Do NOT use `:focus-within` to show the delete button when descendants are focused — this would cause the button to flash visible/hidden on the wrong events.

### Pre-Epic-3 Deferred Items Resolved by This Story

**1. `pendingToggleTimers` cleanup on unmount (deferred-work.md, Story 2.2)**
When a `TaskRow` is destroyed via optimistic deletion, any `setTimeout` registered in `useToggleTask`'s `onMutate` for that task ID may still be pending. When it fires, `__toggleSyncMutators.markPending(id, retry)` writes to the toggle sync store for a dead task ID. The fix: export `clearTogglePendingTimerForTask` from `queries.ts` (thin wrapper around the existing private `clearTogglePendingTimer`) and call it in TaskRow's `onCleanup`.

**2. `manage.spec.ts` has no fixture reset (deferred-work.md, Story 2.2)**
The `waitForListSettled` helper resolves as soon as any listitem is visible. Without a fixture reset, pre-existing rows from prior test runs can satisfy this condition, making tests non-deterministic. The `DELETE /api/tasks` endpoint added in Story 3.1 enables a `beforeEach` fixture reset, matching `capture.spec.ts`.

### Files Being Modified — Current State

**`apps/web/src/data/api.ts`** (current state: has GET/POST/PATCH; no DELETE):
- `TasksApiSurface` at line 70–78: the parameterized `(params: { id: string })` call signature currently only exposes `patch`. Add `delete: () => Promise<TasksDeleteResponse>` to the same object type.
- `_tasksApiSeams` at line 97–101: add `deleteFetch: tasksDelete` alongside existing entries.
- `tasksApi` at line 103–173: add `delete` method. Pattern: call `_tasksApiSeams.deleteFetch(id)`, check `error`, throw `TasksApiError` with status/message/code/retryAfterMs. On 204 success, return void (no body to validate).

**`apps/web/src/data/queries.ts`** (current state: has `useTasks`, `useToggleTask`, `useCreateTask`):
- `clearTogglePendingTimer` at line 37–41 is private. Expose it by adding: `export const clearTogglePendingTimerForTask = (id: string): void => clearTogglePendingTimer(id);`
- Add `useDeleteTask` after `useCreateTask`. Follow the exact `useMutation` call structure from `useToggleTask` (lines 88–139).

**`apps/web/src/components/TaskRow.tsx`** (current state: has Toggle, Checkbox, stub DeleteButton):
- `DeleteButton` at line 118–128: currently has no `onClick`. Add `{ onDelete: () => void }` prop and wire `onClick={props.onDelete}`.
- The `<li>` at line 28: currently has no `data-task-id`. Add it.
- The function body: add `createSignal`, `useDeleteTask`, `handleDelete`, `onCleanup`.

**`apps/web/src/components/TaskRow.css`** (current state: has sync-indicator, retry-exhausted, completed, checkbox styles):
- No `.task-row__delete` CSS exists yet. The button renders but is invisible only because it has no styling. Actually — looking at the current CSS, there is no delete button CSS at all, so the button is currently always visible (default opacity 1). After this story, it will be `opacity: 0` by default and conditionally visible.

**`e2e/manage.spec.ts`** (current state: has toggle tests, no `beforeEach` fixture reset):
- Add `beforeEach` fixture reset (same as `capture.spec.ts` line 4–6).
- Add `test.describe("manage tasks — delete")` block after the existing toggle describe block.

### Testing Requirements

**bun:test idiom:** `describe(...)` → `it(...)`. NOT `test(...)`. [Source: architecture/implementation-patterns-consistency-rules.md#Test-structure]

**`_tasksApiSeams.deleteFetch` mock pattern:**
```ts
const originalDeleteFetch = _tasksApiSeams.deleteFetch;

// In a render helper or beforeEach:
_tasksApiSeams.deleteFetch = mock(
  (_id: string): Promise<TasksDeleteResponse> => new Promise<TasksDeleteResponse>(() => undefined),
);

afterEach(() => {
  _tasksApiSeams.deleteFetch = originalDeleteFetch;
});
```

**Triggering `animationend` in unit tests:**
`happy-dom` does not run CSS animations. Trigger the event manually after clicking delete:
```ts
const li = container.querySelector('li')!;
fireEvent.click(getByLabelText("Delete task"));
// isLeaving is now true, task-row--leaving class applied
fireEvent.animationEnd(li);
// Now deleteMutation.mutate() has been called
await new Promise(resolve => setTimeout(resolve, 0)); // microtask flush
expect(deleteMock.mock.calls).toHaveLength(1);
```

**`data-task-id` assertion:**
```ts
const li = container.querySelector('li')!;
expect(li.dataset.taskId).toBe(task.id);
```

**Playwright fixture reset pattern (matches capture.spec.ts):**
```ts
test.beforeEach(async ({ request }) => {
  await request.delete("/api/tasks");
});
```

**Playwright focus assertion after delete:**
```ts
const isFocused = await targetElement.evaluate(el => el === document.activeElement);
expect(isFocused).toBe(true);
```

**axe-core pattern (matches manage.spec.ts toggle tests):**
```ts
const results = await new AxeBuilder({ page }).analyze();
const blocking = results.violations.filter(
  v => v.impact === "critical" || v.impact === "serious",
);
expect(blocking).toEqual([]);
```

### Previous Story Intelligence (from Stories 2.3 and 3.1)

- **Test count baseline:** 231 tests passing after Story 3.1 (224 − 1 stub + 8 new). This story removes 1 test (the "no mutation wired" delete test) and adds ~6 unit tests → expect ~236+ passing.
- **Coverage baseline:** 97.24% lines after Story 3.1. No regression expected.
- **`on:animationend` vs `onAnimationEnd`:** Solid's JSX event delegation does not include animation events. Use `on:animationend` (the `on:` prefix forces non-delegated addEventListener). If oxlint flags this, add an inline ignore comment.
- **`fireEvent.animationEnd` exists in `@solidjs/testing-library`:** It wraps `createEvent.animationEnd` from `@testing-library/dom`. Use it to simulate the `animationend` event in unit tests.
- **`_tasksApiSeams` mock lifetime:** The existing tests set `_tasksApiSeams.patchFetch` in a helper and restore in `afterEach`. Follow the identical pattern for `_tasksApiSeams.deleteFetch`. Do NOT use `mock.restore()` — manually assign the original reference back.
- **E2E `waitForListSettled` helper is already defined** in `manage.spec.ts` (lines 4–10). Reuse it in the new delete tests to ensure the list is settled before asserting focus state.
- **Story 3.1 registered `DELETE /api/tasks` before `DELETE /api/tasks/:id`** in `tasksRoute` for exact-match-first ordering. The frontend calls `DELETE /api/tasks/:id` (single-resource), not the collection endpoint.

### Anti-Patterns to Avoid

- **Do NOT** add a sync store for delete (no `deleteSyncStore.ts`). The deleted row is gone — there is nothing to show sync state on.
- **Do NOT** roll back the optimistic removal in `onError`. The no-rollback contract is FR27 / UX-DR16.
- **Do NOT** use `setTimeout(180)` instead of `animationend`. Use the event so reduced-motion works correctly at 0 ms without special-casing.
- **Do NOT** add `pointer-events: none` to the `<li>` before adding it to `.task-row--leaving` in CSS — only the leaving animation should suppress pointer events.
- **Do NOT** use `export default` for `useDeleteTask`. Named export only.
- **Do NOT** add a new dependency for animations (`solid-transition-group` or `@motionone/solid`). The exit animation is achievable with CSS keyframes + `animationend`. Dep count must stay at web 17/25.
- **Do NOT** modify `TaskList.tsx`. The focus-landing logic lives entirely in `TaskRow.tsx` via the DOM query approach. No ref maps, no callbacks from TaskList, no context API needed.
- **Do NOT** add `clearCapturePendingTimerForTask` — only the toggle timer needs cleanup (capture timers are managed differently and the capture row is never deleted by the user before sync).
- **Do NOT** implement `UndoSnackbar` or the Cmd/Ctrl+Z global handler — those are Story 3.4 scope. This story ends with the row gone; no undo UI is added here.
- **Do NOT** add `announce()` LiveRegion calls for delete — Story 3.3 owns the "Task deleted. Press Command-Z to undo." announcement. This story fires the mutation only; no screen-reader announcement text is added here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.2] — story statement, BDD acceptance criteria, UX-DR7, UX-DR13, UX-DR16, FR23, FR27
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3] — epic overview: focus-landing rule, animated row-out, no-rollback contract
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR7] — DeleteButton spec: 16×16, opacity 0 default desktop, opacity 1 on hover/focus, always visible on touch
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR13] — focus-landing-after-delete rule: next → previous → input
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR15] — delete is immediate; UndoSnackbar (Story 3.4); Cmd/Ctrl+Z (Story 3.4)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR20] — reduced-motion: removal is instant
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D7] — TanStack Solid Query: no rollback on error
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D3] — REST contract: DELETE /api/tasks/:id → 204 idempotent / 429
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Module-Conventions] — named exports only; no export default
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Anti-patterns] — no any, no magic numbers, no console.log in production
- [Source: _bmad-output/implementation-artifacts/3-1-backend-delete-api-tasks-id-idempotent.md] — backend DELETE implemented; fixture-reset `DELETE /api/tasks` available for E2E tests
- [Source: _bmad-output/implementation-artifacts/2-3-keyboard-toggle-space-on-focused-row-liveregion-announcements.md] — 231 test baseline, check:full criteria, pattern for on:keydown non-delegated events
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Story-2.2] — pre-epic-3 items: pendingToggleTimers cleanup; manage.spec.ts fixture reset

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `TasksDeleteResponse` type and updated `TasksApiSurface` to expose `delete` on parameterized tasks call; added `tasksDelete` private function and `deleteFetch` seam; added `tasksApi.delete` with retry-after header parsing — mirrors `toggle`/`create` pattern exactly.
- Exported `clearTogglePendingTimerForTask` as a thin wrapper around the private `clearTogglePendingTimer` in queries.ts. Added `useDeleteTask` hook with `useMutation`, no-rollback `onError`, optimistic filter in `onMutate`. Named export only.
- Updated `TaskRow.tsx`: added `createSignal(false)` for `isLeaving`, `onCleanup` for timer cleanup, `data-task-id` attribute, `task-row--leaving` classList entry, `on:animationend` non-delegated handler that fires mutation after animation, and `handleDelete` focus-landing logic. Updated `DeleteButton` to accept and wire `onDelete` prop.
- Added all DeleteButton CSS: base opacity-0 default, reduced-motion transition-none, row-focus/row-hover visibility, hover-capable device hover rules, focus-visible error-color + focus ring, touch always-visible, exit keyframe animation with `pointer-events: none` during leave.
- Replaced stale "no mutation wired" delete test with two new tests (leaving class before animationend, deleteFetch called after animationend). Added `data-task-id` assertion test. Added `renderRowWithDeleteClient` helper and `originalDeleteFetch` restore. All 233 tests pass.
- Added `test.beforeEach` fixture reset to `manage.spec.ts` and `test.describe("manage tasks — delete")` block with 5 Playwright tests covering remove, focus-next, focus-prev, focus-input, and axe-core no-violations.
- `bun run check` and `bun run check:full` both pass. Coverage: 97.34%. Dep count: web 17/25. Bundle: 28KB gzipped.

### File List

- apps/web/src/data/api.ts
- apps/web/src/data/queries.ts
- apps/web/src/components/TaskRow.tsx
- apps/web/src/components/TaskRow.css
- apps/web/src/components/TaskRow.test.tsx
- e2e/manage.spec.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/3-2-frontend-delete-deletebutton-optimistic-removal-animated-row-out-focus-landing-rule.md

### Review Findings

- [x] [Review][Patch] `on:animationend` has no `animationName` guard — bubbled child-element `animationend` events could spuriously trigger `deleteMutation.mutate` while `isLeaving()` is true [apps/web/src/components/TaskRow.tsx:50]
- [x] [Review][Patch] E2E "removes the row" test asserts `not.toBeVisible` instead of DOM removal — passes on CSS opacity fade alone, doesn't verify optimistic cache removal fired [e2e/manage.spec.ts:137]
- [x] [Review][Defer] Concurrent delete + toggle mutation — `cancelQueries` in `useDeleteTask.onMutate` cancels queries but not in-flight toggle mutations; toggle `onError` may call `markExhausted` for a row that has already been optimistically removed [apps/web/src/data/queries.ts:216] — deferred, pre-existing
- [x] [Review][Defer] No unit test for `isLeaving() === false` guard on `animationend` (negative path not covered) [apps/web/src/components/TaskRow.test.tsx] — deferred, pre-existing
- [x] [Review][Defer] E2E focus-landing tests don't enforce the "focus before animation starts" ordering constraint specified in AC #7 Dev Notes [e2e/manage.spec.ts:157] — deferred, pre-existing

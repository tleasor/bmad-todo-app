# Story 3.3: Keyboard Delete — Delete and Backspace on Focused Row + LiveRegion Announcements

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a keyboard-first user,
I want to press Delete or Backspace with a row focused to delete it, with a screen-reader announcement that names the undo path,
so that I never have to reach for the mouse to clear out tasks, and undo discoverability survives without visual chrome.

## Acceptance Criteria

1. **Delete or Backspace on the row container triggers deletion** — When the `<li tabindex="0">` itself has focus (not a child element), pressing `Delete` or `Backspace` calls `handleDelete()` — the same function used by the click path (FR16). `event.preventDefault()` is called to suppress any browser default. The guard `event.target === event.currentTarget` ensures child-element key events do not double-fire.

2. **Focus lands per the focus-landing-after-delete rule** — After a keyboard-triggered delete, focus moves per UX-DR13 (same as click path): (1) row below → (2) row above → (3) TaskInput. This is the existing `handleDelete()` logic reused unchanged. Focus never dumps to document body.

3. **Row animates out on `motion.medium`** — Same animation path as click: `setIsLeaving(true)` → `task-row--leaving` class → `on:animationend` fires → `deleteMutation.mutate(id)`. Instant under `prefers-reduced-motion: reduce` (0 ms via `reset.css`). (UX-DR20)

4. **LiveRegion — first delete in session** — On the **first** delete triggered in the browser session (click or keyboard), `announce()` fires with: `"Task deleted. Press Command-Z to undo."` on macOS, or `"Task deleted. Press Control-Z to undo."` on all other platforms. Platform detection reads `navigator.platform` once at module load (not per keystroke). (UX-DR10, UX-DR15)

5. **LiveRegion — subsequent deletes** — On all deletes after the first in the session, `announce()` fires with: `"Task deleted"`. (UX-DR10)

6. **Announcement fires for both click and keyboard paths** — The `announce()` call lives in `useDeleteTask`'s `onMutate` in `queries.ts` so it fires regardless of how the delete was initiated. Note: `onMutate` fires after `animationend` (~0–180 ms after user action), which is acceptable for screen reader latency.

7. **Playwright `e2e/keyboard.spec.ts`** — New `test.describe("keyboard delete — Delete and Backspace on focused row")` block:
   - Tab into row → Delete key → row removed → focus lands on next row (or previous, or input per rule)
   - Tab into row → Backspace key → row removed → focus lands correctly
   - axe-core reports zero critical or serious violations after a keyboard-driven delete

8. **Quality gates pass** — `bun run check` and `bun run check:full` pass: oxlint zero warnings, oxfmt clean, tsgo `-b --noEmit` clean, dep-count unchanged (web 17/25), all tests pass, coverage ≥ 70%.

## Tasks / Subtasks

- [x] **Task 1 — Extend `handleRowKeyDown` in `apps/web/src/components/TaskRow.tsx`** (AC: #1, #2, #3)
  - [x] Inside `handleRowKeyDown`, add a second conditional block after the Space handler:
    ```ts
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      handleDelete();
    }
    ```
  - [x] No other changes to `TaskRow.tsx` — `handleDelete()` already contains focus-landing logic and `setIsLeaving(true)`; it is reused unchanged.

- [x] **Task 2 — Add delete announcement strings to `apps/web/src/data/announcements.ts`** (AC: #4, #5)
  - [x] Add: `export const LIVE_REGION_TASK_DELETED = "Task deleted";`
  - [x] Add: `export const LIVE_REGION_TASK_DELETED_UNDO_MAC = "Task deleted. Press Command-Z to undo.";`
  - [x] Add: `export const LIVE_REGION_TASK_DELETED_UNDO_OTHER = "Task deleted. Press Control-Z to undo.";`

- [x] **Task 3 — Add platform detection and first-delete tracking to `apps/web/src/data/queries.ts`** (AC: #4, #5, #6)
  - [x] Add platform detection at module scope (after imports):
    ```ts
    const isMac: boolean =
      typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
    ```
  - [x] Add session flag at module scope:
    ```ts
    let firstDeleteAnnouncementSent = false;
    ```
  - [x] Export a test-reset helper (following existing `__reset*ForTests` pattern):
    ```ts
    export const __resetFirstDeleteAnnouncementForTests = (): void => {
      firstDeleteAnnouncementSent = false;
    };
    ```
  - [x] In `useDeleteTask`'s `onMutate`, add the announce call before (or after) the `setQueryData`:
    ```ts
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => prev?.filter((t) => t.id !== id));
      if (!firstDeleteAnnouncementSent) {
        firstDeleteAnnouncementSent = true;
        announce(isMac ? LIVE_REGION_TASK_DELETED_UNDO_MAC : LIVE_REGION_TASK_DELETED_UNDO_OTHER);
      } else {
        announce(LIVE_REGION_TASK_DELETED);
      }
    },
    ```
  - [x] Add the three new announcement constants to the import from `./announcements`.

- [x] **Task 4 — Add unit tests to `apps/web/src/components/TaskRow.test.tsx`** (AC: #1)
  - [x] Add a new `describe("TaskRow keyboard Delete/Backspace handler")` block
  - [x] Test: `"Delete on the <li> container calls deleteFetch after animationend"` — `renderRowWithDeleteClient`, get `<li>`, `fireEvent.keyDown(li, { key: "Delete" })`, assert `li.classList.contains("task-row--leaving")` is true; then `fireEvent.animationEnd(li)`, await microtask, assert `_tasksApiSeams.deleteFetch` called once with correct id
  - [x] Test: `"Backspace on the <li> container calls deleteFetch after animationend"` — same pattern with `{ key: "Backspace" }`
  - [x] Test: `"Delete on a child button does not trigger row-level delete"` — `renderRowWithDeleteClient`, `fireEvent.keyDown(getByRole("checkbox"), { key: "Delete" })`, await microtask, assert `_tasksApiSeams.deleteFetch` NOT called (bubbles to `<li>` but `event.target !== event.currentTarget`)

- [x] **Task 5 — Update `e2e/keyboard.spec.ts`** (AC: #7)
  - [x] Add `test.beforeEach` fixture reset at the top of the file (same pattern as `manage.spec.ts`):
    ```ts
    test.beforeEach(async ({ request }) => {
      await request.delete("/api/tasks");
    });
    ```
  - [x] Add `test.describe("keyboard delete — Delete and Backspace on focused row")` block:
    - `"Tab into row, Delete key removes row, focus lands on next row"` — add 2 tasks (A, B; newest-first B, A); Tab from input to first row (B); assert row B is focused; press Delete; assert row B is gone from DOM; assert focus is on row A (now index 0)
    - `"Tab into row, Backspace key removes row, focus lands on TaskInput when last row"` — add 1 task; Tab into row; press Backspace; assert row is gone; assert `[aria-label="New task"]` is focused
    - `"axe-core reports no critical or serious violations after keyboard delete"` — add task, Tab into row, press Delete, wait for removal, run AxeBuilder, filter critical/serious, assert empty

- [x] **Task 6 — Quality gate verification** (AC: #8)
  - [x] Run `bun run check` — oxlint ✓, oxfmt ✓, tsgo clean ✓, dep-count web 17/25 ✓
  - [x] Run `bun run check:full` — all tests pass (236/236), coverage 97.33% ≥ 70%, audit clean, build clean

## Dev Notes

### What This Story Is (and Is Not)

**This is a small keyboard-extension story.** `handleDelete()` and the full delete path (animation, focus-landing, mutation) already exist from Story 3.2. The only new production code is:
1. Two lines in `handleRowKeyDown` (Delete/Backspace branch)
2. Three new string constants in `announcements.ts`
3. Platform detection + session flag + `announce()` call in `useDeleteTask.onMutate`

The bulk of this story is tests and the `keyboard.spec.ts` Playwright spec.

### The Exact `TaskRow.tsx` Change

Current `handleRowKeyDown` (lines 23–29):
```tsx
const handleRowKeyDown = (event: KeyboardEvent): void => {
  if (event.key === " " && event.target === event.currentTarget) {
    event.preventDefault();
    if (toggleMutation.isPending) return;
    toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed });
  }
};
```

After this story:
```tsx
const handleRowKeyDown = (event: KeyboardEvent): void => {
  if (event.key === " " && event.target === event.currentTarget) {
    event.preventDefault();
    if (toggleMutation.isPending) return;
    toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed });
  }
  if (
    (event.key === "Delete" || event.key === "Backspace") &&
    event.target === event.currentTarget
  ) {
    event.preventDefault();
    handleDelete();
  }
};
```

**No other changes to `TaskRow.tsx`.** `handleDelete()` already has:
- Focus-landing DOM query before `setIsLeaving(true)`
- The exact same animation → `animationend` → `deleteMutation.mutate(id)` path as the click path

### Why `event.target === event.currentTarget` Guard

When the `<li>` itself is focused (via Tab to the row), `event.target` = `<li>` = `event.currentTarget` → Delete/Backspace fires `handleDelete()`. When a child (Checkbox, DeleteButton, RetryAction) is focused and Delete/Backspace is pressed, the event bubbles to `<li>` but `event.target` = the child ≠ `<li>` → handler skips. This prevents accidental deletion when the user is interacting with a sub-element.

### Announcement Architecture

The `announce()` call is placed in `useDeleteTask.onMutate` (in `queries.ts`) rather than in `handleDelete()` because:
1. It fires for **both** click and keyboard paths — `handleDelete()` is only the click/keyboard trigger; the mutation fires via `animationend`
2. Consistency with `useToggleTask` and `useCreateTask` announcement patterns — all announcement logic lives in `queries.ts`

The delay between key press and announcement is 0–180 ms (animation duration). Under `prefers-reduced-motion: reduce`, the delay is 0 ms. This is acceptable screen reader latency.

**Platform detection** happens once at module load (not per keystroke):
```ts
const isMac: boolean =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
```
`navigator.platform` is deprecated in favor of User-Agent Client Hints, but remains widely supported across all targets (Chrome 120, Edge 120, Firefox 120, Safari 15). The `typeof navigator !== "undefined"` guard prevents crashes during SSR or test environments where `navigator` may not exist.

### Session Flag Behavior

`firstDeleteAnnouncementSent` is a module-level boolean (`false` on page load). After the first delete's `onMutate` fires, it flips to `true` and stays `true` for the session. Unit tests must call `__resetFirstDeleteAnnouncementForTests()` in `afterEach` to restore the flag between test runs.

**`__resetFirstDeleteAnnouncementForTests` must be imported and called in `TaskRow.test.tsx` and `queries.test.tsx` (if that file tests delete announcements) — add to the existing `afterEach` cleanup block.**

### Unit Test Mechanics

**Re-using existing helpers:** `renderRowWithDeleteClient` already exists in `TaskRow.test.tsx` (line 57–63) — mock `deleteFetch` returning a pending promise. Reuse for the new Delete/Backspace tests.

**Triggering the animation path in tests:**
```ts
const { getByLabelText, container } = renderRowWithDeleteClient(baseTask());
const li = container.querySelector("li")!;
fireEvent.keyDown(li, { key: "Delete" });
// isLeaving is now true, task-row--leaving class applied
expect(li.classList.contains("task-row--leaving")).toBe(true);
fireEvent.animationEnd(li);
await new Promise((resolve) => setTimeout(resolve, 0)); // microtask flush
expect(_tasksApiSeams.deleteFetch.mock.calls).toHaveLength(1);
```

**Child-element guard test:**
```ts
const { getByRole } = renderRowWithDeleteClient(baseTask());
const checkbox = getByRole("checkbox");
fireEvent.keyDown(checkbox, { key: "Delete" });
// event.target = checkbox ≠ <li> → handler skips
await new Promise((resolve) => setTimeout(resolve, 0));
expect(_tasksApiSeams.deleteFetch.mock.calls).toHaveLength(0);
```

**bun:test idiom:** `describe(...)` + `it(...)` for unit tests. `test(...)` for Playwright. (architecture/implementation-patterns-consistency-rules.md)

### E2E: `keyboard.spec.ts` Structure After This Story

```ts
// Keep existing Epic 4 stub UNCHANGED:
test.describe.skip("keyboard-only navigation (Epic 4)", () => { ... });

// Keep existing Space toggle tests UNCHANGED:
test.describe("keyboard toggle — Space on focused row", () => { ... });

// Add NEW describe block:
test.describe("keyboard delete — Delete and Backspace on focused row", () => {
  test("Tab into row, Delete key removes row, focus lands on next row", ...);
  test("Tab into row, Backspace key removes row, focus lands on TaskInput when last row", ...);
  test("axe-core reports no critical or serious violations after keyboard delete", ...);
});
```

**Add `test.beforeEach` fixture reset** at the file level — `keyboard.spec.ts` currently has no fixture reset; this must be added so tests don't see rows from prior runs. Pattern:
```ts
test.beforeEach(async ({ request }) => {
  await request.delete("/api/tasks");
});
```

**E2E focus assertion after keyboard delete (preferred pattern — no deprecated `elementHandle()`):**
```ts
await expect(page.locator('[aria-label="New task"]')).toBeFocused();
// or for a row:
const row = page.getByRole("listitem").filter({ hasText: rowText });
await expect(row).toBeFocused();
```

**Waiting for row removal after keyboard delete:**
The row animates out in 180 ms. Use `await expect(row).not.toBeVisible()` which Playwright polls automatically. Under CI, the dev server runs with `NODE_ENV=development`, so `prefers-reduced-motion` may or may not collapse the animation depending on OS accessibility settings — use `await expect(row).not.toBeVisible({ timeout: 2000 })` to be safe.

### Files Being Modified — Current State

**`apps/web/src/components/TaskRow.tsx`** (175 lines, current from Story 3.2):
- `handleRowKeyDown` at lines 23–29: Space-only handler. Add Delete/Backspace branch inside the function body.
- `handleDelete` at lines 31–41: already wired and working. No changes.
- All keyboard event handling uses `onKeyDown` (camelCase SolidJS prop). Never `onkeydown`.

**`apps/web/src/data/announcements.ts`** (15 lines):
- Add 3 new exported string constants. No other changes.

**`apps/web/src/data/queries.ts`** (224 lines, current from Story 3.2):
- Add platform detection and `firstDeleteAnnouncementSent` flag after existing module-scope `Map` declarations (~line 32).
- Add `__resetFirstDeleteAnnouncementForTests` export.
- Modify `useDeleteTask.onMutate` (~line 215) to add `announce()` call after the `setQueryData` call.
- Add 3 new constants to the import from `./announcements`.

**`apps/web/src/components/TaskRow.test.tsx`** (401 lines):
- Add new `describe("TaskRow keyboard Delete/Backspace handler")` block at the end.
- Import `__resetFirstDeleteAnnouncementForTests` from `../data/queries` and call it in the top-level `afterEach`.

**`e2e/keyboard.spec.ts`** (currently has Space toggle tests + Epic 4 skip stub):
- Add `test.beforeEach` fixture reset at the top.
- Add new `test.describe("keyboard delete — Delete and Backspace on focused row")` block.

### Anti-Patterns to Avoid

- **Do NOT** implement `UndoSnackbar` or `Cmd/Ctrl+Z` — those are Story 3.4 scope.
- **Do NOT** add "N tasks deleted" concurrent collapsing — Story 3.4 scope. Story 3.3 only needs the first-delete / subsequent-delete distinction.
- **Do NOT** call `announce()` from `handleDelete()` in `TaskRow.tsx` — put it in `useDeleteTask.onMutate` in `queries.ts` for consistency and to cover both click and keyboard paths.
- **Do NOT** add a new dependency for platform detection (`ua-parser-js` or similar). `navigator.platform` is sufficient for the Mac/non-Mac distinction at MVP.
- **Do NOT** use `export default`. Named exports only. (ARCH-AR18)
- **Do NOT** read `navigator.platform` inside `onMutate` on every call — detect once at module load.
- **Do NOT** remove or modify `test.describe.skip("keyboard-only navigation (Epic 4)", ...)` — the Epic 4 stub is intentionally preserved.
- **Do NOT** modify `TaskList.tsx` or any backend files — this story is frontend-only within existing files.
- **Do NOT** add `prefers-reduced-motion` handling to `handleRowKeyDown` — `reset.css` already collapses `animation-duration: 0ms !important`, so `animationend` fires immediately; no special-casing needed.

### Test Count and Coverage Baseline

- **Baseline:** 233 tests passing after Story 3.2. Coverage 97.34%.
- **Expected additions:** ~3 unit tests (Delete, Backspace, child-guard) + 3 Playwright tests = ~6 new tests.
- **Expected total:** ~236+ passing unit tests.
- No coverage regression expected — new branches are exercised by the new unit tests.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.3] — story statement, BDD acceptance criteria, FR16, UX-DR10, UX-DR13, UX-DR15
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3] — epic scope: Delete/Backspace on focused row, focus-landing rule, LiveRegion announcements
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR10] — LiveRegion announcement strings: "Task deleted. Press Command-Z to undo." (first) / "Task deleted" (subsequent) / "N tasks deleted" (concurrent, Story 3.4)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR12] — keyboard shortcut set: Delete or Backspace deletes on focused TaskRow
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR13] — focus-landing-after-delete rule (already implemented in Story 3.2's `handleDelete`)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR15] — platform-appropriate undo copy in LiveRegion announcement
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR20] — reduced-motion: animation collapses to instant
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Module-Conventions] — named exports only; no `export default`; `onKeyDown` (camelCase) for SolidJS
- [Source: _bmad-output/implementation-artifacts/3-2-frontend-delete-deletebutton-optimistic-removal-animated-row-out-focus-landing-rule.md] — `handleDelete()` focus-landing logic; `on:animationend` pattern; `renderRowWithDeleteClient` test helper; test baseline 233/97.34%
- [Source: _bmad-output/implementation-artifacts/2-3-keyboard-toggle-space-on-focused-row-liveregion-announcements.md] — `event.target === event.currentTarget` double-fire prevention pattern; `onKeyDown` handler location in `TaskRow.tsx`; keyboard.spec.ts structure

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Pre-existing test failure fixed: `"clicking DeleteButton calls deleteFetch with the task id after animationend"` was failing (baseline 232, not 233) because `fireEvent.animationEnd` in happy-dom does not set `animationName` by default. Fixed by passing `{ animationName: "task-row-leave" }` to all `fireEvent.animationEnd` calls that exercise the delete path.

### Completion Notes List

- Implemented Delete/Backspace handler in `handleRowKeyDown` inside `TaskRow.tsx` — 8 lines added, reuses existing `handleDelete()` unchanged.
- Added 3 announcement string constants to `announcements.ts` (task deleted, Mac undo hint, non-Mac undo hint).
- Added `isMac` platform detection (once at module load), `firstDeleteAnnouncementSent` session flag, `__resetFirstDeleteAnnouncementForTests` test-reset export, and `announce()` call inside `useDeleteTask.onMutate` in `queries.ts`.
- Added 3 unit tests in `TaskRow.test.tsx` (Delete, Backspace, child-guard). Also fixed the pre-existing `animationend` test by passing `animationName: "task-row-leave"` to `fireEvent.animationEnd`.
- Added 3 Playwright tests in `keyboard.spec.ts` and file-level `test.beforeEach` fixture reset.
- Final: 236 pass / 0 fail, coverage 97.33%, all gates clean.

### File List

- apps/web/src/components/TaskRow.tsx
- apps/web/src/data/announcements.ts
- apps/web/src/data/queries.ts
- apps/web/src/components/TaskRow.test.tsx
- e2e/keyboard.spec.ts

### Review Findings

- [x] [Review][Patch] `isMac` has no test seam — `LIVE_REGION_TASK_DELETED_UNDO_MAC` branch has 0% unit test coverage; `navigator.platform` returns `""` in jsdom/headless, so `isMac` is always `false` in tests; add `export const __setIsMacForTests` following the `__reset*ForTests` pattern [apps/web/src/data/queries.ts:35]
- [x] [Review][Defer] `navigator.platform` deprecated [apps/web/src/data/queries.ts:35] — deferred, pre-existing; spec explicitly accepted this tradeoff; functional on real browsers (Chrome 120, Edge 120, Firefox 120, Safari 15)
- [x] [Review][Defer] Double-delete race / no `deleteMutation.isPending` guard in keyboard handler [apps/web/src/components/TaskRow.tsx:38] — deferred, pre-existing; `handleDelete()` unchanged from Story 3.2; `animationend` fires once per animation so actual double-mutation risk is minimal
- [x] [Review][Defer] `firstDeleteAnnouncementSent` not reset between E2E test sessions [apps/web/src/data/queries.ts:37] — deferred, by design; session-scoped flag is intentional; no E2E test verifies announcement text

## Change Log

- 2026-05-01: Story 3.3 implemented — Delete/Backspace keyboard handler, LiveRegion delete announcements (first-delete Mac/non-Mac undo hint, subsequent plain), 3 unit tests, 3 Playwright e2e tests. 236 tests pass, coverage 97.33%.

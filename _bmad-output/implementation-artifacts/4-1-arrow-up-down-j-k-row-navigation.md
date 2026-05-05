# Story 4.1: Arrow Up / Down + j / k Row Navigation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a keyboard-first user,
I want to press Arrow Down (or `j`) and Arrow Up (or `k`) to move focus between tasks,
so that I can scan and operate the list without leaving the keyboard.

## Acceptance Criteria

1. **Arrow Down from TaskInput → first TaskRow** — When focus is on TaskInput and Arrow Down is pressed, focus moves to the first TaskRow in the list. If the list is empty, the press is a no-op (focus stays on TaskInput). (FR17, UX-DR12)

2. **Arrow Down / `j` from TaskRow → next row** — When focus is on a TaskRow and Arrow Down or `j` is pressed, focus moves to the next TaskRow. At the bottom of the list, the press is a no-op (focus stays on the last row). Guard: `event.target === event.currentTarget` so child-element key events don't fire row-level navigation.

3. **Arrow Up / `k` from TaskRow → previous row or TaskInput** — When focus is on a TaskRow and Arrow Up or `k` is pressed, focus moves to the previous TaskRow. At the top of the list (index 0), focus moves to TaskInput (`[aria-label="New task"]`). Guard: same `event.target === event.currentTarget` guard.

4. **Focus not disrupted by row-local state changes** — When any state change (toggle completing/uncompleting, SyncIndicator appearing or disappearing, retry-exhausted state appearing) occurs while focus is on a TaskRow, focus stays on the same row. The arrow navigation keys themselves must not trigger any toggle, delete, or sync side effects. (UX-DR13)

5. **`event.preventDefault()` on all bound keys** — Arrow Up, Arrow Down, `j`, and `k` must call `event.preventDefault()` when handled to suppress page scroll.

6. **Playwright `e2e/keyboard.spec.ts`** — The placeholder `test.describe.skip("keyboard-only navigation (Epic 4)", ...)` block is replaced with a real `test.describe("arrow navigation — Arrow Up/Down and j/k", ...)` block that:
   - Exercises Arrow Down from TaskInput → first row
   - Exercises Arrow Down / `j` traversal through the list
   - Exercises Arrow Up / `k` traversal back up
   - Asserts the at-top boundary (Arrow Up goes to TaskInput)
   - Asserts the at-bottom boundary (Arrow Down is no-op on last row)
   - Asserts the visible focus ring (2 px outline) at every step
   - All assertions without using `.click()` (keyboard-only per UX-DR12, NFR-A1)

## Tasks / Subtasks

- [x] **Task 1 — Extend `handleRowKeyDown` in `apps/web/src/components/TaskRow.tsx`** (AC: #2, #3, #4, #5)
  - [x] After the existing Delete/Backspace block in `handleRowKeyDown`, add a new block:
    ```tsx
    if (
      (event.key === "ArrowDown" || event.key === "j") &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      const allRows = Array.from(document.querySelectorAll("[data-task-id]")) as HTMLElement[];
      const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
      allRows[idx + 1]?.focus();
    }
    if (
      (event.key === "ArrowUp" || event.key === "k") &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      const allRows = Array.from(document.querySelectorAll("[data-task-id]")) as HTMLElement[];
      const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
      if (idx === 0) {
        (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
      } else {
        allRows[idx - 1]?.focus();
      }
    }
    ```
  - [x] No other changes to `TaskRow.tsx`. The `data-task-id` attribute already exists on the `<li>` element and the `handleDelete()` focus-landing logic already uses this DOM query pattern — reuse it.

- [x] **Task 2 — Extend `handleKeyDown` in `apps/web/src/components/TaskInput.tsx`** (AC: #1, #5)
  - [x] In the `handleKeyDown` function, add a new branch before or after the Escape handler:
    ```tsx
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const firstRow = document.querySelector("[data-task-id]") as HTMLElement | null;
      firstRow?.focus();
    }
    ```
  - [x] Place it after the `isComposing` guard so composition input is not interrupted.
  - [x] No other changes to `TaskInput.tsx`.

- [x] **Task 3 — Add unit tests to `apps/web/src/components/TaskRow.test.tsx`** (AC: #2, #3, #4)
  - [x] Add a new `describe("TaskRow keyboard arrow navigation")` block.
  - [x] Use `renderRowWithDeleteClient` (already exists) since it provides a proper QueryClient. Mock `patchFetch` to keep tests network-free.
  - [x] Helper: render **two** adjacent `<li>` rows inside a `<ul>` to test index-based navigation — or use `document.body.appendChild` to inject a second fake `[data-task-id]` element alongside the rendered row.
  - [x] Tests:
    - `"ArrowDown on the <li> focuses the next [data-task-id] element"` — render two rows, fire `keyDown({key: "ArrowDown"})` on first `<li>`, assert `document.activeElement` is second `<li>`.
    - `"ArrowDown on the last <li> is a no-op (stays focused)"` — render one row, fire `keyDown({key: "ArrowDown"})` on `<li>`, assert `document.activeElement` is still the `<li>`.
    - `"j key on the <li> focuses the next [data-task-id] element"` — same as ArrowDown test with `{key: "j"}`.
    - `"ArrowUp on the first <li> focuses TaskInput"` — render row, create a fake `[aria-label="New task"]` input in `document.body`, fire `keyDown({key: "ArrowUp"})`, assert `document.activeElement` is the fake input. Clean up in `afterEach`.
    - `"ArrowUp on a non-first <li> focuses the previous row"` — render two rows, focus second row, fire `keyDown({key: "ArrowUp"})`, assert focus moves to first row.
    - `"k key on the first <li> focuses TaskInput"` — same as ArrowUp-first-row with `{key: "k"}`.
    - `"Arrow keys on a child element do not fire row-level navigation"` — render row, `fireEvent.keyDown(getByRole("checkbox"), {key: "ArrowDown"})`, assert `document.activeElement` is not changed unexpectedly (event.target !== event.currentTarget guard).

- [x] **Task 4 — Add unit tests to `apps/web/src/components/TaskInput.test.tsx`** (AC: #1)
  - [x] Check if `TaskInput.test.tsx` exists. Add a new `describe("TaskInput arrow-down navigation")` block.
  - [x] Test: `"ArrowDown focuses the first [data-task-id] element when list is populated"` — render `<TaskInput>`, inject a fake `<li data-task-id="x" tabindex="0">` into `document.body`, focus input, `fireEvent.keyDown(input, {key: "ArrowDown"})`, assert `document.activeElement` is the fake `<li>`. Clean up in `afterEach`.
  - [x] Test: `"ArrowDown is a no-op when no [data-task-id] element exists"` — render `<TaskInput>`, focus input, `fireEvent.keyDown(input, {key: "ArrowDown"})`, assert `document.activeElement` is still the input (no crash, no focus loss).

- [x] **Task 5 — Update `e2e/keyboard.spec.ts`** (AC: #6)
  - [x] **Remove** the `test.describe.skip("keyboard-only navigation (Epic 4)", ...)` placeholder block entirely.
  - [x] **Add** a new `test.describe("arrow navigation — Arrow Up/Down and j/k", ...)` block with the following tests:
    - `"Arrow Down from TaskInput focuses first row"` — `page.goto("/")`, add two tasks (A, B; newest-first so B is row 0, A is row 1), focus TaskInput via `page.getByLabel("New task").focus()`, press `ArrowDown`, assert first listitem `rowB` is focused and has `outline-width: 2px`.
    - `"Arrow Down traverses down the list"` — add 3 tasks (C, B, A newest-first), focus first row (C), press `ArrowDown`, assert rowB focused; press `ArrowDown`, assert rowA focused.
    - `"j key traverses down the list"` — same as above with `page.keyboard.press("j")`.
    - `"Arrow Down on the last row is a no-op"` — add 1 task, focus first row, press `ArrowDown` twice (second should be no-op), assert still on the same row.
    - `"Arrow Up from top row returns focus to TaskInput"` — add 1 task, Tab into first row, press `ArrowUp`, assert `page.getByLabel("New task")` is focused.
    - `"k key from top row returns focus to TaskInput"` — same with `page.keyboard.press("k")`.
    - `"Arrow Up traverses up the list"` — add 2 tasks (B then A, newest-first B,A), Tab to first row (B), `ArrowDown` to rowA, `ArrowUp` back to rowB, assert rowB focused.
    - `"focus ring visible on every focused row during arrow navigation"` — add 3 tasks, Tab to first row, assert `outline-width: 2px`; `ArrowDown`, assert `outline-width: 2px` on new focused row.
    - `"state changes do not disrupt focus during navigation"` — add 2 tasks, Tab into first row, toggle via Space (AC: focus stays on row), then arrow navigate — assert navigation still works after state change.
  - [x] Each test uses `page.keyboard.press(...)` — no `.click()` calls.
  - [x] Reuse existing `addTask` and `waitForListSettled` helpers (already in the file).

- [x] **Task 6 — Quality gate verification** (AC: #4, #5)
  - [x] Run `bun run check` — oxlint ✓, oxfmt ✓, tsgo clean ✓, dep-count unchanged (web 17/25).
  - [x] Run `bun run check:full` — all tests pass (260/260), coverage 98.58%/98.01% ≥ 70%, audit clean, build clean.
  - [ ] Manual keyboard-only DoD check: open app in browser, Tab into list, navigate with arrows and j/k, verify focus ring visible at every step, no scroll, no side effects.

### Review Findings

- [x] [Review][Decision→Patch] Leaving (exit-animating) rows included in `querySelectorAll("[data-task-id]")` navigation — fixed: added `:not(.task-row--leaving)` to both querySelectorAll calls in the navigation blocks only; `handleDelete()` pattern unchanged. [TaskRow.tsx:40,49]
- [x] [Review][Patch] `idx === -1` not guarded in TaskRow.tsx — fixed: added `if (idx === -1) return;` before navigation in both ArrowDown and ArrowUp blocks. [TaskRow.tsx:43,52]
- [x] [Review][Patch] `j`/`k` handlers in TaskRow lack `isComposing` guard — fixed: added `if (event.isComposing) return;` at the top of `handleRowKeyDown`, consistent with TaskInput. [TaskRow.tsx:24]
- [x] [Review][Patch] Missing `cleanup()` in navigation `afterEach` — fixed: added `cleanup()` call to the `afterEach` in `describe("TaskRow keyboard arrow navigation")`. [TaskRow.test.tsx:478]
- [x] [Review][Defer] Story 4.4 typing-anywhere forward-compat hazard — if Story 4.4 adds a document-level keydown listener, its precedence vs. the `j`/`k` row handler is unspecified; not actionable in this story. [TaskRow.tsx:36-51] — deferred, pre-existing
- [x] [Review][Defer] `:focus-visible` programmatic focus reliability — `.focus()` calls do not reliably trigger `:focus-visible` in all browser/session states; existing design decision, not introduced here. — deferred, pre-existing
- [x] [Review][Defer] Global `document.querySelector` scoping — navigation reuses the same unscoped querySelectorAll pattern already established by `handleDelete()`; broader architectural concern, not introduced by this story. [TaskRow.tsx:38,44] — deferred, pre-existing

## Dev Notes

### What This Story Is (and Is Not)

This is a **keyboard extension story** — no new components, no new data layer, no new CSS. The entire implementation is:
1. A new `if` block in `handleRowKeyDown` in `TaskRow.tsx` (~14 lines)
2. A new `if` block in `handleKeyDown` in `TaskInput.tsx` (~4 lines)
3. New unit tests and updated Playwright spec

The existing `data-task-id` DOM-query pattern is already established in `handleDelete()`:
```ts
const allRows = Array.from(document.querySelectorAll("[data-task-id]")) as HTMLElement[];
const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
```
**Reuse this exact pattern — do not invent a different approach.**

### Current State of `handleRowKeyDown` (as of Story 3.3)

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

After this story, two new blocks are added at the bottom (after the Delete/Backspace block). No existing blocks are modified.

### Current State of `handleKeyDown` in `TaskInput.tsx`

```tsx
const handleKeyDown = (event: KeyboardEvent): void => {
  if (event.isComposing) return;
  if (event.key === "Enter") { ... }
  if (event.key === "Escape" && value() !== "") {
    setValue("");
  }
};
```

The ArrowDown handler is appended as a new `if` block after the Escape handler.

### Why `event.target === event.currentTarget` Guard

The `<li tabindex="0">` is the event.currentTarget. When the row itself is focused, `event.target === event.currentTarget`. When a child (Checkbox, DeleteButton, RetryAction) has focus and the user presses an arrow key, the event bubbles to the `<li>` but `event.target` is the child — the guard prevents row-level navigation from firing and swallowing the child's own key behavior. This is the same guard already used for Space and Delete/Backspace in this handler.

### Why `j` and `k` Are Not Lower-Cased

The epic spec says "Arrow Down or `j`" and "Arrow Up or `k`". The `j` and `k` keys are case-sensitive — `event.key === "j"` matches lowercase `j` only. Capital `J` and `K` are intentionally excluded (capital letters will trigger typing-anywhere-captures in Story 4.4).

### Focus Stability During State Changes (AC: #4)

The arrow key handlers do NOT update any Solid signals or reactive state — they only call `element.focus()`. Solid's reactivity system won't re-render the row container when a pure focus call happens. The existing tests in Stories 2.2 and 3.2 already confirm focus stays on the toggled/deleted row; this story does not add new state that could disrupt focus.

### The `keyboard.spec.ts` Placeholder Block

The current file contains:
```ts
test.describe.skip("keyboard-only navigation (Epic 4)", () => {
  test("placeholder — see Story 4.x for the real assertions", () => { ... });
});
```
This block must be **fully removed** and replaced with the real arrow navigation test suite. Do not keep the `.skip` or the placeholder test.

### Focus Ring Assertions in Playwright

The visible focus ring is confirmed in the existing `keyboard toggle` tests using:
```ts
const outlineBefore = await row.evaluate((el) => window.getComputedStyle(el).outlineWidth);
expect(outlineBefore).toBe("2px");
```
Use the same pattern for each checkpoint in the arrow navigation tests.

### `addTask` and `waitForListSettled` Helpers

Both helpers already exist in `e2e/keyboard.spec.ts`. Do not duplicate them — the test `describe` blocks share the module-level helpers.

### Dep Count Constraint

Architecture specifies web package target: 17 production / 25 total dependencies. No new `import` from packages not already in `package.json` are needed for this story.

### No New Announcement Strings

Arrow navigation is silent — no LiveRegion announcement on focus movement. This matches the design: focus movement is visual/AT-tracked by the browser's native focus mechanism, not an explicit announcement. Do not add announcement strings to `announcements.ts`.

### Project Structure Notes

- `apps/web/src/components/TaskRow.tsx` — **UPDATE** (add arrow key blocks to `handleRowKeyDown`)
- `apps/web/src/components/TaskInput.tsx` — **UPDATE** (add Arrow Down block to `handleKeyDown`)
- `apps/web/src/components/TaskRow.test.tsx` — **UPDATE** (add arrow navigation unit tests)
- `apps/web/src/components/TaskInput.test.tsx` — **UPDATE** (add arrow navigation unit test)
- `e2e/keyboard.spec.ts` — **UPDATE** (replace `.skip` placeholder, add arrow navigation E2E tests)
- All other files: **NO CHANGES**

### References

- Epic 4 Story 4.1 AC: `_bmad-output/planning-artifacts/epics.md` § Epic 4 → Story 4.1
- `data-task-id` DOM query pattern: `apps/web/src/components/TaskRow.tsx` `handleDelete()` (lines 38–47 as of post-Story-3.3 state)
- `handleRowKeyDown` Space and Delete pattern: `apps/web/src/components/TaskRow.tsx` lines 23–37
- `handleKeyDown` in TaskInput: `apps/web/src/components/TaskInput.tsx` lines 20–34
- Focus ring spec: UX design specification § Focus ring — 2px `accent.default`, 2px offset
- Keyboard shortcut table: UX design specification § UX-DR12
- Focus management rule: UX design specification § UX-DR13
- Existing Playwright helpers: `e2e/keyboard.spec.ts` lines 1–20
- Dep count constraint: architecture § NFR-M1, project-structure-boundaries.md

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added ArrowDown/j handlers to `handleRowKeyDown` in TaskRow.tsx (14 lines after Delete/Backspace block) and ArrowDown handler to `handleKeyDown` in TaskInput.tsx (4 lines after Escape handler). Reused the existing `data-task-id` DOM query pattern from `handleDelete()` exactly as specified.
- 7 new unit tests added to TaskRow.test.tsx (`describe("TaskRow keyboard arrow navigation")`): ArrowDown next, ArrowDown no-op at bottom, j next, ArrowUp to TaskInput, ArrowUp to previous, k to TaskInput, child-element guard.
- 2 new unit tests added to TaskInput.test.tsx (`describe("TaskInput arrow-down navigation")`): ArrowDown with list populated, ArrowDown no-op when empty.
- Replaced `.skip` placeholder in e2e/keyboard.spec.ts with 9 real arrow navigation tests covering all ACs.
- All 260 tests pass; coverage 98.58% funcs / 98.01% lines; lint, format, types, dep-count, audit, and build all clean.

### File List

- apps/web/src/components/TaskRow.tsx
- apps/web/src/components/TaskInput.tsx
- apps/web/src/components/TaskRow.test.tsx
- apps/web/src/components/TaskInput.test.tsx
- e2e/keyboard.spec.ts

## Change Log

- 2026-05-01: Story 4.1 implemented — added ArrowDown/j/ArrowUp/k row navigation to TaskRow and ArrowDown navigation from TaskInput; added 9 unit tests and 9 Playwright E2E tests; replaced keyboard spec placeholder.

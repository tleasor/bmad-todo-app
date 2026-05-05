# Story 4.4: Typing-Anywhere-Captures

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a keyboard-first user,
I want any printable keystroke while a task row is focused to route to the input and append the character,
so that I never silently lose a thought I started typing in the wrong place.

## Acceptance Criteria

1. **Printable char from any row element → appends to TaskInput and focuses it** — When focus is on a TaskRow container (`<li>`), Checkbox, DeleteButton, or RetryAction, pressing a printable character that is NOT one of the bound shortcuts (Space, Delete, Backspace, Escape, Tab, arrows, `i`, `j`, `k`, Cmd/Ctrl+Z) moves focus to TaskInput and appends the character to its current value. TaskInput's caret is positioned at the end. (UX-DR12)

2. **Printable char from UndoSnackbar Undo button → appends to TaskInput and focuses it** — Same behavior as AC #1 when focus is on the UndoSnackbar Undo button. (UX-DR12)

3. **Bound shortcuts are NOT intercepted by typing-anywhere** — When Space, Delete, Backspace, Escape, Tab, Shift+Tab, arrow keys, `i`, `j`, or `k` are pressed, their bound shortcut behavior wins — typing-anywhere does not fire and the key is not appended to TaskInput. Cmd/Ctrl+Z fires the undo handler (Story 3.4) regardless of focus. (UX-DR12)

4. **Modifier combinations are excluded** — Keys pressed with Ctrl, Meta (Cmd), or Alt held are NOT treated as typing-anywhere (prevents intercepting system shortcuts like Ctrl+C, Cmd+V, Alt+special chars). Shift alone is NOT excluded (so uppercase letters, `!`, `@`, etc. append correctly).

5. **Playwright `e2e/keyboard.spec.ts`** — A new `test.describe("typing-anywhere-captures", ...)` block exercises: Tab into row → `q` → focus moves to TaskInput, value is `q`; pre-filled TaskInput + `a` from row → value is `{existing}a`; number char appends; Space (bound) → toggles, does not append; `j` (bound) → navigates, does not append; printable char from UndoSnackbar Undo button appends.

## Tasks / Subtasks

- [x] **Task 1 — Add typing-anywhere block to `handleRowKeyDown` in `apps/web/src/components/TaskRow.tsx`** (AC: #1, #3, #4)
  - [x] After the existing `i` block (line ~66), add one new `if` block. Do NOT add `event.target === event.currentTarget` guard — this must fire when child elements (Checkbox, DeleteButton, RetryAction) have focus and the event bubbles to the `<li>`:
    ```tsx
    if (
      event.key.length === 1 &&
      event.key !== " " &&
      event.key !== "i" &&
      event.key !== "j" &&
      event.key !== "k" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const taskInput = document.querySelector('[aria-label="New task"]') as HTMLInputElement | null;
      if (taskInput) {
        taskInput.value = taskInput.value + event.key;
        taskInput.dispatchEvent(new Event("input", { bubbles: true }));
        taskInput.focus();
      }
    }
    ```
  - [x] The existing `if (event.isComposing) return;` at the top covers all blocks — no additional `isComposing` check needed.
  - [x] No other changes to `TaskRow.tsx`.

- [x] **Task 2 — Add typing-anywhere block to `handleUndoKeyDown` in `apps/web/src/components/UndoSnackbar.tsx`** (AC: #2, #3, #4)
  - [x] After the existing Escape/`i` if-block in `handleUndoKeyDown`, add the same typing-anywhere check:
    ```tsx
    if (
      event.key.length === 1 &&
      event.key !== " " &&
      event.key !== "i" &&
      event.key !== "j" &&
      event.key !== "k" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const taskInput = document.querySelector('[aria-label="New task"]') as HTMLInputElement | null;
      if (taskInput) {
        taskInput.value = taskInput.value + event.key;
        taskInput.dispatchEvent(new Event("input", { bubbles: true }));
        taskInput.focus();
      }
    }
    ```
  - [x] The existing `i` check (`event.key !== "i"`) in the typing-anywhere block ensures `i` pressed on the Undo button does NOT also trigger typing-anywhere (Escape/`i` fires first, focus moves, typing-anywhere condition is false for `i`). No `return` statement needed — the logic is self-exclusive.
  - [x] No other changes to `UndoSnackbar.tsx`.

- [x] **Task 3 — Add unit tests to `apps/web/src/components/TaskRow.test.tsx`** (AC: #1, #3, #4)
  - [x] Add a new `describe("TaskRow typing-anywhere-captures")` block following the `describe("TaskRow Escape and i shortcut")` block.
  - [x] Mirror the `injectFakeInput` pattern (block-scoped `let fakeInput`, `injectFakeInput()`, `afterEach` that removes it and calls `cleanup()`).
  - [x] The fake input is a plain HTML `<input aria-label="New task">` appended to `document.body`. Setting `taskInput.value` directly and dispatching `new Event("input")` updates its DOM value — verify `fakeTaskInput.value` directly after the `fireEvent.keyDown`.
  - [x] Tests using `renderRowWithDeleteClient(baseTask())`:
    - `"printable char on <li> appends to TaskInput and focuses it"` — focus `<li>`, `fireEvent.keyDown(li, { key: "a" })`, assert `document.activeElement === fakeTaskInput` AND `fakeTaskInput.value === "a"`.
    - `"printable char on DeleteButton (child) appends to TaskInput via event bubbling"` — focus the DeleteButton (`[aria-label="Delete task"]`), `fireEvent.keyDown(deleteButton, { key: "q" })`, assert focus and value.
    - `"Space on <li> does NOT append to TaskInput"` — focus `<li>`, `fireEvent.keyDown(li, { key: " " })`, assert `fakeTaskInput.value === ""`.
    - `"j on <li> does NOT append to TaskInput"` — focus `<li>`, `fireEvent.keyDown(li, { key: "j" })`, assert `fakeTaskInput.value === ""`.
    - `"Ctrl+a on <li> does NOT trigger typing-anywhere"` — focus `<li>`, `fireEvent.keyDown(li, { key: "a", ctrlKey: true })`, assert `fakeTaskInput.value === ""`.
    - `"printable char with existing value appends to end"` — `injectFakeInput()`, set `fakeTaskInput.value = "hello"`, focus `<li>`, `fireEvent.keyDown(li, { key: "!" })`, assert `fakeTaskInput.value === "hello!"`.

- [x] **Task 4 — Add unit tests to `apps/web/src/components/UndoSnackbar.test.tsx`** (AC: #2)
  - [x] Add tests inside the existing `describe("UndoSnackbar keyboard shortcuts")` block (or a new `describe("UndoSnackbar typing-anywhere-captures")` sub-block).
  - [x] Setup: `__deleteUndoMutators.setEntry(task.id, { task, index: 0, deletedAt: 1_700_000_000_001 })` before rendering, inject a fake `[aria-label="New task"]` input (removed in the block-level `afterEach`).
  - [x] Tests:
    - `"printable char on Undo button appends to TaskInput and focuses it"` — render snackbar, `getByRole("button", { name: "Undo" })`, focus it, `fireEvent.keyDown(undoButton, { key: "x" })`, assert `document.activeElement === fakeTaskInput` AND `fakeTaskInput.value === "x"`.
    - `"Space on Undo button does NOT trigger typing-anywhere"` — `fireEvent.keyDown(undoButton, { key: " " })`, assert `fakeTaskInput.value === ""`.

- [x] **Task 5 — Add E2E tests to `e2e/keyboard.spec.ts`** (AC: #5)
  - [x] Add `test.describe("typing-anywhere-captures", ...)` after the existing describe blocks. Inherit the module-level `beforeEach` that clears tasks via `request.delete("/api/tasks")`. Reuse module-level `addTask` and `waitForListSettled` helpers.
  - [x] **Test: `"printable char from row container appends to TaskInput and focuses it"`** — `goto("/")`, `waitForListSettled`, `addTask(page, "row-typing-task")`, Tab from TaskInput to first row (`getByLabel("New task").focus()`, `keyboard.press("Tab")`), assert row focused, `keyboard.press("q")`, assert `getByLabel("New task")` is focused AND `toHaveValue("q")`.
  - [x] **Test: `"printable char appends to existing TaskInput value"`** — add task, Tab to row, `getByLabel("New task").fill("draft")` → `getByLabel("New task").focus()` → Tab to row, press `"a"`, assert `toHaveValue("drafta")`.
  - [x] **Test: `"number char appends to TaskInput"`** — add task, Tab to row, press `"5"`, assert `toHaveValue("5")`.
  - [x] **Test: `"Space from row does not append (bound to toggle)"`** — add task, Tab to row, press `"Space"`, assert toggle fired (checkbox aria-checked changes), AND `getByLabel("New task")` does NOT have `"  "` as value (stays `""`).
  - [x] **Test: `"j from row does not append (bound to navigation)"`** — add 2 tasks, Tab to first row, press `"j"`, assert second row is focused (navigation fired), AND `getByLabel("New task").inputValue()` is `""`.
  - [x] **Test: `"printable char from UndoSnackbar Undo button appends to TaskInput"`** — add task, Tab to row, press `"Delete"` (row removed), `getByRole("button", { name: "Undo" }).focus()`, `expect(getByRole("button", { name: "Undo" })).toBeFocused()`, press `"t"`, assert TaskInput is focused AND `toHaveValue("t")`.

- [x] **Task 6 — Quality gate verification**
  - [x] Run `bun run check` — oxlint ✓, oxfmt ✓, tsgo clean ✓, dep-count unchanged (web 17/25).
  - [x] Run `bun run check:full` — all tests pass, coverage ≥ 70%, audit clean, build clean.

## Dev Notes

### What This Story Is (and Is Not)

This is a **keyboard shortcut story** — no new components, no CSS changes, no data layer changes, no new constants. The entire implementation is:

1. One `if` block in `handleRowKeyDown` in `TaskRow.tsx` (~10 lines)
2. One `if` block in `handleUndoKeyDown` in `UndoSnackbar.tsx` (~10 lines)
3. Unit tests in `TaskRow.test.tsx` and `UndoSnackbar.test.tsx`
4. New E2E `test.describe` block in `e2e/keyboard.spec.ts`

No new constants needed. No new imports needed. No new files. Dep count stays at web 17/25.

### Current State of `handleRowKeyDown` (post-Story-4.3, `apps/web/src/components/TaskRow.tsx` lines 23–67)

```tsx
const handleRowKeyDown = (event: KeyboardEvent): void => {
  if (event.isComposing) return;
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
  if ((event.key === "ArrowDown" || event.key === "j") && event.target === event.currentTarget) {
    // ...navigate down
  }
  if ((event.key === "ArrowUp" || event.key === "k") && event.target === event.currentTarget) {
    // ...navigate up or focus TaskInput
  }
  if (event.key === "Escape") {
    event.preventDefault();
    (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
  }
  if (event.key === "i" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
  }
  // ← ADD typing-anywhere block here
};
```

### Current State of `handleUndoKeyDown` (post-Story-4.3, `apps/web/src/components/UndoSnackbar.tsx`)

```tsx
const handleUndoKeyDown = (event: KeyboardEvent): void => {
  if (event.isComposing) return;
  if (
    event.key === "Escape" ||
    (event.key === "i" && !event.ctrlKey && !event.metaKey && !event.altKey)
  ) {
    event.preventDefault();
    (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
  }
  // ← ADD typing-anywhere block here
};
```

### Why `event.key.length === 1` Is the Right Printable-Char Test

`event.key` for single printable characters is always exactly 1 character long (letters, digits, punctuation, symbols). `event.key` for non-printable keys is a multi-char descriptor: `"Enter"`, `"Tab"`, `"Escape"`, `"Delete"`, `"Backspace"`, `"ArrowUp"`, `"F1"`, etc. This single check eliminates all non-printable keys without an exhaustive exclusion list.

Remaining exclusions needed after `key.length === 1`:
- `event.key !== " "` — Space bound to toggle
- `event.key !== "i"` — `i` bound to focus-back shortcut (Story 4.3)
- `event.key !== "j"` — `j` bound to ArrowDown navigation (Story 4.1)
- `event.key !== "k"` — `k` bound to ArrowUp navigation (Story 4.1)
- `!event.ctrlKey && !event.metaKey && !event.altKey` — system shortcut modifier combos (Ctrl+C, Cmd+V, Alt+special). Note: Shift alone is NOT excluded — uppercase letters (`A`, `Q`, etc.) and shifted symbols (`!`, `@`) must append.

### Why No `event.target === event.currentTarget` Guard for Typing-Anywhere

All Space/Delete/Arrow shortcuts guard with `event.target === event.currentTarget` to fire ONLY when the `<li>` container itself has focus (child events that bubble are ignored).

Story 4.4's AC explicitly requires typing-anywhere to fire when **child elements** (Checkbox, DeleteButton, RetryAction) have focus too. Because child `keydown` events bubble to the `<li>`, omitting the guard lets `handleRowKeyDown` handle them from any descendant element.

This is the same design as Story 4.3's Escape and `i` blocks — no `currentTarget` guard.

### How to Append to a SolidJS Controlled Input from Outside

TaskInput is a controlled SolidJS component: `value={value()}` and `onInput={(e) => setValue(e.currentTarget.value)}`. You cannot call `setValue` from outside the component.

The correct pattern:
```tsx
const taskInput = document.querySelector('[aria-label="New task"]') as HTMLInputElement | null;
if (taskInput) {
  taskInput.value = taskInput.value + event.key;  // 1. set DOM property directly
  taskInput.dispatchEvent(new Event("input", { bubbles: true })); // 2. trigger onInput
  taskInput.focus(); // 3. move focus
}
```

Why this works:
1. `taskInput.value = taskInput.value + event.key` — sets the DOM property. SolidJS does not immediately override this because the signal hasn't changed yet.
2. `dispatchEvent(new Event("input", { bubbles: true }))` — fires synchronously. SolidJS's `onInput` handler receives it: `setValue(event.currentTarget.value)` is called with `oldValue + char`. Signal updates to `oldValue + char`.
3. On the next reactive flush, SolidJS sets `taskInput.value = oldValue + char` again (idempotent — same value, no visual change).
4. `taskInput.focus()` — caret goes to end (browser default when programmatically focusing).

Caret position: Direct `value` assignment + `focus()` places the caret at the end. No `setSelectionRange` needed.

### Why `event.preventDefault()` Is Called

For `<li>` and button elements, printable keys have no browser-default behavior. `preventDefault()` is a convention marker for future-compat (e.g., if a browser ever adds default key-handling to focusable non-input elements) and mirrors the existing pattern in Escape/`i` handlers.

### Precedence Contract: Row-Level Handler Wins Over Typing-Anywhere

The typing-anywhere block is placed LAST in `handleRowKeyDown`. The existing bound shortcuts run first:

- Space: `event.key === " "` → excluded by `event.key !== " "` check ✓
- Delete/Backspace: `event.key.length > 1` → excluded by `key.length === 1` check ✓
- ArrowDown/j: `event.key.length > 1` for Arrow keys; `event.key === "j"` excluded explicitly ✓
- ArrowUp/k: same ✓
- Escape: `event.key.length === 6` → excluded by `key.length === 1` ✓
- `i`: `event.key !== "i"` explicit exclusion ✓

Because all bound shortcuts are checked before the typing-anywhere block (and typing-anywhere is last), there is no precedence conflict. This resolves the forward-compat hazard noted in `deferred-work.md` § "Deferred from: code review of 4-1".

### Unit Test Pattern: Verify `.value` on Fake Input

The existing `injectFakeInput` pattern creates `<input aria-label="New task">` without SolidJS bindings. To verify the append:

```tsx
it("printable char on <li> appends to TaskInput and focuses it", () => {
  const fakeTaskInput = injectFakeInput();
  const { container } = renderRowWithDeleteClient(baseTask());
  const li = container.querySelector("li")!;
  li.focus();
  fireEvent.keyDown(li, { key: "a" });
  expect(document.activeElement).toBe(fakeTaskInput);
  expect(fakeTaskInput.value).toBe("a");
});
```

The implementation does `taskInput.value = taskInput.value + event.key`. Since `fakeTaskInput.value` starts as `""`, after `keyDown` it becomes `"a"`. The `dispatchEvent(new Event("input"))` fires but has no handler on the fake input — that's fine, we verify `fakeTaskInput.value` directly.

For existing-value append test, set `fakeTaskInput.value = "hello"` BEFORE calling `fireEvent.keyDown`, then verify `fakeTaskInput.value === "hello!"` after.

### Unit Test: Exclusion Tests

For Space exclusion on `<li>`:
```tsx
it("Space on <li> does NOT append to TaskInput", () => {
  const fakeTaskInput = injectFakeInput();
  const { container } = renderRowWithDeleteClient(baseTask());
  const li = container.querySelector("li")!;
  li.focus();
  fireEvent.keyDown(li, { key: " " });
  expect(fakeTaskInput.value).toBe(""); // Space did not append
});
```

Note: `document.activeElement` after Space is still `li` (Space block has `target === currentTarget` guard AND firing toggle doesn't move focus in JSDOM). Don't assert `activeElement` for exclusion tests — only assert `fakeTaskInput.value === ""`.

### E2E: Space Test — Assert Toggle, Not "Input Value Empty"

In E2E, after Space from a row, the toggle fires. The Checkbox flips. Use this as proof the bound shortcut won rather than typing-anywhere:
```ts
await page.keyboard.press("Space");
await expect(row.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
await expect(page.getByLabel("New task")).not.toBeFocused(); // focus stayed on row
```

### E2E: Setup Pattern for UndoSnackbar Typing-Anywhere Test

```ts
test("printable char from UndoSnackbar Undo button appends to TaskInput", async ({ page }) => {
  await page.goto("/");
  await waitForListSettled(page);
  await addTask(page, "undo-typing-task");

  const row = page.getByRole("listitem").filter({ hasText: "undo-typing-task" });
  await page.getByLabel("New task").focus();
  await page.keyboard.press("Tab");
  await expect(row).toBeFocused();

  await page.keyboard.press("Delete");
  await expect(row).not.toBeVisible({ timeout: 2000 });

  await page.getByRole("button", { name: "Undo" }).focus();
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();

  await page.keyboard.press("t");
  await expect(page.getByLabel("New task")).toBeFocused();
  await expect(page.getByLabel("New task")).toHaveValue("t");
});
```

### Interaction with Checkbox Focus

When Checkbox (`<button type="button" role="checkbox">`) has focus and user presses a printable char like `"a"`:
1. `keydown` fires on Checkbox, bubbles to `<li>` → `handleRowKeyDown`
2. No bound shortcut matches `"a"` (none have it, Space guard fails on `"a"` anyway)
3. Typing-anywhere fires: `key.length === 1`, not in exclusion list, no modifier → appends `"a"` to TaskInput ✓

When Checkbox has focus and user presses Space:
1. Browser activates button (native click) → `onClick` → `onToggle()` fires
2. `keydown` bubbles to `<li>` → Space block has `target !== currentTarget` → does NOT fire
3. Typing-anywhere: `event.key !== " "` fails → does NOT fire ✓
Toggle is handled by the native button activation, not the row-level handler.

### Dep Count Constraint

No new packages or imports. Target: web 17 production / 25 total dependencies (unchanged from Story 4.3).

### Project Structure Notes

- `apps/web/src/components/TaskRow.tsx` — **UPDATE** (add typing-anywhere block to `handleRowKeyDown`, after the `i` block)
- `apps/web/src/components/UndoSnackbar.tsx` — **UPDATE** (add typing-anywhere block to `handleUndoKeyDown`)
- `apps/web/src/components/TaskRow.test.tsx` — **UPDATE** (add `describe("TaskRow typing-anywhere-captures")` block)
- `apps/web/src/components/UndoSnackbar.test.tsx` — **UPDATE** (add typing-anywhere test(s) to keyboard shortcuts block)
- `e2e/keyboard.spec.ts` — **UPDATE** (add `test.describe("typing-anywhere-captures", ...)` block)
- All other files: **NO CHANGES**

### References

- Epic 4 Story 4.4 AC: `_bmad-output/planning-artifacts/epics.md` § Story 4.4 (lines 1055–1077)
- UX keyboard shortcut table: `_bmad-output/planning-artifacts/epics.md` UX-DR12 (line 198–201)
- `handleRowKeyDown` current state: `apps/web/src/components/TaskRow.tsx` lines 23–67
- `handleUndoKeyDown` current state: `apps/web/src/components/UndoSnackbar.tsx` lines 12–21
- `TaskInput` controlled input pattern: `apps/web/src/components/TaskInput.tsx` lines 46–47
- `injectFakeInput` pattern: `apps/web/src/components/TaskRow.test.tsx` lines 481–488
- `renderRowWithDeleteClient` helper: `apps/web/src/components/TaskRow.test.tsx` lines 59–65
- `renderSnackbar` helper: `apps/web/src/components/UndoSnackbar.test.tsx` lines 25–35
- Typing-anywhere forward-compat hazard: `_bmad-output/implementation-artifacts/deferred-work.md` § "Deferred from: code review of 4-1"
- Story 4.3 Escape/i patterns (forward-compat note): `_bmad-output/implementation-artifacts/4-3-escape-and-i-shortcut-to-return-focus-to-taskinput.md` § "Forward-Compat: Story 4.4"
- `addTask` and `waitForListSettled` helpers: `e2e/keyboard.spec.ts` lines 4–17

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No issues encountered. Implemented exactly as specified in story tasks.

### Completion Notes List

- Added typing-anywhere `if` block (last in `handleRowKeyDown`) to `TaskRow.tsx` — fires for any single printable char not in exclusion list (space, i, j, k) and without modifier keys; appends to TaskInput DOM value, dispatches input event, and focuses.
- Added identical typing-anywhere block (last in `handleUndoKeyDown`) to `UndoSnackbar.tsx`.
- Added `describe("TaskRow typing-anywhere-captures")` block with 6 unit tests to `TaskRow.test.tsx` — printable char on `<li>`, child bubbling via DeleteButton, Space/j/Ctrl+a exclusions, existing-value append.
- Added 2 typing-anywhere tests to the `describe("UndoSnackbar keyboard shortcuts")` block in `UndoSnackbar.test.tsx` — printable char appends + focuses, Space exclusion.
- Added `test.describe("typing-anywhere-captures", ...)` block with 6 E2E tests to `e2e/keyboard.spec.ts` — printable char from row, existing value, number char, Space bound (toggle wins), j bound (navigation wins), UndoSnackbar Undo button.
- All 275 unit tests pass (0 regressions). `bun run check:full` passes — coverage 98.77%/98.03%, audit clean, build clean, dep count unchanged (web 17/25).

### File List

- `apps/web/src/components/TaskRow.tsx`
- `apps/web/src/components/UndoSnackbar.tsx`
- `apps/web/src/components/TaskRow.test.tsx`
- `apps/web/src/components/UndoSnackbar.test.tsx`
- `e2e/keyboard.spec.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-4-typing-anywhere-captures.md`

### Review Findings

- [x] [Review][Patch] Missing unit test for `k` exclusion [apps/web/src/components/TaskRow.test.tsx:hunk] — AC #3 lists `k` as a bound shortcut that must not trigger typing-anywhere. The `j` exclusion has a test; `k` does not. Add `"k on <li> does NOT append to TaskInput"` mirroring the `j` test.
- [x] [Review][Patch] No test with `shiftKey: true` for Shift-alone pass-through [apps/web/src/components/TaskRow.test.tsx:hunk] — AC #4 explicitly states Shift alone is NOT excluded. No unit test or E2E test fires a key event with `shiftKey: true` to verify the condition doesn't block it. The existing `"!"` test omits `shiftKey: true`. Add `fireEvent.keyDown(li, { key: "A", shiftKey: true })` and assert append occurs.
- [x] [Review][Defer] E2e tab order assumption fragility [e2e/keyboard.spec.ts:hunk] — deferred, pre-existing pattern shared by all keyboard E2E stories
- [x] [Review][Defer] E2e "existing value" test fragility — Tab may clear TaskInput value [e2e/keyboard.spec.ts:hunk] — deferred, tests pass in practice; latent risk if Tab handler added to TaskInput
- [x] [Review][Defer] `injectFakeInput` called per-test vs beforeEach — style inconsistency [apps/web/src/components/TaskRow.test.tsx:hunk] — deferred, matches spec-specified pattern
- [x] [Review][Defer] UndoSnackbar unit tests create fake input inline (potential duplicate DOM element) [apps/web/src/components/UndoSnackbar.test.tsx:hunk] — deferred, tests pass; verify outer beforeEach does not also inject a fake input
- [x] [Review][Defer] No test for absent TaskInput — `if (taskInput)` null guard untested [TaskRow.tsx:hunk, UndoSnackbar.tsx:hunk] — deferred, element always exists in production; out of scope
- [x] [Review][Defer] `event.key.length === 1` unreliable for multi-codepoint emoji — deferred, documented design tradeoff; out of scope for this story
- [x] [Review][Defer] No E2e modifier test (Ctrl+a) on UndoSnackbar Undo button [e2e/keyboard.spec.ts:hunk] — deferred, modifier exclusion E2e tested for row; UndoSnackbar path not required by AC #5
- [x] [Review][Defer] No unit test for `i` exclusion inside typing-anywhere describe block [apps/web/src/components/TaskRow.test.tsx:hunk] — deferred, `i` behavior covered by adjacent `Escape and i shortcut` describe block

## Change Log

- 2026-05-01: Implemented typing-anywhere-captures (Story 4.4) — added typing-anywhere `if` blocks to `handleRowKeyDown` (TaskRow.tsx) and `handleUndoKeyDown` (UndoSnackbar.tsx); added 8 unit tests (TaskRow + UndoSnackbar) and 6 E2E tests (keyboard.spec.ts). All 275 unit tests pass.
- 2026-05-01: Code review complete — 2 patch findings, 8 deferred, 18 dismissed.

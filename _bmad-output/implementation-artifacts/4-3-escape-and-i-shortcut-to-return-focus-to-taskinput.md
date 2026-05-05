# Story 4.3: Escape and `i` Shortcut to Return Focus to TaskInput

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a keyboard-first user,
I want a one-key way back to the input regardless of where I am in the list,
so that I can capture a new thought immediately without arrow-traversing back to the top.

## Acceptance Criteria

1. **Escape from any row element → TaskInput** — When focus is on a TaskRow container (`<li>`), DeleteButton, or RetryAction, pressing Escape moves focus to TaskInput. TaskInput's existing value is **preserved** — Escape on a row does NOT clear the input (Escape clears only when fired on TaskInput itself, per Story 1.6). (UX-DR12, UX-DR13)

2. **`i` shortcut from any row element → TaskInput** — When focus is on a TaskRow container, DeleteButton, or RetryAction (i.e. not TaskInput itself), pressing lowercase `i` moves focus to TaskInput **without appending the character** — the `i` is consumed as a shortcut and `event.preventDefault()` is called. (UX-DR12, WCAG 2.1.4)

3. **`i` on TaskInput types normally** — When focus is already on TaskInput, pressing `i` types `i` normally — the shortcut does not apply because the handler lives on the `<li>`, not the input. (WCAG 2.1.4 scope requirement)

4. **Escape from UndoSnackbar Undo button → TaskInput** — When focus is on the UndoSnackbar Undo button, pressing Escape moves focus to TaskInput. (UX-DR12)

5. **`i` from UndoSnackbar Undo button → TaskInput** — When focus is on the UndoSnackbar Undo button, pressing lowercase `i` moves focus to TaskInput without appending the character. (UX-DR12)

6. **Playwright `e2e/keyboard.spec.ts`** — A new `test.describe("escape and i shortcut to return focus to TaskInput", ...)` block exercises Escape and `i` from each scoped context (row container, DeleteButton, RetryAction, UndoSnackbar Undo button) and verifies the WCAG 2.1.4 scoping for `i` (types normally in TaskInput).

## Tasks / Subtasks

- [x] **Task 1 — Add Escape and `i` handlers to `handleRowKeyDown` in `apps/web/src/components/TaskRow.tsx`** (AC: #1, #2, #3)
  - [x] After the existing ArrowUp/`k` block in `handleRowKeyDown`, add two new `if` blocks. **Do NOT add the `event.target === event.currentTarget` guard** — these must fire when child elements (DeleteButton, RetryAction) have focus and the event bubbles up to the `<li>`:
    ```tsx
    if (event.key === "Escape") {
      event.preventDefault();
      (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
    }
    if (event.key === "i") {
      event.preventDefault();
      (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
    }
    ```
  - [x] The existing `if (event.isComposing) return;` at the top of `handleRowKeyDown` already covers all blocks below it — no additional `isComposing` check needed.
  - [x] No other changes to `TaskRow.tsx`.

- [x] **Task 2 — Add `onKeyDown` to Undo button in `apps/web/src/components/UndoSnackbar.tsx`** (AC: #4, #5)
  - [x] Inside `UndoSnackbar()`, add `handleUndoKeyDown` as a named constant before the `return`:
    ```tsx
    const handleUndoKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      if (event.key === "Escape" || event.key === "i") {
        event.preventDefault();
        (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
      }
    };
    ```
  - [x] Add `onKeyDown={handleUndoKeyDown}` to the existing `<button type="button" class="undo-snackbar__button">` element — no other JSX changes.

- [x] **Task 3 — Add unit tests to `apps/web/src/components/TaskRow.test.tsx`** (AC: #1, #2)
  - [x] Add a new `describe("TaskRow Escape and i shortcut")` block following the `describe("TaskRow keyboard arrow navigation")` block.
  - [x] Mirror the `injectFakeInput` pattern from the arrow navigation block — declare a block-scoped `let fakeInput: HTMLInputElement | null = null;` and define `injectFakeInput()` inside the block. Add `afterEach(() => { fakeInput?.remove(); fakeInput = null; cleanup(); });`.
  - [x] Tests using `renderRowWithDeleteClient(baseTask())`:
    - `"Escape on the <li> focuses TaskInput"` — focus `<li>`, `fireEvent.keyDown(li, { key: "Escape" })`, assert `document.activeElement === fakeTaskInput`.
    - `"i on the <li> focuses TaskInput"` — same pattern with `{ key: "i" }`.
    - `"Escape on DeleteButton (child) focuses TaskInput via event bubbling"` — get `container.querySelector('[aria-label="Delete task"]') as HTMLElement`, focus it, fire `keyDown({ key: "Escape" })`, assert `document.activeElement === fakeTaskInput`.
    - `"i on DeleteButton (child) focuses TaskInput via event bubbling"` — same with `{ key: "i" }`.

- [x] **Task 4 — Add unit tests to `apps/web/src/components/UndoSnackbar.test.tsx`** (AC: #4, #5)
  - [x] Add a `describe("UndoSnackbar keyboard shortcuts")` block.
  - [x] Call `__deleteUndoMutators.setEntry(task.id, { task, index: 0, deletedAt: 1_700_000_000_001 })` before rendering to make the snackbar visible (same pattern as existing tests in the file).
  - [x] Inject a fake `[aria-label="New task"]` input into `document.body`; remove it in a block-level `afterEach` (the top-level `afterEach` handles `cleanup()` and `__resetDeleteUndoStoreForTests()`).
  - [x] Tests:
    - `"Escape on Undo button focuses TaskInput"` — render snackbar, `getByRole("button", { name: "Undo" })`, focus it, `fireEvent.keyDown(undoButton, { key: "Escape" })`, assert `document.activeElement === fakeTaskInput`.
    - `"i on Undo button focuses TaskInput"` — same with `{ key: "i" }`.

- [x] **Task 5 — Add E2E tests to `e2e/keyboard.spec.ts`** (AC: #6)
  - [x] Add `test.describe("escape and i shortcut to return focus to TaskInput", ...)` after the existing describe blocks. Reuse module-level `addTask` and `waitForListSettled` helpers; inherit the `beforeEach` that clears tasks via `request.delete("/api/tasks")`.
  - [x] **Test: `"Escape from row container focuses TaskInput"`**
  - [x] **Test: `"i from row container focuses TaskInput without appending character"`**
  - [x] **Test: `"Escape preserves existing TaskInput value"`**
  - [x] **Test: `"Escape from DeleteButton focuses TaskInput"`**
  - [x] **Test: `"i from DeleteButton focuses TaskInput without appending character"`**
  - [x] **Test: `"Escape from RetryAction focuses TaskInput"`**
  - [x] **Test: `"Escape from UndoSnackbar Undo button focuses TaskInput"`**
  - [x] **Test: `"i in TaskInput appends i normally (shortcut scoped to row elements)"`**

- [x] **Task 6 — Quality gate verification**
  - [x] Run `bun run check` — oxlint ✓, oxfmt ✓, tsgo clean ✓, dep-count unchanged (web 17/25).
  - [x] Run `bun run check:full` — all tests pass (266/266), coverage 98.58%/98.01% ≥ 70%, audit clean, build clean.

## Dev Notes

### What This Story Is (and Is Not)

This is a **keyboard shortcut story** — no new components, no CSS changes, no data layer changes. The entire implementation is:

1. Two new `if` blocks in `handleRowKeyDown` in `TaskRow.tsx` (~10 lines)
2. One `handleUndoKeyDown` constant + `onKeyDown` attribute in `UndoSnackbar.tsx` (~8 lines)
3. Unit tests in `TaskRow.test.tsx` and `UndoSnackbar.test.tsx`
4. New E2E `test.describe` block in `e2e/keyboard.spec.ts`

### Current State of `handleRowKeyDown` (post-Story-4.1, `apps/web/src/components/TaskRow.tsx` lines 23–59)

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
    event.preventDefault();
    const allRows = Array.from(
      document.querySelectorAll("[data-task-id]:not(.task-row--leaving)"),
    ) as HTMLElement[];
    const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
    if (idx === -1) return;
    allRows[idx + 1]?.focus();
  }
  if ((event.key === "ArrowUp" || event.key === "k") && event.target === event.currentTarget) {
    event.preventDefault();
    const allRows = Array.from(
      document.querySelectorAll("[data-task-id]:not(.task-row--leaving)"),
    ) as HTMLElement[];
    const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
    if (idx === -1) return;
    if (idx === 0) {
      (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
    } else {
      allRows[idx - 1]?.focus();
    }
  }
  // ← ADD Escape and i blocks here
};
```

Add the two new blocks after the ArrowUp/`k` block. No existing blocks are modified.

### Why No `event.target === event.currentTarget` Guard for Escape and `i`

All existing row key handlers guard with `event.target === event.currentTarget`. This restricts them to fire only when the `<li>` row container itself has focus — child events that bubble up are ignored.

Story 4.3's AC explicitly requires Escape and `i` to fire when **child elements** (DeleteButton, RetryAction) have focus too. Because child `keydown` events bubble to the `<li>`, omitting the guard lets `handleRowKeyDown` handle them from any descendant element.

The Checkbox is also a descendant. Pressing Escape or `i` on a focused Checkbox will also route to TaskInput. This is acceptable — the Checkbox has no native Escape or `i` behavior, and returning to TaskInput from anywhere in the row is the correct UX.

Contrast with `j`/`k` (arrow aliases): those have `target === currentTarget` to prevent child elements from accidentally triggering list navigation while the user intends a different action (e.g., tabbing through Checkbox → something else).

### Why Escape Does NOT Clear TaskInput's Value

TaskInput's `handleKeyDown` (`apps/web/src/components/TaskInput.tsx` lines 29–31) has:
```tsx
if (event.key === "Escape" && value() !== "") {
  setValue("");
}
```
This only fires when Escape targets the `<input>` element itself. The sequence when Escape is pressed on a row element:
1. `keydown` fires on the row element (or child).
2. Our handler calls `event.preventDefault()` + `.focus()` on TaskInput.
3. `keyup` fires on the row element — **not on TaskInput**.
4. No second `keydown` event fires on TaskInput for this keypress.

TaskInput's Escape handler never triggers. The value is preserved exactly as AC #1 requires.

### Current State of `UndoSnackbar.tsx`

```tsx
export function UndoSnackbar(): JSX.Element {
  const handleUndo = useUndoAll();
  const count = createMemo(
    () => Object.values(deleteUndoStoreEntries).filter((e) => e !== undefined).length,
  );

  return (
    <Show when={count() > 0}>
      <div role="status" aria-live="polite" class="undo-snackbar">
        <span>{count() === 1 ? "Task deleted" : `${count()} tasks deleted`}</span>
        <button type="button" class="undo-snackbar__button" onClick={handleUndo}>
          Undo
        </button>
      </div>
    </Show>
  );
}
```

Add `handleUndoKeyDown` as a `const` inside the function (before the `return`) and add `onKeyDown={handleUndoKeyDown}` to the button. No other changes.

### Why `event.isComposing` Check on UndoSnackbar

The UndoSnackbar button is a focusable element; IME composition events can bubble through it. The `isComposing` guard is consistent with `handleRowKeyDown` and prevents accidental focus routing during CJK input.

### `i` Key Does Not Append to TaskInput

`event.preventDefault()` is called before `.focus()`. For a `<li>` or `<button>`, the `i` key has no default action — `preventDefault` is a forward-compat and convention signal. The critical guarantee is that no `input` event fires on TaskInput from this keypress:

- `keydown` fires on the row element → our handler runs → `.focus()` called on TaskInput
- `keypress`/`keyup` fire on the row element (still the original target) — not on TaskInput
- No `input` event fires on TaskInput

The character never enters the input. Story 4.4 must also explicitly **exclude** `i`, `j`, `k` from its typing-anywhere handler (see Forward-Compat note below).

### Unit Test Pattern: Reuse Story 4.1's `injectFakeInput`

The `describe("TaskRow keyboard arrow navigation")` block (`apps/web/src/components/TaskRow.test.tsx` lines ~452–544) established the `injectFakeInput` and `renderRowWithDeleteClient` pattern. Mirror it exactly:

```tsx
describe("TaskRow Escape and i shortcut", () => {
  let fakeInput: HTMLInputElement | null = null;

  afterEach(() => {
    fakeInput?.remove();
    fakeInput = null;
    cleanup();
  });

  const injectFakeInput = (): HTMLInputElement => {
    const el = document.createElement("input");
    el.setAttribute("aria-label", "New task");
    el.setAttribute("tabindex", "0");
    document.body.appendChild(el);
    fakeInput = el;
    return el;
  };

  it("Escape on the <li> focuses TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "Escape" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });
  // ...
});
```

`renderRowWithDeleteClient` mocks `deleteFetch` to prevent accidental network calls. `renderRow` / `renderRowWithClient` (patchFetch mock) are equally valid; use `renderRowWithDeleteClient` for consistency with the arrow-navigation tests which needed a delete-capable setup.

### Unit Test for DeleteButton Bubbling

The Escape/`i` tests on DeleteButton rely on event bubbling from the button to the `<li>`. `@testing-library/dom`'s `fireEvent.keyDown` dispatches with `bubbles: true`, so:

```tsx
it("Escape on DeleteButton (child) focuses TaskInput via event bubbling", () => {
  const fakeTaskInput = injectFakeInput();
  const { container } = renderRowWithDeleteClient(baseTask());
  const deleteButton = container.querySelector('[aria-label="Delete task"]') as HTMLElement;
  deleteButton.focus();
  fireEvent.keyDown(deleteButton, { key: "Escape" });
  expect(document.activeElement).toBe(fakeTaskInput);
});
```

The event fires on `deleteButton`, bubbles to `<li>`, `handleRowKeyDown` fires (no `target === currentTarget` guard for Escape), and `document.querySelector('[aria-label="New task"]').focus()` is called — which in the test environment is the injected fake input.

### UndoSnackbar Unit Test Setup

The snackbar renders only when `deleteUndoStore` has entries. `__deleteUndoMutators` and `makeTask` are already in scope in `UndoSnackbar.test.tsx`. The top-level `afterEach` calls `__resetDeleteUndoStoreForTests()` and `cleanup()` — only add the fake input removal to a block-level `afterEach`:

```tsx
describe("UndoSnackbar keyboard shortcuts", () => {
  let fakeInput: HTMLInputElement | null = null;

  afterEach(() => {
    fakeInput?.remove();
    fakeInput = null;
  });

  it("Escape on Undo button focuses TaskInput", () => {
    const task = makeTask();
    __deleteUndoMutators.setEntry(task.id, { task, index: 0, deletedAt: 1_700_000_000_001 });
    const el = document.createElement("input");
    el.setAttribute("aria-label", "New task");
    document.body.appendChild(el);
    fakeInput = el;

    const { getByRole } = renderSnackbar();
    const undoButton = getByRole("button", { name: "Undo" });
    undoButton.focus();
    fireEvent.keyDown(undoButton, { key: "Escape" });
    expect(document.activeElement).toBe(fakeInput);
  });
  // ...
});
```

### E2E: Triggering Retry-Exhausted State

Reuse the exact route-mock pattern from `e2e/error-recovery.spec.ts` (also used in Story 4.2's retry-exhausted Tab test):

```ts
await page.route("**/api/tasks", async (route) => {
  if (route.request().method() === "POST") {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "validation_error", message: "test-induced" },
        requestId: "test",
      }),
    });
    return;
  }
  await route.continue();
});
const text = `esc-retry-${Date.now()}`;
await page.getByLabel("New task").fill(text);
await page.getByLabel("New task").press("Enter");
const row = page.getByRole("listitem").filter({ hasText: text });
await expect(row.getByRole("button", { name: "Retry" })).toBeVisible();
await page.unroute("**/api/tasks");
```

A 400 response causes immediate exhaustion (no retries for 4xx). Tab order in the exhausted row: `<li>` container → Checkbox → RetryAction → DeleteButton.

### E2E: Focusing the UndoSnackbar Undo Button

After deleting a task via the keyboard, the Undo button appears. Use direct programmatic focus rather than Tab-traversal (the button's DOM position relative to the current focus context can vary):

```ts
await page.getByRole("button", { name: "Undo" }).focus();
await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();
```

### E2E: Verifying `i` Does Not Append

The test that `i` does NOT append when pressed on a row element:

```ts
test("i from row container focuses TaskInput without appending character", async ({ page }) => {
  await page.goto("/");
  await waitForListSettled(page);
  await addTask(page, "i-shortcut-task");

  // Type "draft" into input without submitting, then Tab to row
  await page.getByLabel("New task").fill("draft");
  await page.keyboard.press("Tab"); // → row container
  const row = page.getByRole("listitem").filter({ hasText: "i-shortcut-task" });
  await expect(row).toBeFocused();

  await page.keyboard.press("i");
  await expect(page.getByLabel("New task")).toBeFocused();
  await expect(page.getByLabel("New task")).toHaveValue("draft"); // "i" was consumed, not appended
});
```

### Forward-Compat: Story 4.4 Typing-Anywhere-Captures

Story 4.4 will add a handler for printable characters that routes to TaskInput and appends the character. Per the epic spec (UX-DR12): "`i`, `j`, `k` keys do NOT trigger typing-anywhere — their bound shortcut behavior wins."

Story 4.4 must explicitly exclude `i`, `j`, `k` from its typing-anywhere handler. The `event.preventDefault()` called here is a convention marker but the real exclusion must be written in Story 4.4.

Referenced from `_bmad-output/implementation-artifacts/deferred-work.md` § "Deferred from: code review of 4-1" — Story 4.4 typing-anywhere forward-compat hazard.

### Dep Count Constraint

No new packages or imports. Architecture target: web 17 production / 25 total dependencies.

### Project Structure Notes

- `apps/web/src/components/TaskRow.tsx` — **UPDATE** (add Escape and `i` blocks to `handleRowKeyDown`)
- `apps/web/src/components/UndoSnackbar.tsx` — **UPDATE** (add `handleUndoKeyDown` + `onKeyDown` to Undo button)
- `apps/web/src/components/TaskRow.test.tsx` — **UPDATE** (add `describe("TaskRow Escape and i shortcut")` block)
- `apps/web/src/components/UndoSnackbar.test.tsx` — **UPDATE** (add `describe("UndoSnackbar keyboard shortcuts")` block)
- `e2e/keyboard.spec.ts` — **UPDATE** (add `test.describe("escape and i shortcut to return focus to TaskInput", ...)` block)
- All other files: **NO CHANGES**

### References

- Epic 4 Story 4.3 AC: `_bmad-output/planning-artifacts/epics.md` § Story 4.3 (lines 1031–1054)
- UX keyboard shortcut table: `_bmad-output/planning-artifacts/epics.md` UX-DR12 (line 198)
- Focus management rules: `_bmad-output/planning-artifacts/epics.md` UX-DR13 (line 203)
- `handleRowKeyDown` current state: `apps/web/src/components/TaskRow.tsx` lines 23–59
- `TaskInput` Escape handler: `apps/web/src/components/TaskInput.tsx` lines 29–31
- `UndoSnackbar` current state: `apps/web/src/components/UndoSnackbar.tsx`
- `injectFakeInput` pattern: `apps/web/src/components/TaskRow.test.tsx` lines 481–487
- `renderRowWithDeleteClient` helper: `apps/web/src/components/TaskRow.test.tsx` lines 59–64
- Retry-exhausted route mock: `e2e/error-recovery.spec.ts` lines 48–61 (also Story 4.2 task file)
- `addTask` and `waitForListSettled` helpers: `e2e/keyboard.spec.ts` lines 12–17
- Forward-compat hazard note: `_bmad-output/implementation-artifacts/deferred-work.md` § "Deferred from: code review of 4-1"
- Story 4.2 retry-exhausted Tab test: `e2e/keyboard.spec.ts` lines 242–303

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added Escape and `i` key blocks to `handleRowKeyDown` in TaskRow.tsx (no `target === currentTarget` guard, so they fire from child elements via bubbling).
- Added `handleUndoKeyDown` with `isComposing` guard + Escape/`i` handling to UndoSnackbar.tsx; wired via `onKeyDown` on the Undo button.
- Added `describe("TaskRow Escape and i shortcut")` block with 4 unit tests (li and DeleteButton, both keys) mirroring the arrow navigation `injectFakeInput` pattern.
- Added `describe("UndoSnackbar keyboard shortcuts")` block with 2 unit tests (Escape and `i` on Undo button).
- Added `test.describe("escape and i shortcut to return focus to TaskInput")` E2E block with 8 tests covering all AC contexts plus WCAG 2.1.4 scoping.
- All 266 tests pass; coverage 98.58%/98.01%; dep count web 17/25 unchanged.

### File List

- apps/web/src/components/TaskRow.tsx
- apps/web/src/components/UndoSnackbar.tsx
- apps/web/src/components/TaskRow.test.tsx
- apps/web/src/components/UndoSnackbar.test.tsx
- e2e/keyboard.spec.ts

## Review Findings

- [x] [Review][Decision] `i` shortcut fires with modifier keys (Ctrl+i, Alt+i, Meta+i) — Applied: added `!event.ctrlKey && !event.metaKey && !event.altKey` guard to the `i` block in `TaskRow.tsx` and `UndoSnackbar.tsx`.

- [x] [Review][Patch] Missing E2E test: `i` from UndoSnackbar Undo button (AC #5) [e2e/keyboard.spec.ts]
- [x] [Review][Patch] Missing E2E test: `i` from RetryAction focuses TaskInput without appending character (AC #2, AC #6) [e2e/keyboard.spec.ts]
- [x] [Review][Patch] Missing unit test: `i` on RetryAction child via event bubbling (AC #2) [apps/web/src/components/TaskRow.test.tsx]
- [x] [Review][Patch] `UndoSnackbar keyboard shortcuts` `afterEach` missing `cleanup()` call — risks DOM leakage between tests [apps/web/src/components/UndoSnackbar.test.tsx]

- [x] [Review][Defer] Duplicate `document.querySelector('[aria-label="New task"]')` hardcoded in 3 locations across TaskRow.tsx and UndoSnackbar.tsx — deferred, pre-existing pattern
- [x] [Review][Defer] `Escape`/`i` handlers have no guard for open modal/dialog elsewhere on the page — deferred, no modals exist yet
- [x] [Review][Defer] `i` shortcut fires in any future text-input child of `<li>` (speculative inline-edit concern) — deferred, no such child exists today
- [x] [Review][Defer] Double Escape collision: second `Escape` on TaskInput clears draft after focus returns — deferred, separate user gesture and value-preservation test covers the first press
- [x] [Review][Defer] RetryAction `Escape`/`i` relies on implicit event bubbling — no explicit handler like UndoSnackbar; E2E covers regression — deferred, fragility is acceptable
- [x] [Review][Defer] E2E RetryAction test: `page.unroute` called without awaiting row stabilization — minor timing assumption — deferred
- [x] [Review][Defer] No unit test asserting `event.preventDefault()` was called for `i`/`Escape` — deferred, nitpick; E2E covers the functional guarantee

## Change Log

- 2026-05-01: Story 4.3 implemented — Escape and `i` shortcuts to return focus to TaskInput from row elements and UndoSnackbar Undo button. 6 unit tests + 8 E2E tests added. All 266 tests pass.

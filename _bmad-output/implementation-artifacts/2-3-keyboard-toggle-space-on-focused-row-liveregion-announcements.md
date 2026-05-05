# Story 2.3: Keyboard Toggle — Space on Focused Row + LiveRegion Announcements

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a keyboard-first user,
I want to press Space on a focused task row to toggle its completion,
so that I never have to leave the keyboard to mark something done.

## Acceptance Criteria

1. **Space on the row container toggles completion** — When the `<li tabindex="0">` itself has focus (not a child element), pressing Space calls `toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed })`. Page scroll is suppressed via `event.preventDefault()`. Mutation is not fired if `toggleMutation.isPending` (same disabled guard as the Checkbox). (FR15)

2. **Checkbox Space does NOT double-fire the row handler** — When the Checkbox `<button>` has focus and Space is pressed, the browser fires a native `click` on the button (standard button behavior), which calls `onToggle()` → `toggleMutation.mutate(...)`. The row-level `onKeyDown` handler must NOT also fire. Prevention: the `<li>` handler checks `event.target === event.currentTarget` — when the Checkbox is focused, `event.target` is the Checkbox, not the `<li>`.

3. **Focus ring stays on the toggled row** — Focus is not disrupted by the toggle. The `<li>` retains `:focus-visible` styling (2 px accent outline — already in CSS) throughout the optimistic window. (UX-DR13)

4. **Row position does not change** — Same as click-toggle: `.map()` updater in `useToggleTask.onMutate` preserves array order. No re-sort. (FR9)

5. **LiveRegion announcements — nothing to add** — `useToggleTask` in `queries.ts` already handles all three transitions: `"Saving…"` (pending after `SYNC_PENDING_DELAY_MS`), `"Saved"` (on success if was pending), `"Couldn't save — check connection."` (on error). These fire identically for keyboard- and click-triggered toggles. No new announcement strings. Rapid-toggle spam is prevented by the existing `!wasAlreadyPending` guard in `onMutate`'s timer closure. (FR22)

6. **`bun run check` passes** — oxlint, oxfmt, tsgo `-b --noEmit`, dep-count unchanged (root 6/25, web 17/25, api 2/25). No new dependencies.

7. **`bun run check:full` passes** — All 217+ tests pass (no regressions), coverage ≥ 70%, audit clean, build clean.

8. **`e2e/manage.spec.ts`** — Add one keyboard-toggle test inside the existing `"manage tasks — toggle"` describe: Tab from TaskInput to the first row, press Space, assert `aria-checked` flips — no `.click()` used.

9. **`e2e/keyboard.spec.ts`** — Add a new `test.describe("keyboard toggle — Space on focused row")` block alongside (NOT replacing) the existing Epic 4 skip stub. Tests: Tab into list → Space toggles → focus remains on row; visible focus ring at every checkpoint; axe-core zero critical violations on toggled row.

## Tasks / Subtasks

- [x] **Task 1 — Add `onKeyDown` to `<li>` in `apps/web/src/components/TaskRow.tsx`** (AC: #1, #2, #3, #4)
  - [x] Add `handleRowKeyDown` function inside the `TaskRow` component body (after `toggleMutation` declaration)
  - [x] Handler: fires only when `event.key === " "` AND `event.target === event.currentTarget`
  - [x] Call `event.preventDefault()` to suppress page scroll
  - [x] Guard with `if (toggleMutation.isPending) return;`
  - [x] Call `toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed })`
  - [x] Attach `onKeyDown={handleRowKeyDown}` to the `<li>` element

- [x] **Task 2 — Add keyboard Space tests to `apps/web/src/components/TaskRow.test.tsx`** (AC: #1, #2)
  - [x] Add `describe("TaskRow keyboard Space handler")` block
  - [x] Test: `"Space on the <li> container calls patchFetch"` — `renderRowWithClient`, get `<li>` via `container.querySelector("li")`, `fireEvent.keyDown(li, { key: " " })`, `await` one tick, assert `patchFetch` called with correct args
  - [x] Test: `"Space on the Checkbox button does not invoke the row-level handler"` — `renderRowWithClient`, `fireEvent.keyDown(getByRole("checkbox"), { key: " " })`, await one tick, assert `patchFetch` NOT called
  - [x] Test: `"Space on the <li> calls event.preventDefault"` — spy on `preventDefault`, fire Space on `<li>`, assert called

- [x] **Task 3 — Update `e2e/manage.spec.ts`** (AC: #8)
  - [x] Inside existing `test.describe("manage tasks — toggle")`, add: `"Space on a focused row toggles completion without .click()"`
  - [x] `addTask(page, text)` → Tab from input to first row → `page.keyboard.press("Space")` → assert `aria-checked` flipped → assert focus still on the row

- [x] **Task 4 — Update `e2e/keyboard.spec.ts`** (AC: #9)
  - [x] **DO NOT** remove or modify `test.describe.skip("keyboard-only navigation (Epic 4)", ...)` — that stub belongs to Epic 4
  - [x] Add `test.describe("keyboard toggle — Space on focused row")` alongside it with:
    - [x] `"Tab into list, Space toggles, focus stays on row"`: add task, Tab from input to first row, press Space, assert `aria-checked` true, assert `document.activeElement === row` via `page.evaluate`
    - [x] `"axe-core reports no critical violations after keyboard Space toggle"`: after Space toggle, run `new AxeBuilder({ page }).include(".task-row--completed").analyze()`, filter `impact === "critical" || "serious"`, expect empty

- [x] **Task 5 — Quality gate verification** (AC: #6, #7)
  - [x] Run `bun run check` — expect: oxlint ✓, oxfmt ✓, tsgo -b --noEmit ✓, dep-count root 6/25 web 17/25 api 2/25 ✓
  - [x] Run `bun run check:full` — expect: all tests pass, coverage ≥ 70%, audit clean, build clean

## Dev Notes

### What This Story Is (and Is Not)

**This is a surgical two-line production change.** Everything that drives the toggle — `useToggleTask`, `toggleSyncStore`, LiveRegion, CSS, retry logic — is already fully implemented in Story 2.2. The only new production code is adding `onKeyDown={handleRowKeyDown}` to the `<li>` in `TaskRow.tsx` and the 5-line handler function body.

The bulk of this story is tests and Playwright specs.

### The Exact `TaskRow.tsx` Change

Current `<li>` (line 19–49):
```tsx
return (
  <li
    tabindex="0"
    class="task-row flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle"
    classList={{...}}
  >
```

After change:
```tsx
const handleRowKeyDown = (event: KeyboardEvent): void => {
  if (event.key === " " && event.target === event.currentTarget) {
    event.preventDefault();
    if (toggleMutation.isPending) return;
    toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed });
  }
};

return (
  <li
    tabindex="0"
    onKeyDown={handleRowKeyDown}
    class="task-row flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle"
    classList={{...}}
  >
```

Place `handleRowKeyDown` immediately after the `toggleMutation` declaration on line 17.

**SolidJS convention:** `onKeyDown` (camelCase) is correct. Never `onkeydown`.

**Return type:** `void` — explicit return types on all exported functions required (oxlint). `handleRowKeyDown` is not exported, but still add `: void` to match project style.

### Double-Fire Prevention — How It Works

When the `<li>` itself is focused and Space is pressed:
- `event.target` = `<li>` = `event.currentTarget` → `true` → handler fires, `mutate()` called

When the Checkbox `<button>` inside the row is focused and Space is pressed:
- In a real browser: browser fires `click` on the button natively → `onClick` → `onToggle()` → `mutate()`
- `event.target` = Checkbox button (the direct target) — this bubbles up to `<li>`
- On the `<li>`: `event.target` = Checkbox ≠ `event.currentTarget` (the `<li>`) → `false` → row handler does NOT fire
- No double-fire. ✓

When the DeleteButton `<button>` is focused and Space is pressed:
- Same mechanism — `event.target` = DeleteButton ≠ `<li>` → row handler skips
- Browser would also fire native click on the button (currently a no-op — no `onClick` wired in Story 2.3)

### Unit Test Mechanics: happy-dom vs. Real Browser

**Critical difference:** In unit tests using `@solidjs/testing-library` + happy-dom, `fireEvent.keyDown(button, { key: " " })` does NOT automatically fire a `click` event on the button. This is browser-only behavior that happy-dom doesn't replicate.

Implication for tests:
- To test row-level handler fires: `fireEvent.keyDown(li, { key: " " })` — `event.target` = `<li>` → handler fires → `patchFetch` called ✓
- To test double-fire prevention: `fireEvent.keyDown(checkbox, { key: " " })` — bubbles to `<li>` with `event.target` = checkbox → handler skips → `patchFetch` NOT called ✓
- happy-dom won't fire the checkbox's own native click, so `patchFetch` is 0 calls after this test (not 1)

**Getting the `<li>` in tests:**
```tsx
const { container, getByRole } = renderRowWithClient(baseTask());
const li = container.querySelector("li")!; // non-null assertion in test files is allowed
const checkbox = getByRole("checkbox");
```

**Checking `patchFetch` was called with correct args:**
```tsx
// renderRowWithClient mocks _tasksApiSeams.patchFetch with a never-resolving mock
fireEvent.keyDown(li, { key: " " });
await new Promise((resolve) => setTimeout(resolve, 0)); // yield to TanStack Query
expect(_tasksApiSeams.patchFetch).toHaveBeenCalledTimes(1);
expect(_tasksApiSeams.patchFetch).toHaveBeenCalledWith(
  "0193f000-0000-7000-8000-000000000000",
  { completed: true }, // baseTask() has completed: false, so toggle → true
);
```

**`patchFetch` mock pattern** — `renderRowWithClient` already does this (from `TaskRow.test.tsx:49-53`):
```tsx
_tasksApiSeams.patchFetch = mock(
  (): Promise<TasksPatchResponse> => new Promise<TasksPatchResponse>(() => undefined),
);
```
The mock is a `bun:test` `mock()` object. Check calls via `mock.mock.calls.length` or use the `toHaveBeenCalledTimes` matcher if available. `bun:test`'s `mock` supports `.mock.calls` — check with `expect(_tasksApiSeams.patchFetch.mock.calls).toHaveLength(1)`.

**`preventDefault` spy:**
```tsx
const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
const preventDefaultSpy = mock(() => undefined);
Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy });
li.dispatchEvent(event);
expect(preventDefaultSpy.mock.calls).toHaveLength(1);
```
Or use `fireEvent.keyDown` and check the return value (returns false if prevented). Simpler approach: skip the `preventDefault` unit test since it's trivially verified by the E2E not-scrolling behavior.

### E2E: Tab Navigation from TaskInput to TaskRow

The `<li tabindex="0">` is the next focusable element after `TaskInput` in the natural Tab order. After adding a task:
```ts
await page.getByLabel("New task").focus();
await page.keyboard.press("Tab"); // focus moves to first row's <li>
await page.keyboard.press("Space");
```

Note: Tab might go through CharacterCounter or other focusable elements if any exist above the list. In current state, `TaskInput`'s input → Tab → first `<li>` in `TaskList` is the expected path (no intermediate focusables between input and list in the current `App.tsx` structure).

If Tab lands on an intermediate element, use `page.locator(".task-row").first().focus()` instead to directly focus the row.

**Verify focus stays on row after Space:**
```ts
const rowLocator = page.getByRole("listitem").filter({ hasText: text });
const isFocused = await page.evaluate((row) => document.activeElement === row, await rowLocator.elementHandle());
expect(isFocused).toBe(true);
```

### E2E: `keyboard.spec.ts` Structure After This Story

```ts
// Keep existing Epic 4 stub UNCHANGED:
test.describe.skip("keyboard-only navigation (Epic 4)", () => {
  test("placeholder — see Story 4.x for the real assertions", () => { ... });
});

// Add NEW describe block:
test.describe("keyboard toggle — Space on focused row", () => {
  test("Tab into list, Space toggles, focus stays on row", async ({ page }) => { ... });
  test("axe-core reports no critical violations after keyboard Space toggle", async ({ page }) => { ... });
});
```

### LiveRegion — Confirmed No Changes Needed

`queries.ts` `useToggleTask.onMutate` timer closure:
```ts
// Already in queries.ts (line 110-116):
const timer = setTimeout(() => {
  if (pendingToggleTimers.get(input.id) === timer) {
    const wasAlreadyPending = __toggleSyncStorePeek(input.id)?.status === "pending";
    __toggleSyncMutators.markPending(input.id, retry);
    if (!wasAlreadyPending) announce(LIVE_REGION_SAVING);
  }
}, SYNC_PENDING_DELAY_MS);
```

The `!wasAlreadyPending` guard prevents announcement spam on rapid Space-mash. This is identical behavior to click-toggle. No changes needed.

### Files Being Modified — Current State

**`apps/web/src/components/TaskRow.tsx`** (142 lines, fully current from Story 2.2):
- `<li tabindex="0">` at line 21 — add `onKeyDown={handleRowKeyDown}`
- `toggleMutation` declared at line 17 — add `handleRowKeyDown` after it
- `Checkbox` has `disabled={toggleMutation.isPending}` — row handler must also guard on `isPending`
- Everything else unchanged

**`apps/web/src/components/TaskRow.test.tsx`** (325 lines):
- Has `describe("TaskRow")`, `describe("TaskRow completed state")`, `describe("TaskRow sync states")`, `describe("TaskRow.css contract")` blocks
- `renderRowWithClient` helper already mocks `patchFetch` (line 49-53) — reuse for Space handler tests
- Add new `describe("TaskRow keyboard Space handler")` block

**`e2e/manage.spec.ts`** (99 lines):
- `describe("manage tasks — toggle")` block exists with 4 tests
- Add 5th test for Space-based toggle

**`e2e/keyboard.spec.ts`** (10 lines):
- Single `test.describe.skip("keyboard-only navigation (Epic 4)", ...)` block
- Add new describe block alongside it; keep the skip

### Patterns to Follow

- `onKeyDown` (camelCase SolidJS prop) — see `TaskInput.tsx:19` for the established pattern
- `event.isComposing` check: NOT needed here — Space in IME composition does not apply to row-level navigation
- Named exports only; explicit return types on exported functions (oxlint)
- No `console.log` in production code
- bun:test idiom: `describe` + `it` (not `test`) for unit tests; `test` is correct for Playwright specs

### Project Structure Notes

- All changes within existing files — no new files
- Sub-components stay co-located in `TaskRow.tsx` per architecture convention
- `keyboard.spec.ts` grows from stub to real spec as designed in the architecture's five-spec NFR-M2 inventory

### References

- Story 2.2 completed file: `_bmad-output/implementation-artifacts/2-2-frontend-toggle-checkbox-sub-component-optimistic-mutation-completed-visual-treatment.md` — full `useToggleTask`, `TaskRow.tsx` current state
- Epic 2, Story 2.3: `_bmad-output/planning-artifacts/epics.md` lines 809–838
- Keyboard shortcut spec (UX-DR12): `_bmad-output/planning-artifacts/ux-design-specification.md`
- Implementation patterns (SolidJS, onKeyDown, test conventions): `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md`
- TaskInput.tsx keyboard handler pattern: `apps/web/src/components/TaskInput.tsx:19-32`
- TaskRow.tsx current state: `apps/web/src/components/TaskRow.tsx`
- TaskRow.test.tsx current state (renderRowWithClient, patchFetch mock): `apps/web/src/components/TaskRow.test.tsx`

### Review Findings

- [x] [Review][Patch] Missing explicit focus ring assertion — AC9 requires "visible focus ring at every checkpoint" test; neither new E2E test asserts `:focus-visible` styling or runs axe before the toggle [e2e/keyboard.spec.ts]
- [x] [Review][Patch] `keyboard.spec.ts` missing `waitForListSettled` before `addTask` — inconsistent with `manage.spec.ts` pattern; pre-existing backend tasks could load after `addTask` resolves, shifting Tab order [e2e/keyboard.spec.ts:22-24]
- [x] [Review][Patch] Replace deprecated `elementHandle()` + `page.evaluate` focus assertion with `expect(row).toBeFocused()` in both E2E specs [e2e/keyboard.spec.ts:38-40, e2e/manage.spec.ts:100-102]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Surgical two-line production change as designed: added `handleRowKeyDown` after `toggleMutation` in `TaskRow.tsx` and wired `onKeyDown={handleRowKeyDown}` to the `<li>`. Double-fire prevention via `event.target === event.currentTarget` guard confirmed working in unit tests. TypeScript required explicit parameter types on mock functions to infer `mock.calls` tuple correctly — used `(_id: string, _body: TasksPatchBody)` signature. All 224 unit tests pass (was 217, +7 new). `bun run check:full` passes: lint ✓, fmt ✓, types ✓, dep-count ✓, coverage 98%/97% ✓, audit ✓, build ✓. Playwright specs added to both `manage.spec.ts` and `keyboard.spec.ts` without removing Epic 4 skip stub.

### File List

apps/web/src/components/TaskRow.tsx
apps/web/src/components/TaskRow.test.tsx
e2e/manage.spec.ts
e2e/keyboard.spec.ts
_bmad-output/implementation-artifacts/sprint-status.yaml
_bmad-output/implementation-artifacts/2-3-keyboard-toggle-space-on-focused-row-liveregion-announcements.md

## Change Log

- 2026-05-01: Implemented Space keyboard toggle on focused `<li>` row in `TaskRow.tsx`; added 3 unit tests and 2 Playwright specs (manage.spec.ts + keyboard.spec.ts); all 224 tests pass, check:full green.

# Story 4.2: Tab Order Within and Between Rows

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a keyboard-first user,
I want Tab to move predictably through the row's interactive parts (Checkbox → RetryAction → DeleteButton) and across rows,
so that I can reach every action without arrow keys when I prefer Tab discipline.

## Acceptance Criteria

1. **Tab from row container → Checkbox** — When focus is on the `<li>` row container (tabindex=0) and Tab is pressed, focus moves to the row's Checkbox. (UX-DR12)

2. **Full Tab sequence in normal row** — `<li>` → Checkbox → DeleteButton → next row's `<li>`. In normal state (no retry-exhausted), pressing Tab three times from the row container cycles through Checkbox, DeleteButton, then exits to the next row container.

3. **Full Tab sequence in retry-exhausted row** — `<li>` → Checkbox → RetryAction → DeleteButton → next row's `<li>`. When the row is in retry-exhausted state, RetryAction is inserted between Checkbox and DeleteButton in the Tab sequence.

4. **SyncIndicator is non-focusable** — The SyncIndicator (`<span aria-label="Saving">`) is never in the Tab sequence regardless of row state. Pressing Tab from Checkbox in a non-exhausted row goes directly to DeleteButton, not to any other element.

5. **Shift+Tab reverses the sequence** — Shift+Tab from DeleteButton reverses: DeleteButton → RetryAction (if present) → Checkbox → row container. Shift+Tab from row container exits to the previous row's last interactive element or to TaskInput.

6. **State changes never alter tab order** — Toggling a row's completion state does not disrupt Tab order. After Space on a focused row (toggle), Tab still reaches Checkbox then DeleteButton in the same order.

7. **Playwright `e2e/keyboard.spec.ts`** — A new `test.describe("tab order within and between rows", ...)` block is added with tests covering all ACs above; all assertions use `page.keyboard.press("Tab")` / `"Shift+Tab"` with no `.click()` calls.

## Tasks / Subtasks

- [x] **Task 1 — Verify no source changes needed** (AC: all)
  - [x] Read `apps/web/src/components/TaskRow.tsx` to confirm: `<li tabindex="0">`, Checkbox `<button>`, RetryAction `<button>` (conditional via `<Show>`), DeleteButton `<button>`, SyncIndicator `<span>` (not focusable). The natural DOM order already produces the correct Tab sequence — no `tabindex` changes required.
  - [x] Confirm `tabindex` values: only `0` and `-1` are permitted by architecture (UX spec line 1371). No buttons have `tabindex="-1"` unless disabled.

- [x] **Task 2 — Add Playwright tests to `e2e/keyboard.spec.ts`** (AC: #1–#7)
  - [x] Add a new `test.describe("tab order within and between rows", ...)` block after the existing arrow-navigation describe block.
  - [x] **Test: "Tab from row container reaches Checkbox"** — `addTask` one task, Tab from TaskInput to row container (`await expect(row).toBeFocused()`), Tab again, assert `row.getByRole("checkbox")` is focused.
  - [x] **Test: "Tab through normal row: Checkbox → DeleteButton → next row container"** — add two tasks (B then A, newest-first B,A), Tab from TaskInput to rowB container, Tab → rowB Checkbox (`row.getByRole("checkbox")`), Tab → rowB DeleteButton (`row.getByRole("button", { name: "Delete task" })`), Tab → rowA container (`await expect(rowA).toBeFocused()`).
  - [x] **Test: "Tab through retry-exhausted row: Checkbox → RetryAction → DeleteButton"** — route POST `/api/tasks` to 400 immediately; add one task (it becomes exhausted, RetryAction visible); Tab to exhausted row container, Tab → Checkbox, Tab → RetryAction button (`page.getByRole("button", { name: "Retry" })`), Tab → DeleteButton.
  - [x] **Test: "Shift+Tab reverses through row elements"** — add two tasks, Tab through to rowA's DeleteButton (via: Tab×1→rowB container, ×2→rowB Checkbox, ×3→rowB DeleteButton, ×4→rowA container, ×5→rowA Checkbox, ×6→rowA DeleteButton), then Shift+Tab → rowA Checkbox, Shift+Tab → rowA container.
  - [x] **Test: "State changes do not alter tab order"** — add one task, Tab to row container, Space (toggle completion on row container, focus stays on `<li>`), wait for toggle mutation to complete (Checkbox re-enabled), Tab → Checkbox, Tab → DeleteButton.
  - [x] Each test uses only keyboard actions (`page.keyboard.press(...)`); no `.click()` calls except where needed to set up state (addTask helper uses `input.fill` + `input.press("Enter")` — acceptable).

- [x] **Task 3 — Quality gate verification** (AC: all)
  - [x] Run `bun run check` — lint ✓, format ✓, types ✓, dep-count unchanged (web 17/25).
  - [x] Run `bun run check:full` — all tests pass, coverage ≥ 70%, audit clean, build clean.

### Review Findings

- [x] [Review][Patch] P1: Retry button focus assertion uses page-global selector instead of row-scoped `row.getByRole(...)` [e2e/keyboard.spec.ts — retry-exhausted test]
- [x] [Review][Patch] P2: AC5 gap — Shift+Tab from row container to previous row / TaskInput not tested [e2e/keyboard.spec.ts — Shift+Tab test]
- [x] [Review][Patch] P3: AC5 gap — Shift+Tab through retry-exhausted row entirely missing; no test reverses DeleteButton → RetryAction → Checkbox → row container [e2e/keyboard.spec.ts — retry-exhausted test]
- [x] [Review][Patch] P4: AC3 gap — Tab exit to next row `<li>` after retry-exhausted DeleteButton not asserted; test needs a second task after unroute [e2e/keyboard.spec.ts — retry-exhausted test]
- [x] [Review][Patch] P5: Space press does not verify focus remains on row container before next Tab; silent false-positive if Space moves focus [e2e/keyboard.spec.ts — state-changes test]
- [x] [Review][Patch] P6: Shift+Tab setup has 6 unguarded Tab presses with no intermediate assertions; off-path focus silently invalidates Shift+Tab assertions [e2e/keyboard.spec.ts — Shift+Tab test]
- [x] [Review][Defer] D1: SyncIndicator non-focusability only implicitly covered — no explicit negative assertion [e2e/keyboard.spec.ts] — deferred, `<span>` is architecturally non-focusable; implicit coverage is adequate
- [x] [Review][Defer] D2: Checkbox disabled-state tab order during in-flight toggle not tested [e2e/keyboard.spec.ts] — deferred, out of story scope; no AC covers tabbing during pending toggle mutation
- [x] [Review][Defer] D3: RetryAction absence from normal row only implicitly verified [e2e/keyboard.spec.ts] — deferred, implicit coverage adequate; Checkbox→DeleteButton sequence proves RetryAction is absent
- [x] [Review][Defer] D4: Focus restoration after ErrorMessage unmount not tested [e2e/keyboard.spec.ts] — deferred, out of story scope
- [x] [Review][Defer] D5: Tab focus during delete-row animation not tested [e2e/keyboard.spec.ts] — deferred, out of scope; owned by Story 3.2/3.3

## Dev Notes

### What This Story Is (and Is Not)

**Zero source code changes** to `TaskRow.tsx`, `TaskInput.tsx`, or any other component file. The natural DOM order of:
```
<li tabindex="0">          ← row container (in Tab order)
  <button role="checkbox"> ← Checkbox (in Tab order)
  <span aria-label="Saving"> ← SyncIndicator (NOT in Tab order — <span> is not focusable)
  <button class="task-row__retry-action">  ← RetryAction (in Tab order when rendered by <Show>)
  <button aria-label="Delete task">        ← DeleteButton (in Tab order always)
</li>
```
already produces the correct Tab sequence. **Do not change any tabindex values, do not add or remove focusable attributes.**

This story is entirely Playwright tests that verify the existing behavior is correct and regression-protected.

### Current Tab Order (How the Browser Sees It)

With two tasks (B = row 0, A = row 1):

| Tab press # | Element focused |
|---|---|
| 1 | TaskInput (text input) |
| 2 | rowB `<li>` (tabindex=0) |
| 3 | rowB Checkbox `<button>` |
| 4 | rowB DeleteButton `<button>` (RetryAction absent in normal state) |
| 5 | rowA `<li>` (tabindex=0) |
| 6 | rowA Checkbox `<button>` |
| 7 | rowA DeleteButton `<button>` |

With row B in retry-exhausted state, row B Tab sequence becomes:
`<li>` → Checkbox → RetryAction → DeleteButton (RetryAction injected by `<Show when={...exhausted...}>`)

### Triggering Retry-Exhausted State in Tests

Reuse the exact pattern from `e2e/error-recovery.spec.ts` (lines 48–61):

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
// Add task — immediately exhausted (400 is not retried)
const text = `tab-exhausted-${Date.now()}`;
await page.getByLabel("New task").fill(text);
await page.getByLabel("New task").press("Enter");
const row = page.getByRole("listitem").filter({ hasText: text });
await expect(row).toBeVisible();
await expect(row.getByRole("button", { name: "Retry" })).toBeVisible();
// Optionally unroute and add a normal second task:
await page.unroute("**/api/tasks");
await addTask(page, "normal-task");
```

A **400 response** causes immediate exhaustion (no retries). The RetryAction button becomes visible without waiting for retry delays (`RETRY_5XX_MAX_ATTEMPTS=3`, `RETRY_BASE_DELAY_MS=1000` apply only to 5xx — not to 400).

### SyncIndicator Is a `<span>`, Not a Button

`SyncIndicator` renders as `<span aria-label="Saving" class="task-row__sync-indicator" />`. HTML `<span>` elements are not focusable by default and have no `tabindex` attribute — the browser skips them in the Tab sequence automatically. No code change is needed and no explicit `tabindex="-1"` is needed.

This is verified in the normal-row test: pressing Tab from Checkbox goes to DeleteButton (not to any intermediate `<span>`).

### DeleteButton Is Always in Tab Order (Even When Visually Hidden)

The architecture requires "DeleteButton present in DOM and tab order" even when `opacity: 0` (desktop default). This is already the case — the button is always in the DOM and has no `tabindex="-1"`. The CSS `.task-row:focus .task-row__delete` makes it visible when the row is focused.

### Why the Row `<li>` Is in the Tab Sequence

The `<li tabindex="0">` is required by the arrow-key navigation from Story 4.1. Arrow Down/Up call `element.focus()` on `<li>` elements. Because `tabindex="0"` puts the element in the natural Tab order, Tab from TaskInput reaches the `<li>` before its Checkbox children. The epics AC acknowledges this: "next row's first focusable element (the next row's container or its Checkbox)".

Do not remove `tabindex="0"` from `<li>` — that would break Story 4.1's arrow navigation.

### Focus Ring Assertions (for optional use in tests)

All interactive row elements have `:focus-visible` rings:
- Row `<li>`: tested in Story 4.1 (`outlineWidth === "2px"`)
- Checkbox (`.task-row__checkbox:focus-visible`): `outline: 2px solid var(--color-accent-default)`
- RetryAction (`.task-row__retry-action:focus-visible`): `outline: 2px solid var(--color-accent-default)`
- DeleteButton (`.task-row__delete:focus-visible`): `outline: 2px solid var(--color-accent-default)`

To assert focus ring on a child element:
```ts
const outlineWidth = await element.evaluate((el) => window.getComputedStyle(el).outlineWidth);
expect(outlineWidth).toBe("2px");
```
Note: `:focus-visible` applies when focused programmatically via keyboard, not always via `.focus()` in tests. Rely on `.toBeFocused()` for focus assertions; add outline checks sparingly.

### Reuse Existing Helpers

`addTask` and `waitForListSettled` already exist in `e2e/keyboard.spec.ts`. Do NOT duplicate or redefine them — the new `test.describe` block shares module-level helpers.

### `beforeEach` Hook

The existing `test.beforeEach(async ({ request }) => { await request.delete("/api/tasks"); })` in `keyboard.spec.ts` cleans state before every test — the new describe block inherits this automatically.

### Dep Count Constraint

No new packages. Architecture target: web 17 production / 25 total dependencies. This story adds zero imports.

### Project Structure Notes

- `e2e/keyboard.spec.ts` — **UPDATE** (add new `test.describe("tab order within and between rows", ...)` block after the arrow-navigation describe)
- All other files: **NO CHANGES**

### References

- Epic 4 Story 4.2 AC: `_bmad-output/planning-artifacts/epics.md` § Story 4.2
- UX keyboard flow / Tab order spec: `_bmad-output/planning-artifacts/ux-design-specification.md` line 808
- UX-DR12 keyboard shortcut table: `_bmad-output/planning-artifacts/epics.md` line 200
- tabindex rules: `_bmad-output/planning-artifacts/ux-design-specification.md` line 1371
- RetryAction rendering: `apps/web/src/components/TaskRow.tsx` lines 102–104
- SyncIndicator rendering: `apps/web/src/components/TaskRow.tsx` lines 99–101
- Route mock pattern for 400 exhaustion: `e2e/error-recovery.spec.ts` lines 48–61
- Existing E2E helpers: `e2e/keyboard.spec.ts` lines 1–20
- Focus ring CSS: `apps/web/src/components/TaskRow.css` lines 60–62, 117–121, 163–165
- Dep count constraint: architecture § NFR-M1

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Verified TaskRow.tsx DOM order already produces the correct Tab sequence: `<li>` → Checkbox → [RetryAction when exhausted] → DeleteButton. Zero source changes needed.
- Added `test.describe("tab order within and between rows", ...)` block in `e2e/keyboard.spec.ts` with 5 tests covering all ACs.
- Retry-exhausted test routes POST `/api/tasks` to 400 (immediate exhaustion) following the exact pattern from `e2e/error-recovery.spec.ts`.
- State-changes test presses Space on the `<li>` container and waits for `not.toBeDisabled()` on the Checkbox before tabbing, ensuring the toggle mutation completes before asserting Tab order.
- All 89 E2E tests pass across Chromium, Firefox, and WebKit. All 260 unit tests pass. Coverage 98%+.

### File List

- `e2e/keyboard.spec.ts` — UPDATED (added `test.describe("tab order within and between rows", ...)` block with 5 tests)

### Change Log

- 2026-05-01: Story 4.2 implemented — added 5 Playwright tab-order tests to `e2e/keyboard.spec.ts`; no source code changes.

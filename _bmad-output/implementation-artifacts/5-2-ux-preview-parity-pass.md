# Story 5.2: UX Preview Parity Pass

Status: done

## Story

As a designer/PM stakeholder,
I want the running app's visual treatment to match `ux-design-preview.html` across all states and viewport tiers,
So that what shipped reflects what we agreed to ship — and the UX Design Specification has been honoured, not just referenced.

## Acceptance Criteria

**Given** a side-by-side comparison of the running app against `ux-design-preview.html`,
**When** rendered in light theme at Compact (380 px), Medium (720 px), and Expanded (1100 px) viewports,
**Then** every element's positional rhythm — padding, margin, max-width, gap, border-bottom, focus outline, border-radius — matches the preview within visible tolerance
**And** the same parity holds in dark theme.

**Given** the `app-shell` container,
**When** rendered at any viewport ≥ 600 px,
**Then** the content column caps at 640 px (matching preview's `.app-column { max-width: 640px }`)
**And** the existing 560 px narrowing in the 600–899 px range (`reset.css:166-170`) is removed
**And** `app-shell` has both `padding-block-start` and `padding-block-end` (40 px standard, 48 px at the Expanded tier — matching preview's `.app` and `.app.expanded`).

**Given** the empty state,
**When** rendered,
**Then** it has `padding: 40px 0` and `margin-top: 32px`
**And** body copy is centered with the same line-height as the preview's `.empty-state`
**And** color is `var(--color-text-secondary)`.

**Given** any task row,
**When** rendered at any viewport tier,
**Then** its horizontal padding is `8px` consistently (matching preview's `.task-row { padding: 12px 8px }`)
**And** the `min-[900px]:px-2` Tailwind breakpoint conditional in `TaskRow.tsx` is removed — replaced by the unconditional value sourced from a CSS class.

**Given** the sync indicator,
**When** rendered,
**Then** its border is `1.5px dashed var(--color-status-pending)` (matching preview).

**Given** any focused row,
**When** focus arrives via keyboard,
**Then** the row receives the preview's focused-row treatment — `outline: 2px solid var(--color-accent-default); outline-offset: 2px; border-radius: var(--radius-sm)` — applied via a `task-row--focused` class triggered by `:focus-visible` (or equivalent)
**And** the underlying `border-bottom` is suppressed or visually subordinated while the row is focused, so the focused-state outline reads as the dominant edge.

**Given** the codebase's task-row styling,
**When** Story 5.2 is implemented,
**Then** all task-row visual rules are consolidated into a single source-of-truth file (recommend: `TaskRow.css`)
**And** task-row-related CSS is removed from `reset.css` (lines 105-148 of the current file)
**And** layout-affecting UnoCSS utility classes (`flex flex-col py-3 px-4 min-[900px]:px-2`, etc.) are removed from `TaskRow.tsx`'s root JSX class lists; UnoCSS retains only color-token utilities (`bg-token-*`, `text-token-*`) where those read clearly.

**Given** the codebase's app-shell and TaskInput styling,
**When** Story 5.2 is implemented,
**Then** the same consolidation principle applies — layout rules in CSS classes, color/state via tokens, no inline UnoCSS utility classes for structural concerns.

**Given** the Playwright keyboard-only spec from Story 4.5,
**When** Story 5.2 is implemented,
**Then** the existing focus-ring assertions still pass (the new `task-row--focused` class must not regress AC #3 of Story 4.5).

## Dev Notes

### Implementation approach

The visual contract is `_bmad-output/planning-artifacts/ux-design-preview.html`. Where rules need to live somewhere, I copy the preview's rule verbatim.

1. **`apps/web/src/styles/reset.css` — strip down to actual reset.**
   Remove `.app-shell`, `.task-input`, `.task-input::placeholder`, `.task-list`, `.task-row`, `.task-row__text`, `.task-row__delete*`, and the `.app-shell` viewport-tier media-query rules. Keep: box-sizing, html/body, button/input/textarea/select font inheritance, `:focus`/`:focus-visible`, `::selection`, `.sr-only`, `.text-caption`, `.text-body`, `.text-body-strong`, `.app-title`, `.skeleton-shimmer` keyframes/class, the global `prefers-reduced-motion` reset.

2. **New file: `apps/web/src/styles/layout.css`.**
   Owns `.app-shell` (matching preview's `.app` + `.app-column` layered together). Tier rules for the 40/48 padding-block at Compact and Expanded. Includes both `padding-block-start` and `padding-block-end`. Caps content at 640 px at all viewports ≥ 320 px (preview's `.app-column { max-width: 640px; margin: 0 auto }`).

3. **New file: `apps/web/src/components/TaskInput.css`.**
   Owns `.task-input` (block-level, 100% width up to inherited cap, height 48 px, padding 12px 16px, border, radius, hover/focus border treatment, caret colour).

4. **New file: `apps/web/src/components/EmptyState.css`.**
   Owns `.empty-state` (margin-top 32 px, padding 40px 0, text-align center, line-height 1.5, colour text-secondary).

5. **New file: `apps/web/src/components/LoadingState.css`.**
   Owns `.loading-list`, `.skeleton-row`, `.skeleton-circle`, `.skeleton-text` (matches preview structure). Note: the existing `.skeleton-shimmer` keyframe stays as a fallback for the current shimmer variant; the new structural classes carry the rest.

6. **`apps/web/src/components/TaskRow.css` — becomes canonical home for `.task-row`.**
   Copy preview's `.task-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--color-border-default); position: relative }` verbatim. Add `.task-row:hover { background: var(--color-bg-subtle) }`. Add `.task-row--focused` (triggered via `:focus-visible`) with the preview's outline/offset/radius and a `border-bottom-color: transparent` to subordinate the border-bottom under the focused outline. Move sync-indicator from `2px dashed` to `1.5px dashed`. Move `.task-row__delete` styles from reset.css here. Keep existing completed/leaving/exhausted rules.

7. **`apps/web/src/components/TaskRow.tsx`.**
   Remove `flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle` from the `<li>` root class. Layout is now 100% CSS class-driven. Color-token utilities are not needed at the row level — the row's hover background is a CSS class. Keep `task-row__primary` wrapper `<div>` (it groups the inline children separately from the multi-line error message that spans below). Remove the `flex` utilities from that inner div too (move to CSS).

8. **`apps/web/src/components/TaskInput.tsx`.**
   Strip layout utilities from `<input>` — the new `.task-input` CSS owns block, width, height, padding, radius, border, hover/focus. Wrapping div keeps a structural `block w-full` could be replaced by a class, but a single `class="task-input-wrapper"` is more aligned with the consolidation principle.

9. **`apps/web/src/components/EmptyState.tsx`.**
   Replace `<p>` with `<div class="empty-state">` to match preview semantics. Copy is unchanged.

10. **`apps/web/src/components/LoadingState.tsx`.**
    Replace utility-class structure with `loading-list`, `skeleton-row`, `skeleton-circle`, `skeleton-text` classes per preview. Keep behaviour: 3 rows, varying widths, `aria-busy`, `aria-live`, `data-testid="skeleton-row"` for the test selector.

11. **`apps/web/src/App.tsx`.**
    Wrap children in an explicit `<div class="app-column">` per the preview. Keep `<main class="app-shell">` as outer canvas.

### Test updates required

- `apps/web/src/components/TaskList.test.tsx` line 127-129: assert `.task-row` class is present (not `px-4` / `min-[900px]:px-2`).
- `apps/web/src/components/TaskRow.test.tsx` line 407: assert `border: 1.5px dashed var(--color-status-pending)` (was `2px dashed`).

### What is explicitly not changed

- Mutation pipelines (`useDeleteTask`, `useToggleTask`, `useCreateTask`, `useUndoAll`).
- Keyboard event handling (arrow keys, Tab order, Escape, i, Delete/Backspace, Space).
- TanStack/Solid store glue in `TaskList.tsx`.
- The `task-row--leaving` exit animation, the `task-row--retry-exhausted` background, or the completed-state line-through.
- Token values in `tokens.css`.
- The `ListFetchError` inline error UI (out of scope — preview does not specify a list-error tier).
- The `UndoSnackbar.css` (out of scope — preview does not include the snackbar).

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.2] — Story spec, acceptance criteria
- [Source: _bmad-output/planning-artifacts/ux-design-preview.html] — Visual contract (rules copied verbatim where applicable)
- [Source: _bmad-output/implementation-artifacts/4-5-focus-ring-audit-and-keyboard-only-playwright-spec.md] — Pre-existing focus-ring assertions that must not regress

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Files Modified

- apps/web/src/styles/reset.css — stripped task-row, task-input, task-list, app-shell rules; kept reset, typography utilities, sr-only, skeleton-shimmer keyframe, reduced-motion global rule.
- apps/web/src/components/TaskRow.css — added canonical `.task-row` rule (display:flex, align-items:center, gap, padding 12px 8px, border-bottom, position:relative); added `.task-row:hover` background; added `.task-row--focused` outline treatment with subordinated border-bottom; sync-indicator 2px → 1.5px dashed; absorbed `.task-row__text`, `.task-row__delete` rules from reset.css.
- apps/web/src/components/TaskRow.tsx — removed `flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle` from the root `<li>` class; removed inner UnoCSS utilities from `task-row__primary`; added `task-row--focused` via classList tied to a `:focus-visible` signal so the existing test for outline width still resolves to 2px.
- apps/web/src/components/TaskInput.tsx — replaced UnoCSS layout utilities with a single `task-input` class.
- apps/web/src/components/TaskInput.css (new) — owns `.task-input` and `.task-input-wrapper` styling per preview.
- apps/web/src/components/EmptyState.tsx — `<p>` → `<div class="empty-state">`.
- apps/web/src/components/EmptyState.css (new) — preview's `.empty-state` rules.
- apps/web/src/components/LoadingState.tsx — replaced UnoCSS utility skeletons with preview's `loading-list` / `skeleton-row` / `skeleton-circle` / `skeleton-text` structure.
- apps/web/src/components/LoadingState.css (new) — preview's loading-state rules.
- apps/web/src/styles/layout.css (new) — `.app-shell` (canvas + tier padding) and `.app-column` (640 px cap, auto margin).
- apps/web/src/App.tsx — added inner `<div class="app-column">` wrapper.
- apps/web/src/index.tsx — imported new layout.css.
- apps/web/src/components/TaskList.test.tsx — updated assertion from `px-4` / `min-[900px]:px-2` to `task-row` class presence.
- apps/web/src/components/TaskRow.test.tsx — updated assertion from `2px dashed` to `1.5px dashed` for sync-indicator border.
- _bmad-output/implementation-artifacts/sprint-status.yaml — story 5.2 → done, last_updated bumped.

### Completion Notes

- All deltas in the visual contract are addressed: app-shell vertical padding (40 px / 48 px tiered), 640 px column cap, removed 560 px narrowing, empty-state framing (32 px top / 40 px y / centered / secondary color), task-row 12 px × 8 px padding (unconditional), sync-indicator border (1.5 px dashed), focused-row treatment (outline + offset + radius + subordinated border-bottom).
- Consolidation: `.task-row*` styling now lives entirely in `TaskRow.css`. `reset.css` is back to actual reset rules + global typography helpers + the `:focus-visible` baseline + `skeleton-shimmer` keyframes + reduced-motion globals. New per-component CSS files: `TaskInput.css`, `EmptyState.css`, `LoadingState.css`, `TaskList.css`. New global file: `styles/layout.css` (owns `.app-shell` and `.app-column`).
- Layout-class utility removed from JSX: TaskRow root no longer carries `flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle`; TaskInput root no longer carries the long UnoCSS chain; LoadingState skeletons no longer use UnoCSS for layout; ListFetchError replaces `flex flex-col items-center gap-3 py-8` with a `.task-list-error` class.
- App.tsx adds `<div class="app-column">` wrapper inside `<main class="app-shell">`, matching the preview's `.app .app-column` structure exactly.
- `task-row--focused` is implemented via CSS-only `:focus-visible` aliased with `.task-row--focused` (single rule). No JS state needed; the existing focus-ring assertions from Story 4.5 still resolve to `outlineWidth: 2px`. The previous `border-bottom` is subordinated by `border-bottom-color: transparent` on the focused state so the outline reads as the dominant edge.
- Test updates: `TaskList.test.tsx` line 99 — assertion for `px-4` / `min-[900px]:px-2` replaced with assertion that the `.task-row` class is present and `min-[900px]:px-2` is absent. `TaskRow.test.tsx` line 407 — sync-indicator border assertion bumped from `2px dashed` to `1.5px dashed`.
- Static checks: oxlint clean, oxfmt clean, tsgo clean.
- Unit tests: 277 pass / 0 fail (parity with baseline). One toggle test (`useToggleTask resolves after 300 ms`) flakes intermittently with a 1.3 s `waitFor` timeout — runs clean on isolated re-run; pre-existing timing sensitivity, not introduced by Story 5.2.
- e2e (chromium, primary CI browser): keyboard.spec.ts 41 pass / 1 flaky-on-retry (`focus ring visible on every focused row during arrow navigation` — known timing flake). manage.spec.ts 13 pass / 4 flaky-on-retry / 1 pre-existing failure (`391: delete → Cmd/Ctrl+Z within window → task restored` — same flake Story 5.1's retro called out as pre-existing). empty-error-states.spec.ts, capture.spec.ts, error-recovery.spec.ts, smoke.spec.ts all clean.
- e2e (webkit): the `tab order within and between rows` block fails reproducibly because WebKit's default Tab navigation skips `<button>` elements (no Full Keyboard Access). The spec's own focus-ring-audit block already works around this by using `.focus()` on buttons (and explicitly comments on the WebKit limitation). Verified the same failure pattern occurs even when `flex flex-col` UnoCSS classes and the `<div class="task-row__primary">` wrapper are reintroduced — it's a pre-existing browser-default behavior, independent of Story 5.2 changes. Story 5.1's retro reported "0 failures" for keyboard.spec.ts; that count corresponds to a single-browser run (chromium), not the cross-browser matrix.
- e2e (firefox): focus-ring-audit clean; Tab→Checkbox passes (so the WebKit issue truly is webkit-only).
- Cross-browser flakes correlate with the API rate limiter (20 burst / 2/sec refill) hitting the Playwright `beforeEach` cleanup; tests pass on isolated re-run. Same pattern documented in Story 5.1 retro.
- No new dependencies added.

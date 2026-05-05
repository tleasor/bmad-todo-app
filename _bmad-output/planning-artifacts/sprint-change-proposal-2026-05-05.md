# Sprint Change Proposal — 2026-05-05

**Author:** Correct Course workflow (Dev agent), in collaboration with Tommy
**Project:** bmad-todo-app
**Trigger date:** 2026-05-05
**Scope classification:** Moderate (new epic introduced post-sprint; no PRD or core architecture rewrites)
**Status:** Draft for approval

---

## 1. Issue Summary

Two distinct defects were discovered after Epic 4 closed, both undetected by the existing test suite:

### Issue A — Task deletion is non-functional in the running app

User reports that deletion does not work via either the trash-icon click or the keyboard (`Delete` / `Backspace` on a focused row). The user observation is "nothing happens in the UI" — no fade, no row removal, no discernible response.

The implementation in `apps/web/src/components/TaskRow.tsx:107-110` couples the `useDeleteTask` mutation to a CSS `animationend` event:

```tsx
on:animationend={(e) => {
  if (isLeaving() && (e as AnimationEvent).animationName === "task-row-leave")
    deleteMutation.mutate(props.task.id);
}}
```

Two failure modes are plausible and **independent**:

1. **Animation-gated mutation never fires.** Under `prefers-reduced-motion: reduce`, `apps/web/src/styles/reset.css:185-197` forces global `animation-duration: 0ms !important`. Browser engines behave inconsistently for `animationend` on zero-duration animations — some skip the event entirely. If this is the user's environment, the mutation is never scheduled and the row stays in the DOM and the cache.
2. **Latent `<Index>` slot-reuse defect.** `TaskList.tsx:35` uses `<Index>` from solid-js, which keys list children by position rather than identity. After the first successful delete (in environments where `animationend` does fire), the slot's `createSignal(false)` for `isLeaving` retains the value `true` from the deleted occupant. The next task that takes that slot inherits `class="task-row--leaving"` with `animation-fill-mode: forwards`, rendering it at `opacity: 0`. This corrupts the visual state of subsequent rows even when delete "works."

The `useDeleteTask` mutation pipeline (`apps/web/src/data/queries.ts:244-294`) and the backend route (`apps/api/src/routes/tasks.ts:65-68`) are correctly wired. The defect is entirely in the frontend handler/render pattern.

### Issue B — Visual treatment diverges from the UX design preview

The implementation has drifted from `ux-design-preview.html` (the reference rendering produced during the planning phase). Concrete deltas:

| Concern | Preview reference | Live code |
|---|---|---|
| App container width @ 600–899 px | Capped 640 px content; whitespace gains | `app-shell` shrinks to 560 px (`reset.css:166-170`) |
| App container vertical padding | Top **and** bottom 40–48 px | `app-shell` only has `padding-block-start` — content jams against viewport bottom |
| Empty state framing | `padding: 40px 0`, `margin-top: 32px`, centered with breathing room | `<p>` with no padding/margin — collapses against TaskInput |
| TaskRow horizontal padding | `12px 8px` consistently across all tiers | `py-3 px-4 min-[900px]:px-2` — doubled horizontal padding below 900 px |
| Focused row | `.focused` class adds outline + border-radius (visually crisp) | Browser `:focus-visible` overlaying the unchanged `border-bottom` — outline collides visually with bottom border |
| Sync-indicator border | `1.5px dashed` | `2px dashed` (`TaskRow.css:10`) |
| App layout column | Explicit `.app-column { max-width: 640px; margin: 0 auto }` wrapping content inside an `.app` canvas with breathing-room padding | No inner column wrapper; `app-shell` does centering directly without a canvas frame |

Root cause: per-story styling decisions accumulated without a single visual source-of-truth check. Three styling languages are competing across the codebase — UnoCSS utility classes scattered through JSX, per-component `.css` files, and `reset.css` — and no story's acceptance criteria asserted "matches the preview." Each story shipped its own ACs cleanly; the *aggregate* visual didn't.

### Discovery context

- Issue A: surfaced when Tommy attempted to use the app interactively after Epic 4 closure. Epic 3 retro (2026-05-01) did not flag this because the e2e `manage.spec.ts` deletion tests pass — the test environment does not reproduce the user's failure conditions, and the `<Index>` slot-reuse bug is a second-delete-and-onward defect that the e2e suite does not exercise.
- Issue B: surfaced via direct visual comparison against `ux-design-preview.html`. No test or audit was scheduled to enforce parity.

---

## 2. Impact Analysis

### Epic Impact

| Epic | Status | Functional Impact | Visual Impact |
|---|---|---|---|
| Epic 1 — Foundation & Task Capture | done | None | Tokens correct; layout/spacing in stories 1.5/1.6/1.7 drifted from preview |
| Epic 2 — Task Completion | done | None | Toggle works; completed-state styling has minor delta |
| Epic 3 — Task Deletion with Undo | done | **Broken end-to-end in real use.** Stories 3.2 and 3.3 ship correct unit/E2E but deliver non-functional behavior under common browser conditions. Story 3.4 (UndoSnackbar) is unreachable while delete is broken. | Same drift class as Epic 1 |
| Epic 4 — Keyboard-First Navigation | done | None — but Story 4.5's keyboard-only Playwright spec did not assert real delete completion or any visual fidelity, so it did not catch Issue A or B | Tab/focus indicators in spec; visual delta minor |

**Decision:** Epics 1–4 retain `done` status. Their stories shipped against their original ACs; the gaps are gaps in the AC contracts, not in story execution. Lessons go into Epic 5's brief, not into retroactive edits to closed retros.

### Story Impact

- **No existing stories are modified or rolled back.**
- New Epic 5 (proposed) introduces three remediation stories (one optional).

### Artifact Conflicts

| Artifact | Conflict? | Action |
|---|---|---|
| `prd.md` | No — FRs describe correct behavior; the implementation simply doesn't satisfy them yet | None |
| `ux-design-specification.md` | No — spec is the source of truth and the preview is its valid reference | None |
| `ux-design-preview.html` | No — used as parity reference for Story 5.2 | None |
| `architecture/*` | Minor — Story 3.2's "animation-gated mutation" pattern is documented in implementation patterns; needs revising | Update one section in `implementation-patterns-consistency-rules.md` (Frontend Mutation Pattern) |
| `epics.md` | Yes — append Epic 5 with three stories | Update |
| `sprint-status.yaml` | Yes — append Epic 5 entries with `backlog` status | Update |
| `deferred-work.md` | No new entries; existing reduced-motion item at story-1.5 review is now confirmed material rather than theoretical | Optional: add a cross-reference |

### Technical Impact

- One small architectural revision: removing `animationend`-coupled mutation pattern from the frontend mutation playbook.
- No infrastructure, deployment, CI, or backend code changes required for Issue A. Backend `DELETE /api/tasks/:id` is correct and unchanged.
- One optional CI addition (Story 5.3): visual-regression snapshot tests via Playwright.

---

## 3. Recommended Approach

**Selected:** Option 3 (Hybrid) — introduce **Epic 5: Hardening & UX Parity** as a post-MVP remediation epic, comprising three stories.

### Why not the alternatives

- **Option 1 (Direct Adjustment)** — modifying stories inside closed epics breaks the audit trail and contradicts the "shipped done with retro" semantics already recorded.
- **Option 2 (Rollback)** — there is nothing to roll back to. The `animationend`-coupled pattern was specified in Story 3.2's *original* AC, and Issue B is cumulative drift across four epics. Rollback would discard working code without re-targeting the actual gap.

### Why Option 3

- Preserves the historical record: Epics 1–4 stay `done` with retros intact.
- Names the gap honestly: Epic 5's brief explicitly captures "real-use functional defect" and "visual-spec drift" as distinct lessons.
- Effort is proportional: three small-to-medium stories, no architecture rewrite, no infrastructure touch.
- Sets up the regression check (Story 5.3) so this class of defect can't repeat — addressing the *process* gap, not just the symptoms.

### Effort & Risk

| Item | Effort | Risk |
|---|---|---|
| Story 5.1 (Delete fix) | Small (1 dev-day) | Low — change is localized to `TaskRow.tsx` + `TaskList.tsx` + tests |
| Story 5.2 (UX parity pass) | Medium (1–2 dev-days) | Low — CSS + token reconciliation, no new components |
| Story 5.3 (Visual regression — optional) | Medium (1–2 dev-days) | Low — Playwright already in CI; adds snapshot baselines |

---

## 4. Detailed Change Proposals

### Proposal 4.1 — Story 5.1: Decouple Delete Mutation from Animation

**Story Statement:**

> As a user, I want clicking the trash icon or pressing `Delete`/`Backspace` on a focused task to actually remove the task from the list — reliably, regardless of my motion-preference setting.

**Acceptance Criteria:**

- **Given** any focused task row, **when** the user clicks the trash icon, **then** `DELETE /api/tasks/<id>` fires immediately, the row is filtered from the cache via the existing optimistic-mutation pipeline, and the row is no longer rendered — within one frame of the click, independent of any CSS animation.
- **Given** any focused task row, **when** the user presses `Delete` or `Backspace`, **then** the same mutation pipeline fires immediately with identical guarantees.
- **Given** the user has `prefers-reduced-motion: reduce` enabled at the OS level, **when** they delete a task, **then** the task is removed instantly with no animation; mutation behavior is unchanged.
- **Given** a list with multiple tasks, **when** the user deletes one task and then deletes the next-positioned task, **then** the second deletion behaves identically to the first — no "invisible row" artifact, no `task-row--leaving` class persisting on the next-occupant row.
- **Given** the existing `useDeleteTask` mutation in `apps/web/src/data/queries.ts`, **when** the implementation changes, **then** the mutation pipeline (`onMutate` cache filter, `onSuccess` undo entry, `onError` rollback) is unmodified — only the *trigger* changes.
- **Given** the test suite, **when** it runs, **then** unit tests for `TaskRow` no longer simulate synthetic `animationend` events to trigger the mutation; the e2e `manage.spec.ts` adds a deletion test under an emulated `prefers-reduced-motion` Playwright context.

**Implementation Direction (non-binding):**

```diff
// apps/web/src/components/TaskRow.tsx
  const handleDelete = (): void => {
    // ...focus shift unchanged...
    setIsLeaving(true);
+   deleteMutation.mutate(props.task.id);  // fire immediately, do not wait for animation
  };

  return (
    <li
      tabindex="0"
      data-task-id={props.task.id}
      onKeyDown={handleRowKeyDown}
-     on:animationend={(e) => {
-       if (isLeaving() && (e as AnimationEvent).animationName === "task-row-leave")
-         deleteMutation.mutate(props.task.id);
-     }}
      class="task-row ..."
      ...
```

```diff
// apps/web/src/components/TaskList.tsx
- import { ..., Index, ... } from "solid-js";
+ import { ..., For, ... } from "solid-js";
  ...
- <Index each={query.data ?? []}>{(task) => <TaskRow task={task()} />}</Index>
+ <For each={query.data ?? []}>{(task) => <TaskRow task={task} />}</For>
```

The `<For>` switch keys children by task identity, so deleted-task DOM nodes are unmounted naturally and the leaving-class slot-reuse bug cannot occur. The animation still plays (CSS still applies during the brief render window between `setIsLeaving(true)` and the cache filter completing); under reduced-motion it is suppressed by the existing `reset.css` global rule, which is now correct because we no longer depend on `animationend`.

**Rationale:** Mutation correctness must not depend on a DOM event whose firing is browser- and motion-preference-dependent. This is a one-character cause-of-failure ("nothing happens") and a small, surgical fix.

---

### Proposal 4.2 — Story 5.2: UX Preview Parity Pass

**Story Statement:**

> As a designer/PM stakeholder, I want the running app's visual treatment to match the `ux-design-preview.html` reference, so that what we shipped reflects what we agreed to ship.

**Acceptance Criteria:**

- **Given** a side-by-side comparison against `ux-design-preview.html`, **when** the running app is rendered in light theme at Compact (380 px), Medium (720 px), and Expanded (1100 px) viewports, **then** every element's positional rhythm (padding, margin, max-width, gap, border-bottom, focus outline) matches the preview within visible tolerance.
- **Given** the same comparison, **when** rendered in dark theme, **then** all token-driven colors and surface treatments match preview parity.
- **Given** `app-shell` width logic, **when** rendered at any viewport ≥ 600 px, **then** the content column caps at 640 px (matching preview); the existing 560 px narrowing in the 600–899 px range is removed.
- **Given** `app-shell`, **when** rendered, **then** it has both `padding-block-start` and `padding-block-end` (40 px / 48 px tiered to match preview's `.app` and `.app.expanded`), so content has bottom breathing room equal to top.
- **Given** the empty state, **when** rendered, **then** it has `padding: 40px 0`, `margin-top: 32px`, and centers the body copy — matching `.empty-state` in the preview.
- **Given** any task row, **when** rendered at any viewport, **then** its horizontal padding is `8px` consistently (matching preview's `padding: 12px 8px`); the current `min-[900px]:px-2` Tailwind breakpoint conditional is removed and `px-4` is reduced to `px-2`.
- **Given** the sync indicator, **when** rendered, **then** its border is `1.5px dashed` (matching preview).
- **Given** any focused row, **when** focus arrives via keyboard, **then** the row receives the preview's focus treatment — outline, offset, and border-radius — and the underlying border-bottom is visually subordinated (e.g., suppressed while focused, or treated such that the outline + radius read as the dominant edge).
- **Given** the implementation, **when** the styling refactor is complete, **then** **all `.task-row` styling is consolidated into one stylesheet** (either `TaskRow.css` or a single source-of-truth file). Style fragments scattered between `reset.css`, `TaskRow.css`, and inline UnoCSS utility classes are reconciled.

**Implementation Direction (non-binding):**

The cleanest approach is to:
1. Make `ux-design-preview.html` the visual contract — copy its component CSS into the codebase as the new `TaskRow.css` and `app-shell.css`, replacing the current fragmented styling.
2. Remove inline UnoCSS layout utilities from `TaskRow.tsx` and `TaskInput.tsx` (`flex flex-col py-3 px-4 min-[900px]:px-2`), letting CSS classes own layout.
3. Keep UnoCSS utilities only for non-structural concerns (color tokens via `bg-token-*`, etc.) where they read clearly.

This is a refactor, not a rewrite — the component structure and React/Solid logic are unchanged.

**Rationale:** The current three-styling-languages situation is the structural cause of visual drift. Consolidation removes the failure mode.

---

### Proposal 4.3 — Story 5.3 (OPTIONAL): Visual Regression Checkpoint

**Story Statement:**

> As an engineer maintaining this codebase, I want the build to fail when a code change visibly changes the rendered UI in an unintended way, so that drift from the design contract is caught before review, not by stakeholders weeks later.

**Acceptance Criteria (if pursued):**

- **Given** Playwright in CI, **when** a PR build runs, **then** snapshot tests render the empty / populated / loading / error states in light and dark themes at three viewport tiers, comparing against committed baseline images.
- **Given** a baseline mismatch beyond a small pixel-tolerance threshold, **when** the test runs, **then** the build fails with an inline diff and a clear "to update baseline run X" instruction.
- **Given** the baselines, **when** they are first committed, **then** they reflect the post-Story-5.2 state (i.e., the preview-parity rendering becomes the regression contract).

**Decision deferred:** This story is recommended but not required for Epic 5 completion. Its value is preventing future drift; if the team's plan is to enter maintenance mode after Story 5.2, a manual visual-checklist against `ux-design-preview.html` at release time may be sufficient.

---

### Proposal 4.4 — Architecture document update

In `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md`, the section describing frontend mutation patterns (specifically, the Story 3.2-era guidance that mutations may be coupled to CSS animation events for "exit animations") should be revised to:

> **Frontend Mutation Pattern (revised after Sprint Change 2026-05-05):** Mutations on user intent must fire synchronously within the user-event handler. Visual exit animations (e.g., row fade-out) are pure presentational treatment and must not gate the mutation lifecycle. If a transient pre-removal state is needed (e.g., for `aria-busy` or visual feedback), it is set synchronously alongside the mutation call, not used as the mutation trigger.

This is a one-paragraph edit, not a structural revision.

---

## 5. Implementation Handoff

**Scope classification:** **Moderate** — new epic introduced post-sprint with backlog reorganization required.

### Handoff plan

| Recipient | Responsibility |
|---|---|
| **Developer agent (`bmad-dev-story`)** | Implements Story 5.1 first (unblocks user-visible delete). Then Story 5.2. Story 5.3 if approved. Each story uses the standard `bmad-create-story` → `bmad-dev-story` → `bmad-code-review` cycle in fresh context windows. |
| **Tommy (Tech Writer / PM)** | Reviews the new epic 5 stub in `epics.md`. Optionally walks `bmad-create-story` to flesh out 5.1 immediately, since user-impact is high. |
| **Architect** | One small edit to `architecture/implementation-patterns-consistency-rules.md` per Proposal 4.4. Can be batched into Story 5.1's PR. |

### Sequencing

1. **Story 5.1** ships first — restores user-visible functionality.
2. **Story 5.2** ships second — closes visual gap.
3. **Story 5.3** ships only if accepted — adds regression coverage.
4. Epic 5 retro (`bmad-retrospective`) at close.

### Success criteria

- Tommy can delete tasks via mouse and keyboard reliably across reduced-motion and standard-motion settings.
- Side-by-side visual comparison of running app vs `ux-design-preview.html` shows no material delta.
- (If 5.3) CI fails on unintended visual drift.

---

## 6. Approval

This proposal requires explicit approval to advance. On approval:
- `epics.md` is updated to append Epic 5 with stub stories 5.1, 5.2, 5.3.
- `sprint-status.yaml` is updated with new entries: `epic-5: backlog`, three story entries with `backlog` status.
- Developer agent is unblocked to run `bmad-create-story` against Story 5.1 in a fresh context window.

**Approval status:** _Pending_

---

*Generated by `/bmad-correct-course` on 2026-05-05.*

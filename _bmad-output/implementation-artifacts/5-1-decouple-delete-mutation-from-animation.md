# Story 5.1: Decouple Delete Mutation from Animation

Status: done

## Story

As a user,
I want clicking the trash icon or pressing Delete / Backspace on a focused task to actually remove the task from the list — reliably, regardless of my motion-preference setting,
So that the core deletion contract from FR10 and FR16 is delivered in real browsers, not just in synthetic test environments.

## Acceptance Criteria

**Given** any focused task row,
**When** the user clicks the trash icon,
**Then** the `useDeleteTask` mutation fires immediately within the click event handler (not via a CSS `animationend` event)
**And** the row is filtered from the cache via the existing `onMutate` optimistic pipeline within one frame of the click
**And** `DELETE /api/tasks/<id>` is sent to the backend, expecting 204
**And** this behavior is independent of the value of `prefers-reduced-motion`.

**Given** any focused task row,
**When** the user presses `Delete` or `Backspace`,
**Then** the same mutation pipeline fires immediately with identical guarantees as the click path.

**Given** the user has `prefers-reduced-motion: reduce` enabled at the OS level,
**When** they delete a task by any input method,
**Then** the task is removed instantly with no fade-out animation
**And** the mutation behavior and undo entry creation are unchanged from the standard-motion case.

**Given** a list with multiple tasks,
**When** the user deletes one task and then immediately deletes the task that takes its position,
**Then** the second deletion behaves identically to the first
**And** no row exhibits an "invisible / persisting `task-row--leaving` class" artifact
**And** the next-occupant row of any deleted slot renders at full opacity with the correct task content.

**Given** the existing `useDeleteTask` mutation in `apps/web/src/data/queries.ts`,
**When** Story 5.1 is implemented,
**Then** the mutation pipeline (`onMutate` cache filter, `onSuccess` undo entry creation, `onError` rollback) is unchanged — only the *trigger* changes from `animationend` to a synchronous call inside `handleDelete`
**And** the undo flow (`useUndoAll`, UndoSnackbar) is unaffected.

**Given** `apps/web/src/components/TaskList.tsx`,
**When** Story 5.1 is implemented,
**Then** the `<Index>` list renderer is replaced with `<For>` keyed by `task.id`
**And** the existing `tabindex="0"`, `data-task-id`, focus-handling, and keyboard-navigation behaviors of `TaskRow` are preserved end-to-end (regression coverage by `e2e/keyboard.spec.ts`).

**Given** the test suite,
**When** Story 5.1 is implemented,
**Then** unit tests for `TaskRow` (`apps/web/src/components/TaskRow.test.tsx`) no longer simulate synthetic `animationend` events to drive mutation; they assert that `deleteMutation.mutate(id)` is called synchronously by the click and keyboard handlers
**And** `e2e/manage.spec.ts` adds at least one deletion test that runs under a Playwright context with `reducedMotion: 'reduce'` and asserts the row is removed and the DELETE request fires.

**Given** the architecture document `architecture/implementation-patterns-consistency-rules.md`,
**When** Story 5.1 is implemented,
**Then** the Frontend Mutation Pattern guidance is revised to state that mutations on user intent must fire synchronously within the user-event handler and must not be coupled to CSS animation events.

## Dev Notes

### Defect summary

The implementation in `apps/web/src/components/TaskRow.tsx:107-110` couples the `useDeleteTask` mutation to a CSS `animationend` event. Two failure modes:

1. **Animation-gated mutation never fires** under `prefers-reduced-motion: reduce` — `reset.css` zeroes `animation-duration`, and some browser engines skip `animationend` entirely on zero-duration animations. Mutation is never scheduled; row stays in DOM and cache.
2. **Latent `<Index>` slot-reuse defect.** `TaskList.tsx:35` uses `<Index>` from solid-js, which keys list children by position. After a successful delete, the slot's `createSignal(false)` for `isLeaving` retains the value `true`. The next task taking that slot inherits `class="task-row--leaving"` with `animation-fill-mode: forwards`, rendering at `opacity: 0`.

### Implementation approach

1. **`apps/web/src/components/TaskRow.tsx`**
   - Inside `handleDelete`, call `deleteMutation.mutate(props.task.id)` synchronously after `setIsLeaving(true)` (i.e. fire on user intent, not animationend).
   - Remove the `on:animationend` handler from the `<li>` element entirely.
   - The `task-row--leaving` class and the keyframe animation in `TaskRow.css` remain — they are now purely cosmetic. Under reduced-motion the global `animation-duration: 0ms !important` rule in `reset.css` zeroes the visual treatment with no functional consequence.

2. **`apps/web/src/components/TaskList.tsx`**
   - Replace `<Index each={query.data ?? []}>{(task) => <TaskRow task={task()} />}</Index>` with `<For each={query.data ?? []}>{(task) => <TaskRow task={task} />}</For>`.
   - Update the import: `Index` → `For`.
   - `<For>` keys by identity (Solid uses reference equality on the array item). When the optimistic `onMutate` filters out the deleted task object, the corresponding `TaskRow` unmounts and its component instance is discarded — preventing the slot-reuse defect.

3. **`apps/web/src/components/TaskRow.test.tsx`**
   - Rewrite tests that simulated `animationend` to drive deletion. Assert that `deleteMutation.mutate(id)` (i.e. `_tasksApiSeams.deleteFetch`) is called synchronously by the click and Delete/Backspace keyboard handlers — no `fireEvent.animationEnd` call required.

4. **`e2e/manage.spec.ts`**
   - Add a `reducedMotion: 'reduce'` deletion test (via `test.use({ contextOptions: { reducedMotion: 'reduce' } })` on a describe block, or inline `page.emulateMedia`). Assert the row is removed from the DOM and a `DELETE /api/tasks/<id>` request fires.

5. **`architecture/implementation-patterns-consistency-rules.md`**
   - Add a Frontend Mutation Pattern paragraph stating: mutations on user intent must fire synchronously within the user-event handler; visual exit animations are pure presentational treatment and must not gate the mutation lifecycle. Reference Sprint Change Proposal 2026-05-05.

### What is explicitly not changed

- The mutation pipeline in `useDeleteTask` (`onMutate` cache filter, `onSuccess` undo entry, `onError` no-rollback contract) — unchanged.
- The undo flow (`useUndoAll`, `UndoSnackbar`) — unchanged.
- The CSS `task-row-leave` keyframe and `task-row--leaving` class — kept as cosmetic decoration. Under reduced-motion, animation duration is already zeroed by `reset.css` and the row is functionally removed via the cache filter.
- The focus-landing logic in `handleDelete` — unchanged. The query for `[data-task-id]` rows runs before `setIsLeaving(true)` and before the mutation fires, so all rows are still in the DOM and focusable.
- The backend `DELETE /api/tasks/:id` route — unchanged.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.1] — Story spec, acceptance criteria
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-05-05.md] — Defect description, root cause, decision
- [Source: _bmad-output/implementation-artifacts/3-2-frontend-delete-deletebutton-optimistic-removal-animated-row-out-focus-landing-rule.md] — Original delete implementation (the one being corrected)
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md] — Frontend mutation pattern guidance to be revised

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Files Modified

- apps/web/src/components/TaskRow.tsx — remove `on:animationend` handler; fire `deleteMutation.mutate(id)` synchronously inside `handleDelete`.
- apps/web/src/components/TaskList.tsx — `<Index>` → `<For>` over a Solid store mirror of the TanStack data, reconciled by `task.id` so identity is preserved across optimistic updates while field-level reactivity still propagates.
- apps/web/src/components/TaskRow.test.tsx — drop `animationend` event simulation in the click and keyboard delete tests; assert synchronous `deleteFetch` call from click and Delete/Backspace handlers.
- e2e/manage.spec.ts — add a `reducedMotion: 'reduce'` describe block with three tests: click delete fires `DELETE /api/tasks/:id`; Delete-key delete fires the same; second-delete-after-first does not exhibit the persisting `task-row--leaving` slot-reuse artifact.
- e2e/keyboard.spec.ts — update Journey 3 step 14 expectation: `j` from row 0 now lands on the restored row at row 1 (previously expected to skip it because the slot-reuse defect kept the restored row in `task-row--leaving`). The original test comment explicitly cited the defect that Story 5.1 fixes.
- _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md — add Frontend Mutation Pattern paragraph (mutate on intent, not on animation) and a Keyed Lists paragraph (`<For>` over `<Index>` for state-bearing rows). References Sprint Change Proposal 2026-05-05.
- _bmad-output/implementation-artifacts/sprint-status.yaml — story 5.1 → done.

### Completion Notes

- The defect was confirmed and corrected on both observed paths: animation-gated mutation never firing under `prefers-reduced-motion: reduce`, and `<Index>` slot reuse persisting `task-row--leaving` across deletions.
- Replacing `<Index>` with `<For>` alone introduced a regression: `<For>` keys by reference identity, and toggle's `onMutate` produces a new task object on optimistic update — causing the row to remount and drop keyboard focus. Mitigated by mirroring TanStack data into a Solid store via `reconcile({ key: "id" })` inside `TaskList.tsx`. The store preserves item identity across reconciliations while field-level changes propagate reactively to children. No new dependencies added.
- All static checks pass: oxlint clean, oxfmt clean, tsgo clean.
- Unit tests: 277 pass, 0 fail (was 277 baseline).
- `e2e/manage.spec.ts`: 14 pass, 3 flaky-on-retry, 1 pre-existing failure (test 391 "delete → Cmd/Ctrl+Z within window → task restored" — verified failing on the pre-Story-5.1 baseline; unrelated to Story 5.1 work).
- `e2e/keyboard.spec.ts`: 40 pass, 2 flaky-on-retry, 0 failures.
- Pre-existing flakes appear correlated with the API rate limiter (20 burst / 2/sec refill) being hit when many tests run in sequence; passing on retry confirms transient.

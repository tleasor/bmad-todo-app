# Epic 3 Pre-Epic Notes

Architectural decisions and prep context for Story authors. Reference these before writing Story 3.x dev notes.

---

## Decision: Restore-at-Original-Position Snapshot Strategy (Story 3.4)

**Problem:** Epic 3's UndoSnackbar restores a deleted task at its original list position. The undo action fires up to 5 seconds after a successful delete — well after TanStack Query's mutation context has been cleaned up. The current `onSuccess`-discard policy (used in toggle) does not support snapshot retention past mutation lifecycle.

**Decision: `deleteUndoStore` — a dedicated module-level store that survives past mutation lifecycle**

Pattern mirrors `captureSyncStore` / `toggleSyncStore`.

```ts
// apps/web/src/data/deleteUndoStore.ts
type DeleteUndoEntry = {
  task: Task;
  index: number;        // original array index at time of deletion
};

// keyed by task ID; holds the snapshot until undo fires or 5s window expires
const [entries, setEntries] = createStore<Record<string, DeleteUndoEntry | undefined>>({});
```

**Lifecycle in `useDeleteTask`:**

1. `onMutate(input)`:
   - Read `queryClient.getQueryData<Task[]>(tasksQueryKey)` — shallow copy
   - Find `index = prev.findIndex(t => t.id === input.id)`
   - Capture `deletedTask = prev[index]`
   - Apply optimistic removal via `setQueryData` (`.filter(t => t.id !== input.id)`)
   - Store snapshot locally in closure: `{ deletedTask, index }` — do NOT write to `deleteUndoStore` yet

2. `onSuccess(_data, input, context)`:
   - Delete confirmed by server → write to `deleteUndoStore`: `setEntry(input.id, { task: context.deletedTask, index: context.index })`
   - Start 5s dismiss timer; on expiry, `clearEntry(input.id)`
   - Trigger UndoSnackbar visibility

3. `onError(_error, input, context)`:
   - Roll back optimistic removal: re-insert `context.deletedTask` at `context.index` via `setQueryData`
   - Do NOT write to `deleteUndoStore` (no undo for a failed delete)

**Undo execution (Cmd/Ctrl+Z handler or Snackbar button click):**

```ts
const handleUndo = (taskId: string) => {
  const entry = deleteUndoStorePeek(taskId);
  if (!entry) return;
  clearEntry(taskId);
  cancelDismissTimer(taskId);
  // Re-insert at original position
  queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
    if (!prev) return prev;
    const list = [...prev];
    list.splice(entry.index, 0, entry.task);
    return list;
  });
  // Fire restore API call (POST /api/tasks with the original task ID and text)
  restoreMutation.mutate({ id: entry.task.id, text: entry.task.text });
};
```

**Concurrent-delete collapsing (multiple deletes within 5s window):**

- Each delete writes its own entry to `deleteUndoStore` keyed by task ID
- UndoSnackbar counts `Object.values(entries).filter(Boolean).length`
- If count > 1, snackbar shows "Deleted N tasks — Undo"
- Undo-all fires `handleUndo` for every active entry
- The 5s timer resets on each new delete (collapse the window)

**Why not TanStack Query context alone?**
TanStack Query's mutation context (`onMutate` return value) is passed to `onSuccess`/`onError` but is not accessible outside the mutation callbacks. The UndoSnackbar and Cmd+Z handler live outside the mutation — they need to query the snapshot on demand. A module-level store is the correct pattern here.

**Why not the query cache?**
We could store deleted tasks as a separate query key (e.g., `["tasks", "deleted"]`). But that mixes deleted state into the query layer, complicates cache invalidation, and has no precedent in this codebase. The sync store pattern is simpler and consistent.

---

## Pre-Epic-3 Items from Deferred Work

These `[pre-epic-3]` items from `deferred-work.md` must be addressed in the relevant story:

| Story | Item |
|-------|------|
| 3.1 | `apps/api/src/storage/tasks.ts:60-73` — "INSERT OR IGNORE no-op + row no longer exists" becomes real once DELETE exists. Story 3.1 must decide: document the invariant or guard the `create()` path against re-insertion of a deleted ID. |
| 3.1 | E2E fixture-reset: implement a test-mode `DELETE /api/tasks` bulk endpoint (or equivalent reset hook) to clear DB between Playwright runs. Multiple E2E tests in `capture.spec.ts`, `empty-error-states.spec.ts`, and `manage.spec.ts` depend on this. |
| 3.1 | `two captures land newest-first` test needs `waitForListSettled` guard once fixture-reset is available. |
| 3.2 | `pendingToggleTimers` not cleaned on unmount: when a row is deleted mid-toggle, the pending timer fires and writes to `toggleSyncStore` for a dead task ID. Story 3.2 must either guard the timer callback (`if task still in cache`) or wire a cleanup signal from the delete mutation. |

---

## Notes for Story 3.4 (UndoSnackbar)

Story 3.4 is the most complex story in Epic 3. Key design constraints:

1. **No new dependencies** — the snackbar animation uses `motion.medium` (CSS var), not a third-party animation library.
2. **Concurrent-delete collapsing** — the snackbar must observe all active `deleteUndoStore` entries, not just the most recent.
3. **Platform detection for Cmd/Ctrl+Z** — `navigator.platform.includes("Mac")` is the standard check; `"Mac"` for Cmd, otherwise Ctrl.
4. **5s window enforcement** — the Cmd+Z handler must ignore the keystroke if `Object.values(deleteUndoStore).every(e => !e)` (no active undo entries).
5. **Restore-at-original-position** — splice at captured index, not prepend. If two tasks are undone, restore both at their original indices (process from highest index to lowest to avoid shifting).
6. **LiveRegion announcements** — "Task deleted. Undo available." on delete; "Task restored." on undo; platform-specific shortcut copy in the announce string.

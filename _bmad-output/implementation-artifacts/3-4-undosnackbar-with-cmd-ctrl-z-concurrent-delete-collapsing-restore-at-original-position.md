# Story 3.4: UndoSnackbar with Cmd/Ctrl+Z, Concurrent-Delete Collapsing, Restore-at-Original-Position

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a 5-second window to undo any delete via a visible snackbar or Cmd/Ctrl+Z,
so that an accidental delete is reversible without confirmation dialogs that would break the keyboard flow.

## Acceptance Criteria

1. **UndoSnackbar appears on delete** — When any delete mutation fires (click or keyboard), `UndoSnackbar` appears at bottom-center on desktop / bottom of content column on mobile (UX-DR11). It renders `"Task deleted"` plus an `Undo` button. It has `role="status"` and `aria-live="polite"`. The Undo button is a `<button>` with the spec'd focus ring applied. Auto-dismisses after 5 seconds.

2. **Cmd/Ctrl+Z within the 5-second window** — On macOS, `Cmd+Z` fires the same undo action as clicking the Undo button. On all other platforms, `Ctrl+Z` does. After the 5-second window expires, Cmd/Ctrl+Z is a no-op (no active undo entries in `deleteUndoStore`). Platform detection happens once at component mount, not per keystroke.

3. **Undo restores task at original list position** — When undo executes (via button or shortcut): the deleted task is re-inserted at its original `index` in the query cache (not prepended to the top); a fresh `POST /api/tasks` fires with the original task's `{ id, text }` (`INSERT OR IGNORE` semantics); the UndoSnackbar dismisses immediately; focus lands on the restored `TaskRow`.

4. **Concurrent-delete collapsing** — Rapid successive deletes within the 5-second window cause the snackbar to collapse to `"N tasks deleted"` with a single Undo. Clicking Undo (or Cmd/Ctrl+Z) restores **all** collapsed deletes at their original positions in one operation, preserving their original ordering relative to each other. The 5-second window resets (single shared timer restarts) on each new delete.

5. **LiveRegion announcements** — When concurrent delete count > 1, the LiveRegion announces `"N tasks deleted"` (e.g. `"2 tasks deleted"`). When undo executes, the LiveRegion announces `"Task restored"`.

6. **`useDeleteTask` rollback on error** — If a delete mutation fails, the optimistic removal is rolled back: the deleted task is re-inserted at its original `index` via `setQueryData`. The `deleteUndoStore` is NOT written (no undo for a failed delete).

7. **`e2e/manage.spec.ts`** — New `test.describe("manage tasks — undo snackbar")` block:
   - delete → snackbar appears → click Undo within window → task restored at original position
   - delete → wait 6 s → snackbar is gone → Cmd/Ctrl+Z is a no-op (deleted task stays gone)
   - concurrent deletes → single snackbar reads `"N tasks deleted"` → single Undo restores all
   - axe-core reports zero critical violations on the snackbar (NFR-A2)

8. **Quality gates pass** — `bun run check` and `bun run check:full` pass: oxlint zero warnings, oxfmt clean, tsgo `-b --noEmit` clean, dep-count unchanged (web 17/25), all tests pass, coverage ≥ 70%.

## Tasks / Subtasks

- [x] **Task 1 — Create `apps/web/src/data/deleteUndoStore.ts`** (AC: #3, #4, #6)
  - [x] Mirror the `captureSyncStore.ts` pattern: `createStore<Record<string, DeleteUndoEntry | undefined>>({})`
  - [x] Export `type DeleteUndoEntry = { task: Task; index: number }`
  - [x] Export reactive read `deleteUndoStoreEntries` (the store proxy — for reactive component use)
  - [x] Export non-reactive peek `deleteUndoStorePeek(id: string): DeleteUndoEntry | undefined`
  - [x] Export `deleteUndoStoreCount(): number` (counts non-undefined entries — for concurrent check)
  - [x] Export `__deleteUndoMutators = { setEntry, clearEntry, clearAll }`
  - [x] Export `__resetDeleteUndoStoreForTests` using `reconcile({})` (same pattern as `__resetCaptureSyncStoreForTests`)

- [x] **Task 2 — Update `apps/web/src/constants.ts`** (AC: #1, #4)
  - [x] Add `export const UNDO_WINDOW_MS = 5_000;`

- [x] **Task 3 — Update `apps/web/src/data/announcements.ts`** (AC: #5)
  - [x] Add `export const LIVE_REGION_TASK_RESTORED = "Task restored";`
  - [x] Add `export const liveRegionNTasksDeleted = (n: number): string => \`${n} tasks deleted\`;`

- [x] **Task 4 — Refactor `useDeleteTask` in `apps/web/src/data/queries.ts`** (AC: #3, #4, #5, #6)
  - [x] Define `type DeleteContext = { deletedTask: Task; index: number }` at module scope (after existing type aliases)
  - [x] Add module-level `let undoCollapseTimer: ReturnType<typeof setTimeout> | undefined;`
  - [x] Add `export const __clearUndoCollapseTimerForTests = (): void => { if (undoCollapseTimer !== undefined) clearTimeout(undoCollapseTimer); undoCollapseTimer = undefined; };`
  - [x] Change `useDeleteTask` return type to `UseMutationResult<void, Error, string, DeleteContext>`
  - [x] In `onMutate(id)`: before `setQueryData`, read `prev = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? []`, capture `index = prev.findIndex(t => t.id === id)` and `deletedTask = prev[index]`, then apply `setQueryData` filter, then return `{ deletedTask, index }` from `onMutate`
  - [x] In `onSuccess(_data, input, context)`: write `__deleteUndoMutators.setEntry(input, { task: context.deletedTask, index: context.index })`, cancel+restart `undoCollapseTimer` (reset to UNDO_WINDOW_MS), on timer fire: `__deleteUndoMutators.clearAll()`, then check `const count = deleteUndoStoreCount(); if (count > 1) announce(liveRegionNTasksDeleted(count));`
  - [x] In `onError(_error, _input, context)`: roll back optimistic removal by re-inserting `context.deletedTask` at `context.index` via `setQueryData` splice; do NOT write to store
  - [x] Import `deleteUndoStoreCount, __deleteUndoMutators` from `./deleteUndoStore`
  - [x] Import `LIVE_REGION_TASK_RESTORED, liveRegionNTasksDeleted` from `./announcements`
  - [x] Import `UNDO_WINDOW_MS` from `../constants`

- [x] **Task 5 — Add `useUndoAll` hook in `apps/web/src/data/queries.ts`** (AC: #3, #4, #5)
  - [x] Export `useUndoAll(): () => void` — a factory hook that returns a `handleUndo` function
  - [x] Inside the hook: call `useQueryClient()`, call `useMutation` for the restore API call (`mutationKey: ["tasks", "undo"]`, `mutationFn: (input: TasksPostBody) => tasksApi.create(input)`, `onSuccess: () => queryClient.invalidateQueries({ queryKey: tasksQueryKey })`, `onError: () => undefined` — silent failure)
  - [x] The returned `handleUndo` function:
    1. Collect `entriesToRestore` from `deleteUndoStoreEntries` — filter for non-undefined, sort **descending by index** (highest index first to avoid splice shifting)
    2. If `entriesToRestore.length === 0`, return early (no-op)
    3. Cancel `undoCollapseTimer` (`__clearUndoCollapseTimerForTests` pattern — but call the timer directly or export a cancel fn)
    4. Call `__deleteUndoMutators.clearAll()`
    5. `queryClient.setQueryData<Task[]>(tasksQueryKey, prev => { if (!prev) return prev; const list = [...prev]; for (const e of entriesToRestore) list.splice(e.index, 0, e.task); return list; })`
    6. Announce `LIVE_REGION_TASK_RESTORED`
    7. Focus lowest-original-index task: `setTimeout(() => { const id = entriesToRestore[entriesToRestore.length - 1].task.id; (document.querySelector(\`[data-task-id="${id}"]\`) as HTMLElement | null)?.focus(); }, 0)`
    8. Fire restore mutation for each entry: `entriesToRestore.forEach(e => undoMutation.mutate({ id: e.task.id, text: e.task.text }))`
  - [x] **IMPORTANT**: `undoCollapseTimer` is module-level — `useUndoAll` must cancel it directly (not via a test-only export)

- [x] **Task 6 — Create `apps/web/src/components/UndoSnackbar.tsx`** (AC: #1, #2, #4)
  - [x] Import `deleteUndoStoreEntries, deleteUndoStoreCount` from `../data/deleteUndoStore`
  - [x] Import `useUndoAll` from `../data/queries`
  - [x] The component reads `deleteUndoStoreCount()` reactively; when `count === 0` render nothing (`<Show when={count() > 0}>`)
  - [x] When visible: render `<div role="status" aria-live="polite" class="undo-snackbar">` with text `count() === 1 ? "Task deleted" : \`${count()} tasks deleted\`` and `<button type="button" class="undo-snackbar__button" onClick={handleUndo}>Undo</button>`
  - [x] Call `handleUndo = useUndoAll()` at the top of the component
  - [x] The component is purely reactive — it shows/hides based on store count; no internal timer logic
  - [x] Import `./UndoSnackbar.css` for positioning styles
  - [x] Use named export: `export function UndoSnackbar(): JSX.Element`

- [x] **Task 7 — Create `apps/web/src/components/UndoSnackbar.css`** (AC: #1)
  - [x] `.undo-snackbar { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); background: var(--color-bg-inverse); color: var(--color-text-inverse); border-radius: var(--radius-md); box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15)); z-index: 100; white-space: nowrap; }`
  - [x] `.undo-snackbar__button { background: transparent; border: 1px solid currentColor; border-radius: var(--radius-sm); color: inherit; cursor: pointer; font-weight: 600; padding: var(--space-1) var(--space-3); }`
  - [x] `.undo-snackbar__button:focus-visible { outline: 2px solid var(--color-accent-default); outline-offset: 2px; }`
  - [x] `@media (prefers-reduced-motion: no-preference) { .undo-snackbar { animation: snackbar-in var(--motion-short) ease-out; } @keyframes snackbar-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } } }`

- [x] **Task 8 — Update `apps/web/src/App.tsx`** (AC: #2)
  - [x] Import `UndoSnackbar` from `./components/UndoSnackbar`
  - [x] Import `useUndoAll` from `./data/queries`
  - [x] Inside `App()`: call `const handleUndo = useUndoAll()`
  - [x] Add a `onMount`/`onCleanup` global `keydown` listener: detect `isMac` once (same pattern as `queries.ts` — read `navigator.platform` at effect time), fire `handleUndo()` when `(isMac ? e.metaKey : e.ctrlKey) && e.key === "z"`
  - [x] Return updated JSX that renders `<UndoSnackbar />` as a sibling inside `<main class="app-shell">` after `<TaskList />`
  - [x] **IMPORTANT**: `handleUndo()` is a no-op when `deleteUndoStoreCount() === 0` (already guarded in `useUndoAll`) — so the global listener is safe to fire on any Cmd/Ctrl+Z

- [x] **Task 9 — Add unit tests for `deleteUndoStore.ts`** — file: `apps/web/src/data/deleteUndoStore.test.ts`
  - [x] `it("setEntry stores an entry by id")`
  - [x] `it("clearEntry removes an entry")`
  - [x] `it("clearAll removes all entries")`
  - [x] `it("deleteUndoStoreCount returns correct count")`
  - [x] `__resetDeleteUndoStoreForTests` in `afterEach`

- [x] **Task 10 — Add unit tests for `UndoSnackbar.tsx`** — file: `apps/web/src/components/UndoSnackbar.test.tsx`
  - [x] Render inside `QueryClientProvider` with test `QueryClient`
  - [x] `it("renders nothing when deleteUndoStore is empty")`
  - [x] `it("renders 'Task deleted' and Undo button for single entry")`
  - [x] `it("renders 'N tasks deleted' for multiple entries")`
  - [x] `it("clicking Undo calls handleUndo (clears store)")`
  - [x] `__resetDeleteUndoStoreForTests` in `afterEach`
  - [x] Use `@solidjs/testing-library` render pattern (see `TaskRow.test.tsx`)

- [x] **Task 11 — Update `queries.test.tsx` for new `useDeleteTask` behavior** (AC: #3, #4, #5, #6)
  - [x] Add `__resetDeleteUndoStoreForTests`, `__clearUndoCollapseTimerForTests` imports to `afterEach` cleanup
  - [x] Add test: `"onMutate stores DeleteContext snapshot (deletedTask + index)"` — seed two tasks in cache, fire delete on task at index 0, assert context has correct task and `index: 0`
  - [x] Add test: `"onSuccess writes to deleteUndoStore"`
  - [x] Add test: `"onError rolls back optimistic removal at original index"`
  - [x] Add test: `"onSuccess: announces N tasks deleted when count > 1"` — write one entry to store directly, then fire a second delete `onSuccess`, check live region history contains `"2 tasks deleted"`
  - [x] Preserve ALL existing `useDeleteTask` tests (announcement tests from Story 3.3 must still pass)

- [x] **Task 12 — Add E2E tests to `e2e/manage.spec.ts`** (AC: #7)
  - [x] Add `test.describe("manage tasks — undo snackbar")` block:
    - `"delete → snackbar appears → click Undo → task restored at original position"` — add 2 tasks (A, B; newest-first B, A), delete B, assert snackbar visible with "Task deleted", click Undo, assert B is back and appears at index 0, assert A is at index 1
    - `"delete → 5s window expires → Cmd/Ctrl+Z is a no-op"` — add 1 task, delete it, wait 6 s (`await page.waitForTimeout(6000)`), press `Ctrl+Z` (or `Meta+Z` on mac), assert task does NOT reappear
    - `"concurrent deletes → snackbar collapses → single Undo restores all"` — add 3 tasks, delete 2 rapidly, assert snackbar reads "2 tasks deleted", click Undo, assert both tasks restored
    - `"axe-core reports no critical violations with snackbar visible"` — add task, delete it, wait for snackbar, run AxeBuilder, filter critical/serious, assert empty

- [x] **Task 13 — Quality gate verification** (AC: #8)
  - [x] Run `bun run check` — oxlint ✓, oxfmt ✓, tsgo clean ✓, dep-count web 17/25 ✓
  - [x] Run `bun run check:full` — all tests pass, coverage ≥ 70%, audit clean, build clean

## Dev Notes

### This Story Is the Most Complex in Epic 3

Story 3.4 introduces three new architectural elements:
1. `deleteUndoStore.ts` — a new module-level reactive store (new file)
2. `UndoSnackbar.tsx` — a new fixed-position overlay component (new file)
3. Significant refactor of `useDeleteTask` — adding context return, `onSuccess` store write, `onError` rollback

The Cmd/Ctrl+Z handler lives in `App.tsx` and the Undo button click handler lives in `UndoSnackbar.tsx`. Both share the same `useUndoAll` hook from `queries.ts`.

### The `deleteUndoStore.ts` — Exact Pattern

Mirror `captureSyncStore.ts` exactly. Use `createStore` from `"solid-js/store"`.

```ts
// apps/web/src/data/deleteUndoStore.ts
import { createStore, reconcile } from "solid-js/store";
import type { Task } from "./api";

export type DeleteUndoEntry = {
  task: Task;
  index: number;
};

const [entries, setEntries] = createStore<Record<string, DeleteUndoEntry | undefined>>({});

export const deleteUndoStoreEntries = entries;

export const deleteUndoStorePeek = (id: string): DeleteUndoEntry | undefined => entries[id];

export const deleteUndoStoreCount = (): number =>
  Object.values(entries).filter((e) => e !== undefined).length;

export const __deleteUndoMutators = {
  setEntry: (id: string, entry: DeleteUndoEntry): void => setEntries(id, entry),
  clearEntry: (id: string): void => setEntries(id, undefined),
  clearAll: (): void => setEntries(reconcile({})),
};

export const __resetDeleteUndoStoreForTests = (): void => {
  setEntries(reconcile({}));
};
```

**Note:** `clearAll` uses `reconcile({})` (same as reset) to clear all entries atomically. This triggers a single Solid reactive update.

### The Updated `useDeleteTask` — Exact Shape

The current type is `UseMutationResult<void, Error, string, void>`. After this story: `UseMutationResult<void, Error, string, DeleteContext>`.

```ts
type DeleteContext = { deletedTask: Task; index: number };

// Module-level timer (alongside pendingTimers, pendingToggleTimers)
let undoCollapseTimer: ReturnType<typeof setTimeout> | undefined;

export const __clearUndoCollapseTimerForTests = (): void => {
  if (undoCollapseTimer !== undefined) clearTimeout(undoCollapseTimer);
  undoCollapseTimer = undefined;
};

export const useDeleteTask = (): UseMutationResult<void, Error, string, DeleteContext> => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, DeleteContext>(() => ({
    mutationKey: ["tasks", "delete"],
    mutationFn: (id: string) => tasksApi.delete(id),
    retry: computeRetryDecision,
    retryDelay: computeRetryDelay,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const prev = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [];
      const index = prev.findIndex((t) => t.id === id);
      const deletedTask = prev[index] ?? ({ id, text: "", completed: false, createdAt: 0, updatedAt: 0 } as Task);
      queryClient.setQueryData<Task[]>(tasksQueryKey, (p) => p?.filter((t) => t.id !== id));
      // Existing announcement logic (Story 3.3) stays UNCHANGED:
      if (!firstDeleteAnnouncementSent) {
        firstDeleteAnnouncementSent = true;
        announce(isMac ? LIVE_REGION_TASK_DELETED_UNDO_MAC : LIVE_REGION_TASK_DELETED_UNDO_OTHER);
      } else {
        announce(LIVE_REGION_TASK_DELETED);
      }
      return { deletedTask, index };
    },
    onSuccess: (_data, input, context) => {
      if (context) {
        __deleteUndoMutators.setEntry(input, { task: context.deletedTask, index: context.index });
      }
      // Reset the shared collapse timer on every successful delete
      if (undoCollapseTimer !== undefined) clearTimeout(undoCollapseTimer);
      undoCollapseTimer = setTimeout(() => {
        __deleteUndoMutators.clearAll();
        undoCollapseTimer = undefined;
      }, UNDO_WINDOW_MS);
      // Announce concurrent collapse count (fires AFTER store write, so count includes this delete)
      const count = deleteUndoStoreCount();
      if (count > 1) {
        announce(liveRegionNTasksDeleted(count));
      }
    },
    onError: (_error, _input, context) => {
      // Roll back optimistic removal — task still exists on server
      if (context) {
        queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
          if (!prev) return prev;
          const list = [...prev];
          list.splice(context.index, 0, context.deletedTask);
          return list;
        });
      }
    },
  }));
};
```

**Breaking change from Story 3.2/3.3**: `onError` now rolls back (previously `() => undefined`). This is intentional per pre-epic architectural notes. A failed delete means the task still lives on the server — the user must see it again.

### The `useUndoAll` Hook — Exact Shape

```ts
export const useUndoAll = (): (() => void) => {
  const queryClient = useQueryClient();
  const undoMutation = useMutation<Task, Error, TasksPostBody, void>(() => ({
    mutationKey: ["tasks", "undo"],
    mutationFn: (input) => tasksApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksQueryKey });
    },
    onError: () => undefined,
  }));

  return () => {
    const entriesToRestore = Object.entries(deleteUndoStoreEntries)
      .filter((entry): entry is [string, DeleteUndoEntry] => entry[1] !== undefined)
      .map(([, e]) => e)
      .sort((a, b) => b.index - a.index); // highest index first to avoid splice shifting

    if (entriesToRestore.length === 0) return;

    // Cancel the auto-dismiss timer
    if (undoCollapseTimer !== undefined) {
      clearTimeout(undoCollapseTimer);
      undoCollapseTimer = undefined;
    }

    // Clear all undo entries
    __deleteUndoMutators.clearAll();

    // Optimistic restore at original positions (process highest index first)
    queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
      if (!prev) return prev;
      const list = [...prev];
      for (const entry of entriesToRestore) {
        list.splice(entry.index, 0, entry.task);
      }
      return list;
    });

    // Announce
    announce(LIVE_REGION_TASK_RESTORED);

    // Focus the task that was originally at the lowest index (last in sorted array)
    setTimeout(() => {
      const id = entriesToRestore[entriesToRestore.length - 1].task.id;
      (document.querySelector(`[data-task-id="${id}"]`) as HTMLElement | null)?.focus();
    }, 0);

    // Fire restore API calls (INSERT OR IGNORE — idempotent)
    for (const entry of entriesToRestore) {
      undoMutation.mutate({ id: entry.task.id, text: entry.task.text });
    }
  };
};
```

**Why `useUndoAll` accesses `undoCollapseTimer` directly**: The timer is module-level in `queries.ts`. Both `useDeleteTask` (which sets it) and `useUndoAll` (which cancels it) live in the same module, so direct access is clean. No need to export a cancel function.

### The Updated `App.tsx` — Exact Shape

```tsx
import { onCleanup, onMount, type JSX } from "solid-js";
import { UndoSnackbar } from "./components/UndoSnackbar";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";
import { useCreateTask, useUndoAll } from "./data/queries";
import { createUuidV7 } from "./data/uuid";

export function App(): JSX.Element {
  const createTask = useCreateTask();
  const handleUndo = useUndoAll();

  const isMac = /mac/i.test(navigator.platform);

  const handleKeyDown = (e: KeyboardEvent): void => {
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      handleUndo();
    }
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  const handleTaskSubmit = (text: string): void => {
    createTask.mutate({ id: createUuidV7(), text });
  };

  return (
    <main class="app-shell">
      <TaskInput onSubmit={handleTaskSubmit} />
      <TaskList />
      <UndoSnackbar />
    </main>
  );
}
```

**`navigator.platform` guard**: No `typeof navigator !== "undefined"` check needed here since `App` only renders client-side. But follow the existing pattern in `queries.ts` if you want consistency — it won't break either way.

### `UndoSnackbar.tsx` — Exact Shape

```tsx
import { createMemo, Show, type JSX } from "solid-js";
import { deleteUndoStoreEntries } from "../data/deleteUndoStore";
import { useUndoAll } from "../data/queries";
import "./UndoSnackbar.css";

export function UndoSnackbar(): JSX.Element {
  const handleUndo = useUndoAll();
  const count = createMemo(() =>
    Object.values(deleteUndoStoreEntries).filter((e) => e !== undefined).length,
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

**Why `createMemo`**: `deleteUndoStoreEntries` is a Solid store proxy — accessing `Object.values(deleteUndoStoreEntries)` inside `createMemo` makes this reactive. Every time the store changes, `count()` recomputes. This drives `<Show when={count() > 0}>` visibility.

**Why `useUndoAll()` is called twice** (once in `App.tsx`, once in `UndoSnackbar.tsx`): Each call to `useUndoAll` creates its own `useMutation` instance. Both closures close over the same module-level `undoCollapseTimer` and `deleteUndoStoreEntries`. So both `handleUndo` functions will correctly cancel the timer and fire undo. This is the correct Solid/TanStack pattern — hooks are called per component instance.

### CSS Token Reference

Look at `TaskRow.css` for token names actually used in this codebase. Key tokens likely available:
- `var(--space-1)`, `var(--space-2)`, `var(--space-3)`, `var(--space-4)` — spacing
- `var(--radius-sm)`, `var(--radius-md)` — border radius
- `var(--motion-short)` — 120ms ease-out transition
- `var(--color-accent-default)` — accent color for focus ring
- `var(--color-text-muted)` — muted text

For snackbar background/text, since there's no `--color-bg-inverse` token defined (the codebase uses a minimal token set), consider using a dark/neutral color. Check `apps/web/src/styles/tokens.css` first. If no inverse tokens exist, use a neutral dark (e.g., `#1a1a1a` / `#f5f5f5` for text) or `var(--color-bg-surface)` with `var(--color-text-primary)` and a strong border. Make sure the snackbar has sufficient contrast for both light and dark themes (the app honors `prefers-color-scheme`).

### Anti-Patterns to Avoid

- **Do NOT** add a new npm dependency for the snackbar animation — use CSS `@keyframes` only
- **Do NOT** use `export default` — named exports only (ARCH-AR18)
- **Do NOT** destructure SolidJS component props — always access as `props.foo`
- **Do NOT** add a per-task dismiss timer — there is ONE shared `undoCollapseTimer` that resets on each new delete
- **Do NOT** write to `deleteUndoStore` in `onMutate` — write only in `onSuccess` (after server confirms)
- **Do NOT** write to `deleteUndoStore` in `onError` — failed deletes get no undo affordance
- **Do NOT** call `tasksApi.create` directly in `useUndoAll` — use `useMutation` so TanStack tracks the mutation state
- **Do NOT** use `useCreateTask` for the undo API call — it adds sync indicators and "Saving…" announcements that don't belong in the undo path
- **Do NOT** add `UndoSnackbar` to `TaskList.tsx` — it belongs in `App.tsx` (architecture specifies it)
- **Do NOT** call `announce(LIVE_REGION_TASK_DELETED)` in `useUndoAll` — the LiveRegion already has "Task deleted" in its queue from `useDeleteTask.onMutate`; only announce restored
- **Do NOT** attempt to test `deleteUndoStoreCount()` without calling `__resetDeleteUndoStoreForTests` in `afterEach` — module state leaks between tests

### Files Being Modified — Current State

**`apps/web/src/data/queries.ts`** (244 lines):
- Currently ends with `useDeleteTask` at lines 223–244, `UseMutationResult<void, Error, string, void>`
- `onMutate` currently: cancel queries, filter cache, announce. Does NOT return context.
- `onSuccess: () => undefined`
- `onError: () => undefined`
- New imports needed: `UNDO_WINDOW_MS` from `../constants`, `deleteUndoStoreCount, __deleteUndoMutators, deleteUndoStoreEntries` from `./deleteUndoStore`, `LIVE_REGION_TASK_RESTORED, liveRegionNTasksDeleted` from `./announcements`, `TasksPostBody` type (already imported via `api.ts`)

**`apps/web/src/App.tsx`** (18 lines):
- Currently imports: `TaskInput`, `TaskList`, `useCreateTask`, `createUuidV7`
- New imports: `UndoSnackbar`, `useUndoAll`, `onCleanup`, `onMount` from `"solid-js"`

**`apps/web/src/data/announcements.ts`** (17 lines):
- Add 2 new exports at end of file

**`apps/web/src/constants.ts`** (12 lines):
- Add `UNDO_WINDOW_MS = 5_000` after existing constants

**`e2e/manage.spec.ts`** (208 lines):
- Add new `test.describe("manage tasks — undo snackbar")` block after the existing delete describe
- The `addTask` helper and `waitForListSettled` helper already exist — reuse them

### Test Count and Coverage Baseline

- **Baseline:** 236 tests passing after Story 3.3. Coverage 97.33%.
- **Expected additions:**
  - 4–5 unit tests in `deleteUndoStore.test.ts`
  - 4–5 unit tests in `UndoSnackbar.test.tsx`
  - 4–5 new tests in `queries.test.tsx` for updated `useDeleteTask`
  - 4 E2E tests in `manage.spec.ts`
- **Expected total:** ~248–251 passing unit tests.
- No coverage regression expected — new branches exercised by new tests.

### Key Integration: `deleteUndoStore` is NOT a hook

`deleteUndoStoreEntries` is a Solid store — a reactive proxy. It is module-level state, not component state. Components that read from it (via `createMemo` or direct access in reactive context) will automatically re-render when the store changes. **No hook wrapping needed** — direct import and access is the correct pattern, exactly like `captureSyncStore.ts` with `useCaptureSyncStatus`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.4] — user story, acceptance criteria, UX-DR11, UX-DR13, UX-DR14, UX-DR15
- [Source: _bmad-output/planning-artifacts/epic-3-pre-epic-notes.md] — `deleteUndoStore` architecture, `DeleteContext` lifecycle in `useDeleteTask`, timer strategy, concurrent-collapse details, restore-at-original-position splice order
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR11] — UndoSnackbar: bottom-center, "Task deleted" + Undo, role="status", aria-live="polite", 5s auto-dismiss, concurrent collapse
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR13] — after-undo focus lands on restored TaskRow
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR14] — undo restores at original position, not top
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR15] — delete is immediate; undo via snackbar/Cmd+Z for 5s window; concurrent collapse
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#FR10] — `useDeleteTask`, `useUndoDelete` in `data/queries.ts`; `UndoSnackbar.tsx` in `components/`; Cmd/Ctrl+Z handler in `App.tsx`
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Module-Conventions] — named exports only; no `export default`; `createStore` for reactive state
- [Source: _bmad-output/implementation-artifacts/3-3-keyboard-delete-delete-and-backspace-on-focused-row-liveregion-announcements.md] — announcement patterns; `firstDeleteAnnouncementSent`; test baseline 236/97.33%; `__resetFirstDeleteAnnouncementForTests`; `__setIsMacForTests`
- [Source: _bmad-output/implementation-artifacts/3-2-frontend-delete-deletebutton-optimistic-removal-animated-row-out-focus-landing-rule.md] — `handleDelete()` in TaskRow; `deleteMutation.mutate`; `data-task-id` attribute for DOM focus targeting
- [Source: apps/web/src/data/captureSyncStore.ts] — exact store pattern to mirror for `deleteUndoStore.ts`
- [Source: apps/web/src/data/queries.ts] — current `useDeleteTask` (lines 223–244); module-level state pattern; existing `__reset*ForTests` exports
- [Source: apps/web/src/App.tsx] — current 18-line structure to update

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `deleteUndoStore.ts` mirroring the `captureSyncStore.ts` pattern with `createStore`, `DeleteUndoEntry` type, reactive proxy export, peek/count/mutators/reset exports.
- Added `UNDO_WINDOW_MS = 5_000` to `constants.ts`.
- Added `LIVE_REGION_TASK_RESTORED` and `liveRegionNTasksDeleted` to `announcements.ts`.
- Refactored `useDeleteTask` in `queries.ts`: added `DeleteContext` type + `undoCollapseTimer` module-level state; `onMutate` now captures task+index and returns `DeleteContext`; `onSuccess` writes to store and manages shared collapse timer; `onError` rolls back optimistic removal at original index.
- Added `useUndoAll` hook in `queries.ts`: restores all entries sorted descending by index (to avoid splice shifting), cancels timer, clears store, updates query cache optimistically, announces restored, focuses lowest-index task, fires POST for each entry.
- Created `UndoSnackbar.tsx` with reactive `createMemo` for count, `Show` for visibility, `role="status" aria-live="polite"`, singular/plural text, Undo button.
- Created `UndoSnackbar.css` with fixed positioning, dark/light theme handling (no inverse tokens in codebase, used explicit hex), focus ring, and `@keyframes snackbar-in` animation.
- Updated `App.tsx`: added `useUndoAll` call, global `keydown` listener with Mac/non-Mac platform detection, `onMount`/`onCleanup` lifecycle, `<UndoSnackbar />` in JSX.
- Added 4 unit tests in `deleteUndoStore.test.ts`; 4 unit tests in `UndoSnackbar.test.tsx`; 4 new `useDeleteTask` tests in `queries.test.tsx` (onMutate snapshot, onSuccess store write, onError rollback, concurrent count announcement).
- Added 4 E2E tests in `manage.spec.ts` covering snackbar visibility/undo, window expiry no-op, concurrent collapse, and axe-core.
- All 251 unit tests pass; coverage 97.99%; `bun run check` and `bun run check:full` pass.

### File List

apps/web/src/data/deleteUndoStore.ts (new)
apps/web/src/data/deleteUndoStore.test.ts (new)
apps/web/src/components/UndoSnackbar.tsx (new)
apps/web/src/components/UndoSnackbar.css (new)
apps/web/src/components/UndoSnackbar.test.tsx (new)
apps/web/src/constants.ts (modified)
apps/web/src/data/announcements.ts (modified)
apps/web/src/data/queries.ts (modified)
apps/web/src/data/queries.test.tsx (modified)
apps/web/src/App.tsx (modified)
e2e/manage.spec.ts (modified)

## Change Log

- 2026-05-01: Story implemented — UndoSnackbar with Cmd/Ctrl+Z, concurrent-delete collapsing, and restore-at-original-position. New files: deleteUndoStore.ts, UndoSnackbar.tsx, UndoSnackbar.css, and their test files. Modified: constants.ts, announcements.ts, queries.ts, queries.test.tsx, App.tsx, manage.spec.ts. 251 unit tests pass, coverage 97.99%.

### Review Findings

- [x] [Review][Patch] Splice order bug: sequential deletes produce wrong restore positions [apps/web/src/data/queries.ts — useUndoAll]
- [x] [Review][Patch] `index === -1` fallback: phantom task written to store; `splice(-1, 0, task)` inserts before last element instead of first [apps/web/src/data/queries.ts — useDeleteTask onMutate/onError]
- [x] [Review][Patch] `firstDeleteAnnouncementSent` never reset when 5-second window expires; post-expiry deletes announce plain "Task deleted" instead of the undo hint [apps/web/src/data/queries.ts — useDeleteTask onSuccess]
- [x] [Review][Patch] Missing E2E test for Cmd/Ctrl+Z within the active undo window (AC2 requires it; only tested after expiry as no-op) [e2e/manage.spec.ts]
- [x] [Review][Patch] `navigator.platform` accessed without `typeof navigator !== "undefined"` guard in App.tsx, unlike the existing guard in queries.ts [apps/web/src/App.tsx:12]
- [x] [Review][Patch] N `invalidateQueries` calls on multi-task undo cause N list refetches and a focus race with the `setTimeout(0)` focus attempt [apps/web/src/data/queries.ts — useUndoAll]
- [x] [Review][Defer] Timer expiry + slow-completing delete: snackbar unexpectedly resurrects if DELETE API takes >5 s and onSuccess fires after clearAll [apps/web/src/data/queries.ts — onSuccess] — deferred, requires redesign to fix cleanly
- [x] [Review][Defer] `navigator.platform` is deprecated (pre-existing pattern from Story 3.3, already noted in deferred-work.md) [apps/web/src/data/queries.ts:46] — deferred, pre-existing
- [x] [Review][Defer] E2E test uses 6-second `page.waitForTimeout(6000)`, slowing CI by at least 6 s per run [e2e/manage.spec.ts] — deferred, acceptable for current scope

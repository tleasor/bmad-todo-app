import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/solid-query";
import { announce } from "../components/LiveRegion";
import {
  RETRY_429_MAX_ATTEMPTS,
  RETRY_5XX_MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_MAX_MS,
  RETRY_MAX_DELAY_MS,
  SYNC_PENDING_DELAY_MS,
  UNDO_WINDOW_MS,
} from "../constants";
import {
  LIVE_REGION_RETRY_EXHAUSTED,
  LIVE_REGION_SAVED,
  LIVE_REGION_SAVING,
  LIVE_REGION_TASK_DELETED,
  LIVE_REGION_TASK_DELETED_UNDO_MAC,
  LIVE_REGION_TASK_DELETED_UNDO_OTHER,
  LIVE_REGION_TASK_RESTORED,
  liveRegionNTasksDeleted,
} from "./announcements";
import { TasksApiError, tasksApi, type Task, type TasksPostBody } from "./api";
import { __captureSyncMutators, __captureSyncStorePeek } from "./captureSyncStore";
import {
  __deleteUndoMutators,
  deleteUndoStoreCount,
  deleteUndoStoreEntries,
  type DeleteUndoEntry,
} from "./deleteUndoStore";
import { __toggleSyncMutators, __toggleSyncStorePeek } from "./toggleSyncStore";
import { tasksQueryKey } from "./keys";

type CreateTaskContext = { previous: Task[] };
type DeleteContext = { deletedTask: Task | undefined; index: number };

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingToggleTimers = new Map<string, ReturnType<typeof setTimeout>>();
let undoCollapseTimer: ReturnType<typeof setTimeout> | undefined;

let isMac: boolean =
  typeof navigator !== "undefined" &&
  /mac/i.test(
    (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
      navigator.platform,
  );

let firstDeleteAnnouncementSent = false;

export const __resetFirstDeleteAnnouncementForTests = (): void => {
  firstDeleteAnnouncementSent = false;
};

export const __setIsMacForTests = (val: boolean): void => {
  isMac = val;
};

export const __clearTogglePendingTimersForTests = (): void => {
  for (const timer of pendingToggleTimers.values()) clearTimeout(timer);
  pendingToggleTimers.clear();
};

export const __clearUndoCollapseTimerForTests = (): void => {
  if (undoCollapseTimer !== undefined) clearTimeout(undoCollapseTimer);
  undoCollapseTimer = undefined;
};

const clearTogglePendingTimer = (id: string): void => {
  const timer = pendingToggleTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  pendingToggleTimers.delete(id);
};

export const clearTogglePendingTimerForTask = (id: string): void => clearTogglePendingTimer(id);

type ToggleTaskInput = { id: string; completed: boolean };

export const computeRetryDecision = (failureCount: number, error: unknown): boolean => {
  if (error instanceof TasksApiError) {
    if (error.status === 429) return failureCount < RETRY_429_MAX_ATTEMPTS;
    if (error.status >= 500 && error.status < 600) return failureCount < RETRY_5XX_MAX_ATTEMPTS;
    return false;
  }
  // Network errors / null-data: treat as transient 5xx.
  return failureCount < RETRY_5XX_MAX_ATTEMPTS;
};

export const computeRetryDelay = (attempt: number, error: unknown): number => {
  const exponential = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MAX_MS,
    RETRY_MAX_DELAY_MS,
  );
  if (error instanceof TasksApiError && error.status === 429 && error.retryAfterMs !== undefined) {
    return Math.min(Math.max(error.retryAfterMs, exponential), RETRY_MAX_DELAY_MS);
  }
  return exponential;
};

const clearPendingTimer = (id: string): void => {
  const timer = pendingTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  pendingTimers.delete(id);
};

export const __clearPendingTimersForTests = (): void => {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
};

export const useTasks = (): UseQueryResult<Task[], Error> =>
  useQuery<Task[], Error, Task[], typeof tasksQueryKey>(() => ({
    queryKey: tasksQueryKey,
    queryFn: () => tasksApi.list(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2,
  }));

export const useToggleTask = (): UseMutationResult<Task, Error, ToggleTaskInput, void> => {
  const queryClient = useQueryClient();
  // eslint-disable-next-line prefer-const
  let observer: UseMutationResult<Task, Error, ToggleTaskInput, void>;
  observer = useMutation<Task, Error, ToggleTaskInput, void>(() => ({
    mutationKey: ["tasks", "toggle"],
    mutationFn: (input) => tasksApi.toggle(input),
    retry: computeRetryDecision,
    retryDelay: computeRetryDelay,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const now = Date.now();
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
        if (!prev) return prev;
        return prev.map((t) =>
          t.id === input.id ? { ...t, completed: input.completed, updatedAt: now } : t,
        );
      });
      const retry = (): void => {
        observer.mutate(input);
      };
      clearTogglePendingTimer(input.id);
      const timer = setTimeout(() => {
        if (pendingToggleTimers.get(input.id) === timer) {
          const wasAlreadyPending = __toggleSyncStorePeek(input.id)?.status === "pending";
          __toggleSyncMutators.markPending(input.id, retry);
          if (!wasAlreadyPending) announce(LIVE_REGION_SAVING);
        }
      }, SYNC_PENDING_DELAY_MS);
      pendingToggleTimers.set(input.id, timer);
    },
    onSuccess: (data, input) => {
      clearTogglePendingTimer(input.id);
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) =>
        prev ? prev.map((t) => (t.id === input.id ? data : t)) : prev,
      );
      const wasPending = __toggleSyncStorePeek(input.id)?.status === "pending";
      __toggleSyncMutators.clear(input.id);
      if (wasPending) announce(LIVE_REGION_SAVED);
    },
    onError: (_error, input) => {
      clearTogglePendingTimer(input.id);
      const retry = (): void => {
        observer.mutate(input);
      };
      __toggleSyncMutators.markExhausted(input.id, retry);
      announce(LIVE_REGION_RETRY_EXHAUSTED);
      // No cache rollback — FR27 / UX-DR16: optimistic toggle stays in place.
    },
  }));
  return observer;
};

export const useCreateTask = (): UseMutationResult<
  Task,
  Error,
  TasksPostBody,
  CreateTaskContext
> => {
  const queryClient = useQueryClient();
  // The `observer` reference is captured before `useMutation` returns so the
  // retry closure (built inside `onMutate` / `onError`) can call
  // `observer.reset()` + `observer.mutate(input)` to re-fire the full
  // mutation lifecycle on the same input — preserving the optimistic row.
  // eslint-disable-next-line prefer-const
  let observer: UseMutationResult<Task, Error, TasksPostBody, CreateTaskContext>;
  observer = useMutation<Task, Error, TasksPostBody, CreateTaskContext>(() => ({
    mutationKey: ["tasks", "create"],
    mutationFn: (input) => tasksApi.create(input),
    retry: computeRetryDecision,
    retryDelay: computeRetryDelay,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      // shallow copy: prevent live-reference rollback hazards in future mutation hooks (Stories 2.2 / 3.2)
      const previous = [...(queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [])];
      const now = Date.now();
      const optimistic: Task = {
        id: input.id,
        text: input.text,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
        const list = prev ?? [];
        if (list.some((task) => task.id === input.id)) return list;
        return [optimistic, ...list];
      });
      const retry = (): void => {
        observer.mutate(input);
      };
      clearPendingTimer(input.id);
      const timer = setTimeout(() => {
        __captureSyncMutators.markPending(input.id, retry);
        announce(LIVE_REGION_SAVING);
      }, SYNC_PENDING_DELAY_MS);
      pendingTimers.set(input.id, timer);
      return { previous };
    },
    onSuccess: (_data, input) => {
      clearPendingTimer(input.id);
      const wasPending = __captureSyncStorePeek(input.id)?.status === "pending";
      __captureSyncMutators.clear(input.id);
      if (wasPending) announce(LIVE_REGION_SAVED);
    },
    onError: (_error, input) => {
      clearPendingTimer(input.id);
      const retry = (): void => {
        observer.mutate(input);
      };
      __captureSyncMutators.markExhausted(input.id, retry);
      announce(LIVE_REGION_RETRY_EXHAUSTED);
      // No setQueryData rollback — the no-rollback contract from Story 1.8 / FR27 is preserved.
    },
  }));
  return observer;
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
      const safeIndex = Math.max(0, index);
      const deletedTask = prev[index];
      queryClient.setQueryData<Task[]>(tasksQueryKey, (p) => p?.filter((t) => t.id !== id));
      if (!firstDeleteAnnouncementSent) {
        firstDeleteAnnouncementSent = true;
        announce(isMac ? LIVE_REGION_TASK_DELETED_UNDO_MAC : LIVE_REGION_TASK_DELETED_UNDO_OTHER);
      } else {
        announce(LIVE_REGION_TASK_DELETED);
      }
      return { deletedTask, index: safeIndex };
    },
    onSuccess: (_data, input, context) => {
      if (context?.deletedTask) {
        const { deletedTask, index } = context;
        __deleteUndoMutators.setEntry(input, { task: deletedTask, index, deletedAt: Date.now() });
      }
      if (undoCollapseTimer !== undefined) clearTimeout(undoCollapseTimer);
      undoCollapseTimer = setTimeout(() => {
        __deleteUndoMutators.clearAll();
        firstDeleteAnnouncementSent = false;
        undoCollapseTimer = undefined;
      }, UNDO_WINDOW_MS);
      const count = deleteUndoStoreCount();
      if (count > 1) {
        announce(liveRegionNTasksDeleted(count));
      }
    },
    onError: (_error, _input, context) => {
      if (context?.deletedTask) {
        const { deletedTask, index } = context;
        queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
          if (!prev) return prev;
          const list = [...prev];
          list.splice(index, 0, deletedTask);
          return list;
        });
      }
    },
  }));
};

export const useUndoAll = (): (() => void) => {
  const queryClient = useQueryClient();
  const undoMutation = useMutation<Task, Error, TasksPostBody, void>(() => ({
    mutationKey: ["tasks", "undo"],
    mutationFn: (input) => tasksApi.create(input),
    onSuccess: () => undefined,
    onError: () => undefined,
  }));

  return () => {
    // Sort ascending by index, break ties by deletion time (earliest first).
    // This ensures correct splice positions when multiple items share the same
    // captured index (which happens when deletions compound on the cached list).
    const entriesToRestore = Object.entries(deleteUndoStoreEntries)
      .filter((entry): entry is [string, DeleteUndoEntry] => entry[1] !== undefined)
      .map(([, e]) => e)
      .sort((a, b) => a.index - b.index || a.deletedAt - b.deletedAt);

    if (entriesToRestore.length === 0) return;

    if (undoCollapseTimer !== undefined) {
      clearTimeout(undoCollapseTimer);
      undoCollapseTimer = undefined;
    }

    __deleteUndoMutators.clearAll();

    // Splice ascending with offset i to account for each prior insertion shifting indices.
    queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => {
      if (!prev) return prev;
      const list = [...prev];
      entriesToRestore.forEach((entry, i) => {
        list.splice(entry.index + i, 0, entry.task);
      });
      return list;
    });

    announce(LIVE_REGION_TASK_RESTORED);

    // Focus the task at the lowest original index (first in ascending sort).
    setTimeout(() => {
      const id = entriesToRestore[0].task.id;
      (document.querySelector(`[data-task-id="${id}"]`) as HTMLElement | null)?.focus();
    }, 0);

    // Fire all restore API calls concurrently; invalidate once after all settle.
    void Promise.allSettled(
      entriesToRestore.map((entry) =>
        undoMutation.mutateAsync({ id: entry.task.id, text: entry.task.text }),
      ),
    ).then(() => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey });
    });
  };
};

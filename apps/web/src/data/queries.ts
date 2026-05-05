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
} from "../constants";
import {
  LIVE_REGION_RETRY_EXHAUSTED,
  LIVE_REGION_SAVED,
  LIVE_REGION_SAVING,
} from "./announcements";
import { TasksApiError, tasksApi, type Task, type TasksPostBody } from "./api";
import { __captureSyncMutators, __captureSyncStorePeek } from "./captureSyncStore";
import { tasksQueryKey } from "./keys";

type CreateTaskContext = { previous: Task[] };

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

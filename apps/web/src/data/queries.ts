import { useQuery, type UseQueryResult } from "@tanstack/solid-query";
import { tasksApi, type Task } from "./api";
import { tasksQueryKey } from "./keys";

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

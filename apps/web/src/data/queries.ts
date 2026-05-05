import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/solid-query";
import { tasksApi, type Task, type TasksPostBody } from "./api";
import { tasksQueryKey } from "./keys";

type CreateTaskContext = { previous: Task[] };

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
  return useMutation<Task, Error, TasksPostBody, CreateTaskContext>(() => ({
    mutationFn: (input) => tasksApi.create(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [];
      const now = Date.now();
      const optimistic: Task = {
        id: input.id,
        text: input.text,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => [optimistic, ...(prev ?? [])]);
      return { previous };
    },
  }));
};

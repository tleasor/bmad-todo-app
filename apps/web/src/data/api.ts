import { treaty } from "@elysiajs/eden";
import type { App, Task } from "@bmad-todo-app/api";

export const api = treaty<App>("/");

export type { Task };

export type TasksGetResponse = {
  data: Task[] | null;
  error: { status: number; value: unknown } | null;
};

// Cast pinpoints the /api/tasks GET handler. Eden's inferred type for `api.api`
// is a union with the `/api/*` 404 catch-all in apps/api/src/index.ts, which
// hides the nested `tasks` accessor from TypeScript even though the runtime
// proxy resolves it correctly.
const tasksGet = (): Promise<TasksGetResponse> =>
  (api.api as unknown as { tasks: { get: () => Promise<TasksGetResponse> } }).tasks.get();

export const tasksApi = {
  // `fetch` is the raw Eden seam — exposed as a writable property so tests can
  // stub the envelope shape and exercise `list`'s envelope-parsing logic for real.
  fetch: tasksGet,
  list: async (): Promise<Task[]> => {
    const { data, error } = await tasksApi.fetch();
    if (error) {
      const envelopeMessage = (error.value as { error?: { message?: string } } | undefined)?.error
        ?.message;
      throw new Error(envelopeMessage ?? `tasks fetch failed: HTTP ${error.status}`);
    }
    if (data === null) {
      throw new Error("tasks fetch returned null data");
    }
    return data;
  },
};

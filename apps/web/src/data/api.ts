import { treaty } from "@elysiajs/eden";
import type { App, Task } from "@bmad-todo-app/api";

// Eden treats the first arg as a hostname and prepends `https://` unless the
// string already contains `://`. Passing the current page origin keeps every
// request on the same scheme/host the SPA was loaded from — in dev that's
// :5173 (Vite proxies /api/* to :3000); in prod it's the API origin that
// served the SPA. Passing a path like `"/"` or `""` short-circuits to a
// malformed URL (`https://api/tasks`) and breaks every request.
export const api = treaty<App>(globalThis.location?.origin ?? "http://localhost");

export type { Task };

export type TasksGetResponse = {
  data: Task[] | null;
  error: { status: number; value: unknown } | null;
};

export type TasksPostBody = { id: string; text: string };

export type TasksPostResponse = {
  data: Task | null;
  error: { status: number; value: unknown } | null;
};

// Cast pinpoints the /api/tasks GET and POST handlers. Eden's inferred type for
// `api.api` is a union with the `/api/*` 404 catch-all in apps/api/src/index.ts,
// which hides the nested `tasks` accessors from TypeScript even though the
// runtime proxy resolves them correctly.
type TasksApiSurface = {
  tasks: {
    get: () => Promise<TasksGetResponse>;
    post: (body: TasksPostBody) => Promise<TasksPostResponse>;
  };
};

const tasksGet = (): Promise<TasksGetResponse> =>
  (api.api as unknown as TasksApiSurface).tasks.get();

const tasksPost = (body: TasksPostBody): Promise<TasksPostResponse> =>
  (api.api as unknown as TasksApiSurface).tasks.post(body);

export const tasksApi = {
  // `fetch` / `createFetch` are the raw Eden seams — exposed as writable
  // properties so tests can stub the envelope shape and exercise the
  // envelope-parsing logic in `list` / `create` for real.
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
  createFetch: tasksPost,
  create: async (input: TasksPostBody): Promise<Task> => {
    const { data, error } = await tasksApi.createFetch(input);
    if (error) {
      const envelopeMessage = (error.value as { error?: { message?: string } } | undefined)?.error
        ?.message;
      throw new Error(envelopeMessage ?? `tasks create failed: HTTP ${error.status}`);
    }
    if (data === null) {
      throw new Error("tasks create returned null data");
    }
    return data;
  },
};

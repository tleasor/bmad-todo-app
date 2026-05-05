import { treaty } from "@elysiajs/eden";
import type { App, Task } from "@bmad-todo-app/api";
import { parseRetryAfter } from "./retryAfter";

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
  response?: Response;
};

export type TasksPostBody = { id: string; text: string };

export type TasksPostResponse = {
  data: Task | null;
  error: { status: number; value: unknown } | null;
  response?: Response;
};

export interface TasksApiErrorArgs {
  status: number;
  message: string;
  code?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

// Typed error carrying the HTTP status, the closed-union ErrorCode (when present),
// and an optional `retryAfterMs` parsed from the response's `Retry-After` header.
// Consumed by `useCreateTask`'s retry policy to discriminate fail-fast 4xx from
// retry-eligible 429 / 5xx.
export class TasksApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly retryAfterMs?: number;

  constructor(args: TasksApiErrorArgs) {
    super(args.message, args.cause !== undefined ? { cause: args.cause } : undefined);
    this.name = "TasksApiError";
    this.status = args.status;
    this.code = args.code;
    this.retryAfterMs = args.retryAfterMs;
  }
}

// Cast pinpoints the /api/tasks GET and POST handlers. Eden's inferred type for
// `api.api` is a union with the `/api/*` 404 catch-all in apps/api/src/index.ts,
// which hides the nested `tasks` accessors from TypeScript even though the
// runtime proxy resolves them correctly. Eden Treaty exposes the raw `Response`
// on the result object so the wrapper can read headers (e.g. `Retry-After`).
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

const readEnvelopeMessage = (value: unknown): string | undefined =>
  (value as { error?: { message?: string } } | undefined)?.error?.message;

const readEnvelopeCode = (value: unknown): string | undefined =>
  (value as { error?: { code?: string } } | undefined)?.error?.code;

export const tasksApi = {
  // `fetch` / `createFetch` are the raw Eden seams — exposed as writable
  // properties so tests can stub the envelope shape and exercise the
  // envelope-parsing logic in `list` / `create` for real.
  fetch: tasksGet,
  list: async (): Promise<Task[]> => {
    const { data, error } = await tasksApi.fetch();
    if (error) {
      const message =
        readEnvelopeMessage(error.value) ?? `tasks fetch failed: HTTP ${error.status}`;
      throw new TasksApiError({
        status: error.status,
        message,
        code: readEnvelopeCode(error.value),
      });
    }
    if (data === null) {
      throw new Error("tasks fetch returned null data");
    }
    return data;
  },
  createFetch: tasksPost,
  create: async (input: TasksPostBody): Promise<Task> => {
    const { data, error, response } = await tasksApi.createFetch(input);
    if (error) {
      const message =
        readEnvelopeMessage(error.value) ?? `tasks create failed: HTTP ${error.status}`;
      const retryAfterMs =
        error.status === 429
          ? parseRetryAfter(response?.headers.get("retry-after") ?? null)
          : undefined;
      throw new TasksApiError({
        status: error.status,
        message,
        code: readEnvelopeCode(error.value),
        retryAfterMs,
      });
    }
    if (data === null) {
      throw new Error("tasks create returned null data");
    }
    return data;
  },
};

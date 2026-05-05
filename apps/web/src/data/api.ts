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

export type TasksPatchBody = { completed: boolean };

export type TasksPatchResponse = {
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

// Cast pinpoints the /api/tasks GET, POST, and PATCH handlers. Eden's inferred type for
// `api.api` is a union with the `/api/*` 404 catch-all in apps/api/src/index.ts,
// which hides the nested `tasks` accessors from TypeScript even though the
// runtime proxy resolves them correctly. Eden Treaty exposes the raw `Response`
// on the result object so the wrapper can read headers (e.g. `Retry-After`).
// TypeScript allows a type to have both property signatures and call signatures
// on the same interface — this models Eden Treaty's dynamic segment pattern.
type TasksApiSurface = {
  tasks: {
    get: () => Promise<TasksGetResponse>;
    post: (body: TasksPostBody) => Promise<TasksPostResponse>;
    (params: { id: string }): {
      patch: (body: TasksPatchBody) => Promise<TasksPatchResponse>;
    };
  };
};

const tasksGet = (): Promise<TasksGetResponse> =>
  (api.api as unknown as TasksApiSurface).tasks.get();

const tasksPost = (body: TasksPostBody): Promise<TasksPostResponse> =>
  (api.api as unknown as TasksApiSurface).tasks.post(body);

const tasksPatch = (id: string, body: TasksPatchBody): Promise<TasksPatchResponse> =>
  (api.api as unknown as TasksApiSurface).tasks({ id }).patch(body);

const readEnvelopeMessage = (value: unknown): string | undefined =>
  (value as { error?: { message?: string } } | undefined)?.error?.message;

const readEnvelopeCode = (value: unknown): string | undefined =>
  (value as { error?: { code?: string } } | undefined)?.error?.code;

// Dedicated seam object for testing: swap individual fetchers in beforeEach/afterEach
// without mutating the public tasksApi. Production code must not write to this object.
export const _tasksApiSeams = {
  fetch: tasksGet,
  createFetch: tasksPost,
  patchFetch: tasksPatch,
};

export const tasksApi = {
  toggle: async (input: { id: string; completed: boolean }): Promise<Task> => {
    const { data, error, response } = await _tasksApiSeams.patchFetch(input.id, {
      completed: input.completed,
    });
    if (error) {
      const message =
        readEnvelopeMessage(error.value) ?? `tasks toggle failed: HTTP ${error.status}`;
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
      throw new Error("tasks toggle returned null data");
    }
    if (typeof data.id !== "string" || typeof data.completed !== "boolean") {
      throw new Error("tasks toggle: response body is not a valid Task");
    }
    return data;
  },
  list: async (): Promise<Task[]> => {
    const { data, error } = await _tasksApiSeams.fetch();
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
    if (!Array.isArray(data)) {
      throw new Error("tasks fetch: response body is not an array");
    }
    return data;
  },
  create: async (input: TasksPostBody): Promise<Task> => {
    const { data, error, response } = await _tasksApiSeams.createFetch(input);
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
    if (typeof data.id !== "string" || typeof data.text !== "string") {
      throw new Error("tasks create: response body is not a valid Task");
    }
    return data;
  },
};

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, type JSX } from "solid-js";
import { tasksApi, type Task, type TasksGetResponse } from "./api";
import { tasksQueryKey } from "./keys";
import { useTasks } from "./queries";

afterEach(() => {
  cleanup();
});

const mockTask = (overrides: Partial<Task> = {}): Task => ({
  id: "0193f000-0000-7000-8000-000000000000",
  text: "",
  completed: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const makeClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });

const renderWithClient = (client: QueryClient, ui: () => JSX.Element): ReturnType<typeof render> =>
  render(() => <QueryClientProvider client={client}>{ui()}</QueryClientProvider>);

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const waitFor = async <T,>(check: () => T | undefined, timeoutMs = 1000): Promise<T> => {
  const start = Date.now();
  let value = check();
  while (value === undefined) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await yieldToEventLoop();
    value = check();
  }
  return value;
};

describe("useTasks", () => {
  let originalFetch: typeof tasksApi.fetch;

  beforeEach(() => {
    originalFetch = tasksApi.fetch;
  });

  afterEach(() => {
    tasksApi.fetch = originalFetch;
  });

  it("registers the architecture-locked tasks-query options against the queryClient cache", async () => {
    tasksApi.fetch = mock(
      (): Promise<TasksGetResponse> => Promise.resolve({ data: [], error: null }),
    );
    const client = makeClient();
    const Probe = (): JSX.Element => {
      useTasks();
      return <div data-testid="probe" />;
    };
    renderWithClient(client, () => <Probe />);

    const cached = await waitFor(() => client.getQueryCache().find({ queryKey: tasksQueryKey }));
    const options = cached.options as {
      staleTime?: number;
      gcTime?: number;
      refetchOnWindowFocus?: boolean;
      refetchOnReconnect?: boolean;
      retry?: number | boolean;
      queryKey?: readonly unknown[];
    };
    expect(options.staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(options.gcTime).toBe(Number.POSITIVE_INFINITY);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchOnReconnect).toBe(true);
    expect(options.retry).toBe(2);
    expect(options.queryKey).toEqual(tasksQueryKey);
  });

  it("resolves data() to the task array Eden returns on a successful envelope", async () => {
    const tasks: Task[] = [
      mockTask({ id: "0193f000-0000-7000-8000-000000000002", text: "two" }),
      mockTask({ id: "0193f000-0000-7000-8000-000000000001", text: "one" }),
    ];
    tasksApi.fetch = mock(
      (): Promise<TasksGetResponse> => Promise.resolve({ data: tasks, error: null }),
    );
    const client = makeClient();
    let snapshot: { data: Task[] | undefined; error: Error | null } = {
      data: undefined,
      error: null,
    };
    const Probe = (): JSX.Element => {
      const query = useTasks();
      createEffect(() => {
        snapshot = { data: query.data, error: query.error };
      });
      return <div data-testid="probe" />;
    };
    renderWithClient(client, () => <Probe />);

    await waitFor(() => (snapshot.data && snapshot.data.length > 0 ? snapshot.data : undefined));
    expect(snapshot.data).toEqual(tasks);
    expect(snapshot.error).toBeNull();
  });

  it("surfaces the envelope error.message via TanStack's error state on a non-null Eden error envelope", async () => {
    tasksApi.fetch = mock(
      (): Promise<TasksGetResponse> =>
        Promise.resolve({
          data: null,
          error: {
            status: 500,
            value: { error: { code: "internal_error", message: "boom" } },
          },
        }),
    );
    const client = makeClient();
    let snapshot: { isError: boolean; error: Error | null } = {
      isError: false,
      error: null,
    };
    const Probe = (): JSX.Element => {
      const query = useTasks();
      createEffect(() => {
        snapshot = { isError: query.isError, error: query.error };
      });
      return <div data-testid="probe" />;
    };
    renderWithClient(client, () => <Probe />);

    await waitFor(() => (snapshot.isError ? true : undefined));
    expect(snapshot.isError).toBe(true);
    expect(snapshot.error?.message).toContain("boom");
  });
});

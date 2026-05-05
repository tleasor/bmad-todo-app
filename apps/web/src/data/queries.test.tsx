import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, type JSX } from "solid-js";
import { tasksApi, type Task, type TasksGetResponse } from "./api";
import { tasksQueryKey } from "./keys";
import { useCreateTask, useTasks } from "./queries";

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

const makeMutationClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retryDelay: 0 },
      mutations: { retry: false },
    },
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

describe("useCreateTask", () => {
  let originalCreate: typeof tasksApi.create;
  let originalCreateFetch: typeof tasksApi.createFetch;

  beforeEach(() => {
    originalCreate = tasksApi.create;
    originalCreateFetch = tasksApi.createFetch;
  });

  afterEach(() => {
    tasksApi.create = originalCreate;
    tasksApi.createFetch = originalCreateFetch;
  });

  const renderProbe = (
    client: QueryClient,
  ): { mutation: () => ReturnType<typeof useCreateTask> } => {
    let captured: ReturnType<typeof useCreateTask> | undefined;
    const Probe = (): JSX.Element => {
      captured = useCreateTask();
      return <div data-testid="probe" />;
    };
    renderWithClient(client, () => <Probe />);
    return {
      mutation: () => {
        if (!captured) {
          throw new Error("Probe did not capture the mutation observer");
        }
        return captured;
      },
    };
  };

  it("prepends an optimistic row to the tasks cache when mutate is called", async () => {
    const existing = mockTask({ id: "0193f000-0000-7000-8000-000000000001", text: "existing" });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    tasksApi.create = mock((): Promise<Task> => new Promise<Task>(() => {}));

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: "0193f000-0000-7000-8000-00000000000a", text: "new" });

    const cached = await waitFor(() => {
      const value = client.getQueryData<Task[]>(tasksQueryKey);
      return value && value.length === 2 ? value : undefined;
    });
    expect(cached).toHaveLength(2);
    expect(cached[0].id).toBe("0193f000-0000-7000-8000-00000000000a");
    expect(cached[0].text).toBe("new");
    expect(cached[0].completed).toBe(false);
    expect(cached[1]).toEqual(existing);
  });

  it("calls tasksApi.create with the mutate variables", async () => {
    const serverTask = mockTask({
      id: "0193f000-0000-7000-8000-00000000000b",
      text: "submitted",
    });
    const createMock = mock(
      (_input: { id: string; text: string }): Promise<Task> => Promise.resolve(serverTask),
    );
    tasksApi.create = createMock;
    const client = makeMutationClient();

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: "0193f000-0000-7000-8000-00000000000b", text: "submitted" });

    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    expect(createMock.mock.calls).toHaveLength(1);
    expect(createMock.mock.calls[0]?.[0]).toEqual({
      id: "0193f000-0000-7000-8000-00000000000b",
      text: "submitted",
    });
  });

  it("does not invalidate the tasks query on success", async () => {
    const serverTask = mockTask({
      id: "0193f000-0000-7000-8000-00000000000c",
      text: "no-invalidate",
    });
    tasksApi.create = mock((): Promise<Task> => Promise.resolve(serverTask));
    const client = makeMutationClient();
    const invalidateMock = mock(() => Promise.resolve());
    client.invalidateQueries = invalidateMock as unknown as typeof client.invalidateQueries;

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: "0193f000-0000-7000-8000-00000000000c", text: "no-invalidate" });

    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    expect(invalidateMock.mock.calls).toHaveLength(0);
  });

  it("does not roll back the optimistic prepend when the mutation errors", async () => {
    const existing = mockTask({ id: "0193f000-0000-7000-8000-000000000001", text: "existing" });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    tasksApi.create = mock((): Promise<Task> => Promise.reject(new Error("network")));

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: "0193f000-0000-7000-8000-00000000000d", text: "stays" });

    await waitFor(() => (probe.mutation().isError ? true : undefined));
    const cached = client.getQueryData<Task[]>(tasksQueryKey);
    expect(cached).toHaveLength(2);
    expect(cached?.[0]?.id).toBe("0193f000-0000-7000-8000-00000000000d");
    expect(cached?.[0]?.text).toBe("stays");
    expect(cached?.[1]).toEqual(existing);
  });

  it("cancels in-flight tasks queries before invoking mutationFn", async () => {
    const serverTask = mockTask({
      id: "0193f000-0000-7000-8000-00000000000e",
      text: "ordered",
    });
    const client = makeMutationClient();
    const cancelMock = mock((_filters: { queryKey: readonly unknown[] }) => Promise.resolve());
    client.cancelQueries = cancelMock as unknown as typeof client.cancelQueries;

    let capturedCancelCount = -1;
    tasksApi.create = mock((): Promise<Task> => {
      capturedCancelCount = cancelMock.mock.calls.length;
      return Promise.resolve(serverTask);
    });

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: "0193f000-0000-7000-8000-00000000000e", text: "ordered" });

    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    expect(capturedCancelCount).toBe(1);
    expect(cancelMock.mock.calls[0]?.[0]).toEqual({ queryKey: tasksQueryKey });
  });
});

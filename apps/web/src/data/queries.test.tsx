import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@solidjs/testing-library";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, type JSX } from "solid-js";
import {
  LIVE_REGION_DRAIN_INTERVAL_MS,
  RETRY_429_MAX_ATTEMPTS,
  RETRY_5XX_MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from "../constants";
import {
  __getLiveRegionHistoryForTests,
  __resetLiveRegionForTests,
  LiveRegion,
} from "../components/LiveRegion";
import {
  LIVE_REGION_RETRY_EXHAUSTED,
  LIVE_REGION_SAVED,
  LIVE_REGION_SAVING,
} from "./announcements";
import { TasksApiError, tasksApi, type Task, type TasksGetResponse } from "./api";
import { __captureSyncStorePeek, __resetCaptureSyncStoreForTests } from "./captureSyncStore";
import { tasksQueryKey } from "./keys";
import {
  __clearPendingTimersForTests,
  computeRetryDecision,
  computeRetryDelay,
  useCreateTask,
  useTasks,
} from "./queries";

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
    // The reconnect test toggles onlineManager.setOnline(false). If that test
    // throws between the offline call and its final setOnline(true), the
    // singleton would remain offline and pause every subsequent query. Always
    // restore online state in afterEach so cross-test leakage is impossible.
    onlineManager.setOnline(true);
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

  it("auto-refetches and clears the error state when the network transitions back to online (refetchOnReconnect contract)", async () => {
    // useTasks locks retry: 2, so the initial GET + 2 retries = 3 failing calls
    // before isError flips. We then simulate a network transition via
    // onlineManager.setOnline(false → true), which is what TanStack listens
    // to internally; the fourth call succeeds and the query populates.
    //
    // Deviation from AC sketch: the dispatchEvent("online") path is a no-op
    // under happy-dom because onlineManager.isOnline() never transitions
    // away from true (no offline event was observed). Using the programmatic
    // setOnline API mirrors the architecture's reconnect wire faithfully and
    // is the AC-documented fallback (see story §Task 4 fallback note).
    let calls = 0;
    tasksApi.fetch = mock((): Promise<TasksGetResponse> => {
      calls++;
      if (calls <= 3) {
        return Promise.reject(new TasksApiError({ status: 500, message: "boom" }));
      }
      return Promise.resolve({
        data: [mockTask({ id: "0193f000-0000-7000-8000-0000000000aa", text: "recovered" })],
        error: null,
      });
    });
    onlineManager.setOnline(false);
    const client = makeClient();
    let snapshot: { isError: boolean; data: Task[] | undefined } = {
      isError: false,
      data: undefined,
    };
    const Probe = (): JSX.Element => {
      const query = useTasks();
      createEffect(() => {
        snapshot = { isError: query.isError, data: query.data };
      });
      return <div data-testid="probe" />;
    };
    renderWithClient(client, () => <Probe />);

    // While "offline" the query still attempts and fails (it has data: undefined,
    // and onlineManager only gates pause-on-pause behavior for paused queries —
    // the initial fetch fires and exhausts retries).
    onlineManager.setOnline(true); // ensure first attempt actually runs to error

    await waitFor(() => (snapshot.isError ? true : undefined));
    expect(snapshot.isError).toBe(true);

    // Simulate the network transitioning offline → online. TanStack's
    // onlineManager refetches every active query with refetchOnReconnect: true.
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);

    await waitFor(() =>
      snapshot.data && snapshot.data.length > 0 && snapshot.data[0]?.text === "recovered"
        ? true
        : undefined,
    );
    expect(snapshot.isError).toBe(false);
    expect(snapshot.data?.[0]?.text).toBe("recovered");
  });
});

describe("useCreateTask", () => {
  let originalCreate: typeof tasksApi.create;
  let originalCreateFetch: typeof tasksApi.createFetch;

  beforeEach(() => {
    originalCreate = tasksApi.create;
    originalCreateFetch = tasksApi.createFetch;
    __clearPendingTimersForTests();
    __resetLiveRegionForTests();
    __resetCaptureSyncStoreForTests();
  });

  afterEach(() => {
    tasksApi.create = originalCreate;
    tasksApi.createFetch = originalCreateFetch;
    __clearPendingTimersForTests();
    __resetLiveRegionForTests();
    __resetCaptureSyncStoreForTests();
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
    // Status 400 is fail-fast in the retry policy so the test does not pay
    // the exponential-backoff cost; the no-rollback contract is the assertion.
    tasksApi.create = mock(
      (): Promise<Task> =>
        Promise.reject(new TasksApiError({ status: 400, message: "validation_error" })),
    );

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

describe("useCreateTask retry policy", () => {
  it("retries up to 4 times on status 429 then fails", () => {
    const err = new TasksApiError({ status: 429, message: "rate_limited" });
    for (let count = 0; count < RETRY_429_MAX_ATTEMPTS; count++) {
      expect(computeRetryDecision(count, err)).toBe(true);
    }
    expect(computeRetryDecision(RETRY_429_MAX_ATTEMPTS, err)).toBe(false);
  });

  it("retries up to 3 times on 5xx then fails", () => {
    for (const status of [500, 502, 503, 504]) {
      const err = new TasksApiError({ status, message: `http_${status}` });
      for (let count = 0; count < RETRY_5XX_MAX_ATTEMPTS; count++) {
        expect(computeRetryDecision(count, err)).toBe(true);
      }
      expect(computeRetryDecision(RETRY_5XX_MAX_ATTEMPTS, err)).toBe(false);
    }
  });

  it("fails fast on every other 4xx", () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422]) {
      const err = new TasksApiError({ status, message: `http_${status}` });
      expect(computeRetryDecision(0, err)).toBe(false);
    }
  });

  it("treats non-TasksApiError (network / null-data) as transient 5xx", () => {
    const err = new Error("network blip");
    for (let count = 0; count < RETRY_5XX_MAX_ATTEMPTS; count++) {
      expect(computeRetryDecision(count, err)).toBe(true);
    }
    expect(computeRetryDecision(RETRY_5XX_MAX_ATTEMPTS, err)).toBe(false);
  });

  it("retryDelay returns ~1000–2000 ms for attempt 0 and ~2000–3000 ms for attempt 1", () => {
    for (let i = 0; i < 50; i++) {
      const d0 = computeRetryDelay(0, new Error("x"));
      expect(d0).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS);
      expect(d0).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS * 2);
      const d1 = computeRetryDelay(1, new Error("x"));
      expect(d1).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS * 2);
      expect(d1).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS * 3);
    }
  });

  it("retryDelay caps at RETRY_MAX_DELAY_MS for high attempt counts", () => {
    for (let attempt = 5; attempt < 10; attempt++) {
      const delay = computeRetryDelay(attempt, new Error("x"));
      expect(delay).toBe(RETRY_MAX_DELAY_MS);
    }
  });

  it("retryDelay honors Retry-After on 429 when greater than the exponential floor", () => {
    const err = new TasksApiError({ status: 429, message: "rl", retryAfterMs: 5000 });
    const d0 = computeRetryDelay(0, err);
    expect(d0).toBeGreaterThanOrEqual(5000);
    expect(d0).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS);
    expect(computeRetryDelay(5, err)).toBe(RETRY_MAX_DELAY_MS);
  });

  it("retryDelay ignores Retry-After on 5xx (only honored on 429)", () => {
    const err = new TasksApiError({ status: 503, message: "down", retryAfterMs: 5000 });
    for (let i = 0; i < 50; i++) {
      const d0 = computeRetryDelay(0, err);
      expect(d0).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS);
      expect(d0).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS * 2);
    }
  });
});

describe("useCreateTask sync state", () => {
  let originalCreate: typeof tasksApi.create;
  let originalCreateFetch: typeof tasksApi.createFetch;

  beforeEach(() => {
    originalCreate = tasksApi.create;
    originalCreateFetch = tasksApi.createFetch;
    __clearPendingTimersForTests();
    __resetLiveRegionForTests();
    __resetCaptureSyncStoreForTests();
  });

  afterEach(() => {
    tasksApi.create = originalCreate;
    tasksApi.createFetch = originalCreateFetch;
    __clearPendingTimersForTests();
    __resetLiveRegionForTests();
    __resetCaptureSyncStoreForTests();
  });

  const renderHarness = (
    client: QueryClient,
  ): { mutation: () => ReturnType<typeof useCreateTask> } => {
    let captured: ReturnType<typeof useCreateTask> | undefined;
    const Probe = (): JSX.Element => {
      captured = useCreateTask();
      return <div data-testid="probe" />;
    };
    render(() => (
      <QueryClientProvider client={client}>
        <LiveRegion />
        <Probe />
      </QueryClientProvider>
    ));
    return {
      mutation: () => {
        if (!captured) throw new Error("Probe did not capture the mutation observer");
        return captured;
      },
    };
  };

  const waitDrain = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, LIVE_REGION_DRAIN_INTERVAL_MS * 2 + 20));

  it("resolves before 300 ms — store stays empty, LiveRegion silent", async () => {
    const taskId = "0193f000-0000-7000-8000-aa00000000a0";
    tasksApi.create = mock(
      (): Promise<Task> =>
        new Promise<Task>((r) => setTimeout(() => r(mockTask({ id: taskId, text: "fast" })), 50)),
    );
    const client = makeMutationClient();
    const probe = renderHarness(client);

    probe.mutation().mutate({ id: taskId, text: "fast" });
    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    await waitDrain();

    expect(__captureSyncStorePeek(taskId)).toBeUndefined();
    expect(__getLiveRegionHistoryForTests()).toEqual([]);
  });

  it("resolves after 300 ms — pending then cleared, 'Saving…' then 'Saved' announced", async () => {
    const taskId = "0193f000-0000-7000-8000-aa00000000b1";
    let resolveMutation: (task: Task) => void = () => undefined;
    tasksApi.create = mock(
      (): Promise<Task> =>
        new Promise<Task>((r) => {
          resolveMutation = r;
        }),
    );
    const client = makeMutationClient();
    const probe = renderHarness(client);

    probe.mutation().mutate({ id: taskId, text: "slow" });
    await new Promise((r) => setTimeout(r, 360));
    expect(__captureSyncStorePeek(taskId)?.status).toBe("pending");

    resolveMutation(mockTask({ id: taskId, text: "slow" }));
    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    await waitDrain();
    await waitDrain();

    expect(__captureSyncStorePeek(taskId)).toBeUndefined();
    const history = __getLiveRegionHistoryForTests();
    expect(history).toContain(LIVE_REGION_SAVING);
    expect(history).toContain(LIVE_REGION_SAVED);
  });

  it("rejects with retry-disabled — store transitions to exhausted, error announced, no rollback", async () => {
    const taskId = "0193f000-0000-7000-8000-aa00000000c2";
    tasksApi.create = mock(
      (): Promise<Task> =>
        Promise.reject(new TasksApiError({ status: 400, message: "validation_error" })),
    );
    const client = makeMutationClient();
    const existing = mockTask({ id: "0193f000-0000-7000-8000-000000000099", text: "existing" });
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    const probe = renderHarness(client);

    probe.mutation().mutate({ id: taskId, text: "stays" });
    await waitFor(() => (probe.mutation().isError ? true : undefined));
    await waitDrain();

    expect(__captureSyncStorePeek(taskId)?.status).toBe("exhausted");
    expect(__getLiveRegionHistoryForTests()).toContain(LIVE_REGION_RETRY_EXHAUSTED);

    // No-rollback contract: optimistic row remains in cache.
    const cached = client.getQueryData<Task[]>(tasksQueryKey);
    expect(cached).toHaveLength(2);
    expect(cached?.[0]?.id).toBe(taskId);
  });

  it("retry callback re-mutates the same input and recovers the row", async () => {
    const taskId = "0193f000-0000-7000-8000-aa00000000d3";
    let calls = 0;
    tasksApi.create = mock((input: { id: string; text: string }): Promise<Task> => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new TasksApiError({ status: 400, message: "validation_error" }));
      }
      return Promise.resolve(mockTask({ id: input.id, text: input.text }));
    });
    const client = makeMutationClient();
    const probe = renderHarness(client);

    probe.mutation().mutate({ id: taskId, text: "retry me" });
    await waitFor(() => (probe.mutation().isError ? true : undefined));
    const entry = __captureSyncStorePeek(taskId);
    expect(entry?.status).toBe("exhausted");

    entry?.retry();
    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    await waitDrain();

    expect(__captureSyncStorePeek(taskId)).toBeUndefined();
    expect(calls).toBe(2);
  });

  it("concurrent rows pending simultaneously each emit 'Saving…' then 'Saved' on resolve", async () => {
    const id1 = "0193f000-0000-7000-8000-aa00000000e4";
    const id2 = "0193f000-0000-7000-8000-aa00000000e5";
    let resolve1: (task: Task) => void = () => undefined;
    let resolve2: (task: Task) => void = () => undefined;
    let n = 0;
    tasksApi.create = mock((input: { id: string; text: string }): Promise<Task> => {
      n += 1;
      return new Promise<Task>((r) => {
        if (n === 1) resolve1 = r;
        else resolve2 = r;
      }).then(() => mockTask({ id: input.id, text: input.text }));
    });
    const client = makeMutationClient();
    const probe = renderHarness(client);

    probe.mutation().mutate({ id: id1, text: "first" });
    probe.mutation().mutate({ id: id2, text: "second" });
    await new Promise((r) => setTimeout(r, 360));

    expect(__captureSyncStorePeek(id1)?.status).toBe("pending");
    expect(__captureSyncStorePeek(id2)?.status).toBe("pending");

    await waitDrain();
    await waitDrain();

    const savingCount = __getLiveRegionHistoryForTests().filter(
      (m) => m === LIVE_REGION_SAVING,
    ).length;
    expect(savingCount).toBeGreaterThanOrEqual(2);

    resolve1(mockTask({ id: id1, text: "first" }));
    resolve2(mockTask({ id: id2, text: "second" }));

    await waitFor(() =>
      __captureSyncStorePeek(id1) === undefined && __captureSyncStorePeek(id2) === undefined
        ? true
        : undefined,
    );
    await waitDrain();
    await waitDrain();

    const savedCount = __getLiveRegionHistoryForTests().filter(
      (m) => m === LIVE_REGION_SAVED,
    ).length;
    expect(savedCount).toBeGreaterThanOrEqual(2);
  });
});

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
  LIVE_REGION_TASK_DELETED,
  LIVE_REGION_TASK_DELETED_UNDO_MAC,
  LIVE_REGION_TASK_DELETED_UNDO_OTHER,
  liveRegionNTasksDeleted,
} from "./announcements";
import {
  _tasksApiSeams,
  TasksApiError,
  tasksApi,
  type Task,
  type TasksDeleteResponse,
  type TasksGetResponse,
} from "./api";
import { __captureSyncStorePeek, __resetCaptureSyncStoreForTests } from "./captureSyncStore";
import { __resetToggleSyncStoreForTests, __toggleSyncStorePeek } from "./toggleSyncStore";
import { tasksQueryKey } from "./keys";
import { __resetDeleteUndoStoreForTests, __deleteUndoMutators } from "./deleteUndoStore";
import {
  __clearPendingTimersForTests,
  __clearTogglePendingTimersForTests,
  __clearUndoCollapseTimerForTests,
  __resetFirstDeleteAnnouncementForTests,
  __setIsMacForTests,
  computeRetryDecision,
  computeRetryDelay,
  useCreateTask,
  useDeleteTask,
  useTasks,
  useToggleTask,
} from "./queries";

afterEach(() => {
  cleanup();
  __clearTogglePendingTimersForTests();
  __resetToggleSyncStoreForTests();
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
  let originalFetch: typeof _tasksApiSeams.fetch;

  beforeEach(() => {
    originalFetch = _tasksApiSeams.fetch;
  });

  afterEach(() => {
    _tasksApiSeams.fetch = originalFetch;
    // The reconnect test toggles onlineManager.setOnline(false). If that test
    // throws between the offline call and its final setOnline(true), the
    // singleton would remain offline and pause every subsequent query. Always
    // restore online state in afterEach so cross-test leakage is impossible.
    onlineManager.setOnline(true);
  });

  it("registers the architecture-locked tasks-query options against the queryClient cache", async () => {
    _tasksApiSeams.fetch = mock(
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
    _tasksApiSeams.fetch = mock(
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
    _tasksApiSeams.fetch = mock(
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
    _tasksApiSeams.fetch = mock((): Promise<TasksGetResponse> => {
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
  let originalCreateFetch: typeof _tasksApiSeams.createFetch;

  beforeEach(() => {
    originalCreate = tasksApi.create;
    originalCreateFetch = _tasksApiSeams.createFetch;
    __clearPendingTimersForTests();
    __resetLiveRegionForTests();
    __resetCaptureSyncStoreForTests();
  });

  afterEach(() => {
    tasksApi.create = originalCreate;
    _tasksApiSeams.createFetch = originalCreateFetch;
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
  let originalCreateFetch: typeof _tasksApiSeams.createFetch;

  beforeEach(() => {
    originalCreate = tasksApi.create;
    originalCreateFetch = _tasksApiSeams.createFetch;
    __clearPendingTimersForTests();
    __resetLiveRegionForTests();
    __resetCaptureSyncStoreForTests();
  });

  afterEach(() => {
    tasksApi.create = originalCreate;
    _tasksApiSeams.createFetch = originalCreateFetch;
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

describe("useToggleTask", () => {
  let originalToggle: typeof tasksApi.toggle;
  let originalPatchFetch: typeof _tasksApiSeams.patchFetch;

  beforeEach(() => {
    originalToggle = tasksApi.toggle;
    originalPatchFetch = _tasksApiSeams.patchFetch;
    __clearTogglePendingTimersForTests();
    __resetLiveRegionForTests();
    __resetToggleSyncStoreForTests();
  });

  afterEach(() => {
    tasksApi.toggle = originalToggle;
    _tasksApiSeams.patchFetch = originalPatchFetch;
    __clearTogglePendingTimersForTests();
    __resetLiveRegionForTests();
    __resetToggleSyncStoreForTests();
  });

  const renderProbe = (
    client: QueryClient,
  ): { mutation: () => ReturnType<typeof useToggleTask> } => {
    let captured: ReturnType<typeof useToggleTask> | undefined;
    const Probe = (): JSX.Element => {
      captured = useToggleTask();
      return <div data-testid="probe" />;
    };
    renderWithClient(client, () => (
      <>
        <LiveRegion />
        <Probe />
      </>
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

  it("optimistic update flips completed on the cached task", async () => {
    const taskId = "0193f000-0000-7000-8000-bb00000000a0";
    const existing = mockTask({ id: taskId, text: "task", completed: false });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    tasksApi.toggle = mock((): Promise<Task> => new Promise<Task>(() => {}));

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: taskId, completed: true });

    const cached = await waitFor(() => {
      const value = client.getQueryData<Task[]>(tasksQueryKey);
      return value?.[0]?.completed === true ? value : undefined;
    });
    expect(cached?.[0]?.id).toBe(taskId);
    expect(cached?.[0]?.completed).toBe(true);
  });

  it("success updates cache from server response and clears toggle sync state", async () => {
    const taskId = "0193f000-0000-7000-8000-bb00000000b1";
    const existing = mockTask({ id: taskId, completed: false, updatedAt: 1_000 });
    const serverTask = mockTask({ id: taskId, completed: true, updatedAt: 9_999 });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    tasksApi.toggle = mock((): Promise<Task> => Promise.resolve(serverTask));

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: taskId, completed: true });

    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));

    expect(__toggleSyncStorePeek(taskId)).toBeUndefined();
    // Cache reflects the server's authoritative response
    const cached = client.getQueryData<Task[]>(tasksQueryKey);
    expect(cached?.[0]?.completed).toBe(true);
    expect(cached?.[0]?.updatedAt).toBe(9_999);
  });

  it("resolves before 300 ms — toggle sync store stays empty, LiveRegion silent", async () => {
    const taskId = "0193f000-0000-7000-8000-bb00000000e0";
    const existing = mockTask({ id: taskId, completed: false });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    tasksApi.toggle = mock(
      (): Promise<Task> =>
        new Promise<Task>((r) =>
          setTimeout(() => r(mockTask({ id: taskId, completed: true })), 50),
        ),
    );

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: taskId, completed: true });
    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    await waitDrain();

    expect(__toggleSyncStorePeek(taskId)).toBeUndefined();
    expect(__getLiveRegionHistoryForTests()).toEqual([]);
  });

  it("resolves after 300 ms — pending then cleared, 'Saving…' then 'Saved' announced", async () => {
    const taskId = "0193f000-0000-7000-8000-bb00000000f1";
    let resolveToggle: (task: Task) => void = () => undefined;
    const existing = mockTask({ id: taskId, completed: false });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    tasksApi.toggle = mock(
      (): Promise<Task> =>
        new Promise<Task>((r) => {
          resolveToggle = r;
        }),
    );

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: taskId, completed: true });
    await new Promise((r) => setTimeout(r, 360));
    expect(__toggleSyncStorePeek(taskId)?.status).toBe("pending");

    resolveToggle(mockTask({ id: taskId, completed: true }));
    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    await waitDrain();
    await waitDrain();

    expect(__toggleSyncStorePeek(taskId)).toBeUndefined();
    const history = __getLiveRegionHistoryForTests();
    expect(history).toContain(LIVE_REGION_SAVING);
    expect(history).toContain(LIVE_REGION_SAVED);
  });

  it("onError marks exhausted and does NOT roll back the optimistic update", async () => {
    const taskId = "0193f000-0000-7000-8000-bb00000000c2";
    const existing = mockTask({ id: taskId, completed: false });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    tasksApi.toggle = mock(
      (): Promise<Task> =>
        Promise.reject(new TasksApiError({ status: 400, message: "validation_error" })),
    );

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: taskId, completed: true });

    await waitFor(() => (probe.mutation().isError ? true : undefined));
    await waitDrain();

    // Cache still shows completed (no rollback)
    const cached = client.getQueryData<Task[]>(tasksQueryKey);
    expect(cached?.[0]?.completed).toBe(true);

    // Toggle sync entry shows exhausted
    expect(__toggleSyncStorePeek(taskId)?.status).toBe("exhausted");
    expect(__getLiveRegionHistoryForTests()).toContain(LIVE_REGION_RETRY_EXHAUSTED);
  });

  it("cancels in-flight tasks queries before applying optimistic update", async () => {
    const taskId = "0193f000-0000-7000-8000-bb00000000d3";
    const existing = mockTask({ id: taskId, completed: false });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [existing]);
    const cancelMock = mock((_filters: { queryKey: readonly unknown[] }) => Promise.resolve());
    client.cancelQueries = cancelMock as unknown as typeof client.cancelQueries;

    let capturedCancelCount = -1;
    tasksApi.toggle = mock((): Promise<Task> => {
      capturedCancelCount = cancelMock.mock.calls.length;
      return Promise.resolve(mockTask({ id: taskId, completed: true }));
    });

    const probe = renderProbe(client);
    probe.mutation().mutate({ id: taskId, completed: true });

    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    expect(capturedCancelCount).toBe(1);
    expect(cancelMock.mock.calls[0]?.[0]).toEqual({ queryKey: tasksQueryKey });
  });
});

describe("useDeleteTask announcement", () => {
  let originalDeleteFetch: typeof _tasksApiSeams.deleteFetch;

  beforeEach(() => {
    originalDeleteFetch = _tasksApiSeams.deleteFetch;
    __resetLiveRegionForTests();
    __resetFirstDeleteAnnouncementForTests();
    __resetDeleteUndoStoreForTests();
    __clearUndoCollapseTimerForTests();
    __setIsMacForTests(false);
  });

  afterEach(() => {
    _tasksApiSeams.deleteFetch = originalDeleteFetch;
    __resetLiveRegionForTests();
    __resetFirstDeleteAnnouncementForTests();
    __resetDeleteUndoStoreForTests();
    __clearUndoCollapseTimerForTests();
    __setIsMacForTests(false);
  });

  const renderProbe = (
    client: QueryClient,
  ): { mutation: () => ReturnType<typeof useDeleteTask> } => {
    let captured: ReturnType<typeof useDeleteTask> | undefined;
    const Probe = (): JSX.Element => {
      captured = useDeleteTask();
      return <div />;
    };
    renderWithClient(client, () => (
      <>
        <LiveRegion />
        <Probe />
      </>
    ));
    return {
      mutation: () => {
        if (!captured) throw new Error("Probe did not capture the mutation");
        return captured;
      },
    };
  };

  const waitDrain = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, LIVE_REGION_DRAIN_INTERVAL_MS * 2 + 20));

  it("first delete on non-Mac announces undo-other string", async () => {
    const taskId = "0193f000-0000-7000-8000-aa00000000a0";
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [mockTask({ id: taskId })]);
    _tasksApiSeams.deleteFetch = mock((): Promise<TasksDeleteResponse> => new Promise(() => {}));

    const probe = renderProbe(client);
    probe.mutation().mutate(taskId);

    await waitDrain();
    expect(__getLiveRegionHistoryForTests()).toContain(LIVE_REGION_TASK_DELETED_UNDO_OTHER);
    expect(__getLiveRegionHistoryForTests()).not.toContain(LIVE_REGION_TASK_DELETED_UNDO_MAC);
  });

  it("first delete on Mac announces undo-mac string", async () => {
    const taskId = "0193f000-0000-7000-8000-aa00000000b0";
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [mockTask({ id: taskId })]);
    _tasksApiSeams.deleteFetch = mock((): Promise<TasksDeleteResponse> => new Promise(() => {}));
    __setIsMacForTests(true);

    const probe = renderProbe(client);
    probe.mutation().mutate(taskId);

    await waitDrain();
    expect(__getLiveRegionHistoryForTests()).toContain(LIVE_REGION_TASK_DELETED_UNDO_MAC);
    expect(__getLiveRegionHistoryForTests()).not.toContain(LIVE_REGION_TASK_DELETED_UNDO_OTHER);
  });

  it("second delete announces plain deleted string", async () => {
    const taskId1 = "0193f000-0000-7000-8000-aa00000000c0";
    const taskId2 = "0193f000-0000-7000-8000-aa00000000c1";
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [
      mockTask({ id: taskId1 }),
      mockTask({ id: taskId2 }),
    ]);
    _tasksApiSeams.deleteFetch = mock((): Promise<TasksDeleteResponse> => new Promise(() => {}));

    const probe = renderProbe(client);
    probe.mutation().mutate(taskId1);
    await waitDrain();
    probe.mutation().mutate(taskId2);
    await waitDrain();

    const history = __getLiveRegionHistoryForTests();
    expect(history[0]).toBe(LIVE_REGION_TASK_DELETED_UNDO_OTHER);
    expect(history[1]).toBe(LIVE_REGION_TASK_DELETED);
  });

  it("onMutate stores DeleteContext snapshot (deletedTask + index)", async () => {
    const taskId1 = "0193f000-0000-7000-8000-dd00000000a0";
    const taskId2 = "0193f000-0000-7000-8000-dd00000000a1";
    const task1 = mockTask({ id: taskId1, text: "first" });
    const task2 = mockTask({ id: taskId2, text: "second" });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [task1, task2]);
    // Resolve immediately so onSuccess fires and writes the store
    _tasksApiSeams.deleteFetch = mock(
      (): Promise<TasksDeleteResponse> => Promise.resolve({ data: null, error: null }),
    );

    const probe = renderProbe(client);
    probe.mutation().mutate(taskId1);

    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));

    // The store entry should have the correct task and original index
    const { deleteUndoStorePeek } = await import("./deleteUndoStore");
    const entry = deleteUndoStorePeek(taskId1);
    expect(entry).toBeDefined();
    expect(entry?.task).toEqual(task1);
    expect(entry?.index).toBe(0);
  });

  it("onSuccess writes to deleteUndoStore", async () => {
    const taskId = "0193f000-0000-7000-8000-dd00000000b0";
    const task = mockTask({ id: taskId, text: "undo me" });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [task]);
    _tasksApiSeams.deleteFetch = mock(
      (): Promise<TasksDeleteResponse> => Promise.resolve({ data: null, error: null }),
    );

    const probe = renderProbe(client);
    probe.mutation().mutate(taskId);
    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));

    const { deleteUndoStorePeek } = await import("./deleteUndoStore");
    const entry = deleteUndoStorePeek(taskId);
    expect(entry).toBeDefined();
    expect(entry?.task.id).toBe(taskId);
  });

  it("onError rolls back optimistic removal at original index", async () => {
    const taskId = "0193f000-0000-7000-8000-dd00000000c0";
    const otherTaskId = "0193f000-0000-7000-8000-dd00000000c1";
    const task = mockTask({ id: taskId, text: "rollback me" });
    const other = mockTask({ id: otherTaskId, text: "stays" });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [task, other]);
    // Status 400 is fail-fast in the retry policy (no retries), avoiding timeout
    _tasksApiSeams.deleteFetch = mock(
      (): Promise<TasksDeleteResponse> =>
        Promise.reject(new TasksApiError({ status: 400, message: "bad_request" })),
    );

    const probe = renderProbe(client);
    probe.mutation().mutate(taskId);
    await waitFor(() => (probe.mutation().isError ? true : undefined));

    const cached = client.getQueryData<Task[]>(tasksQueryKey);
    expect(cached).toHaveLength(2);
    expect(cached?.[0]?.id).toBe(taskId);
    expect(cached?.[1]?.id).toBe(otherTaskId);
  });

  it("onSuccess: announces N tasks deleted when count > 1", async () => {
    const taskId1 = "0193f000-0000-7000-8000-dd00000000d0";
    const taskId2 = "0193f000-0000-7000-8000-dd00000000d1";
    const task1 = mockTask({ id: taskId1, text: "first" });
    const task2 = mockTask({ id: taskId2, text: "second" });
    const client = makeMutationClient();
    client.setQueryData<Task[]>(tasksQueryKey, [task1, task2]);

    // Pre-write one entry to store so the second delete sees count > 1
    __deleteUndoMutators.setEntry(taskId1, { task: task1, index: 0, deletedAt: 1_700_000_000_001 });

    _tasksApiSeams.deleteFetch = mock(
      (): Promise<TasksDeleteResponse> => Promise.resolve({ data: null, error: null }),
    );

    const probe = renderProbe(client);
    probe.mutation().mutate(taskId2);
    await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
    await waitDrain();

    const history = __getLiveRegionHistoryForTests();
    expect(history).toContain(liveRegionNTasksDeleted(2));
  });
});

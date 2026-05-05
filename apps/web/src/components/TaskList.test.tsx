import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import axe from "axe-core";
import type { JSX } from "solid-js";
import { LOADING_DELAY_MS } from "../constants";
import { TasksApiError, tasksApi, type Task } from "../data/api";
import { tasksQueryKey } from "../data/keys";
import { TaskList } from "./TaskList";

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
    defaultOptions: {
      queries: {
        retry: false,
        retryDelay: 0,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  });

const renderWithClient = (client: QueryClient, ui: () => JSX.Element): ReturnType<typeof render> =>
  render(() => <QueryClientProvider client={client}>{ui()}</QueryClientProvider>);

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const assertNoBlockingAxeViolations = async (container: HTMLElement): Promise<void> => {
  const results = await axe.run(container);
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
};

describe("TaskList", () => {
  let originalList: typeof tasksApi.list;

  beforeEach(() => {
    originalList = tasksApi.list;
  });

  afterEach(() => {
    tasksApi.list = originalList;
  });

  it("renders nothing in the list area while pending under 200 ms", () => {
    tasksApi.list = mock(() => new Promise<Task[]>(() => {}));
    const client = makeClient();
    const { container, queryByRole, queryByText } = renderWithClient(client, () => <TaskList />);
    expect(queryByRole("list")).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(queryByText("No tasks yet. Start by typing above.")).toBeNull();
  });

  it("renders LoadingState with three skeleton rows once 200 ms elapses", async () => {
    tasksApi.list = mock(() => new Promise<Task[]>(() => {}));
    const client = makeClient();
    const { container } = renderWithClient(client, () => <TaskList />);

    await wait(LOADING_DELAY_MS + 50);

    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.getAttribute("aria-live")).toBe("polite");
    const skeletons = container.querySelectorAll('[data-testid="skeleton-row"]');
    expect(skeletons.length).toBe(3);

    await assertNoBlockingAxeViolations(container);
  });

  it("renders the EmptyState copy when the query resolves with zero tasks", async () => {
    const client = makeClient();
    client.setQueryData(tasksQueryKey, [] as Task[]);
    const { container, queryByRole, getByText } = renderWithClient(client, () => <TaskList />);

    expect(getByText("No tasks yet. Start by typing above.")).toBeDefined();
    expect(queryByRole("list")).toBeNull();

    await assertNoBlockingAxeViolations(container);
  });

  it("renders one TaskRow per task in the resolved order, with role=list and the task-row CSS class", async () => {
    const client = makeClient();
    const tasks: Task[] = [
      mockTask({
        id: "0193f000-0000-7000-8000-000000000002",
        text: "newest task",
        createdAt: 1_700_000_000_200,
        updatedAt: 1_700_000_000_200,
      }),
      mockTask({
        id: "0193f000-0000-7000-8000-000000000001",
        text: "older task",
        createdAt: 1_700_000_000_100,
        updatedAt: 1_700_000_000_100,
      }),
    ];
    client.setQueryData(tasksQueryKey, tasks);
    const { container, getByRole } = renderWithClient(client, () => <TaskList />);

    const list = getByRole("list");
    expect(list.tagName).toBe("UL");
    const items = list.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toContain("newest task");
    expect(items[1]?.textContent).toContain("older task");

    for (const item of items) {
      const className = item.getAttribute("class") ?? "";
      expect(className).toContain("task-row");
      // Layout (padding 12px 8px) is owned by the .task-row CSS class — not
      // utility classes — per Story 5.2 (single source of truth).
      expect(className).not.toContain("min-[900px]:px-2");
    }

    await assertNoBlockingAxeViolations(container);
  });
});

describe("TaskList fetch error state", () => {
  let originalList: typeof tasksApi.list;

  beforeEach(() => {
    originalList = tasksApi.list;
  });

  afterEach(() => {
    tasksApi.list = originalList;
  });

  const waitForErrorUI = async (container: HTMLElement): Promise<void> => {
    const start = Date.now();
    while (!container.textContent?.includes("Couldn't load tasks")) {
      if (Date.now() - start > 1000) {
        throw new Error("Timed out waiting for ListFetchError UI to mount");
      }
      await wait(10);
    }
  };

  it("renders the inline error copy and Retry button when the GET fails", async () => {
    tasksApi.list = mock(() => Promise.reject(new TasksApiError({ status: 500, message: "boom" })));
    const client = makeClient();
    const { container, getByRole, getByText } = renderWithClient(client, () => <TaskList />);

    await waitForErrorUI(container);
    expect(getByText("Couldn't load tasks — check connection.")).toBeDefined();
    expect(getByRole("button", { name: "Retry" })).toBeDefined();
    await assertNoBlockingAxeViolations(container);
  });

  it("Retry click re-invokes tasksApi.list", async () => {
    const listMock = mock(() =>
      Promise.reject(new TasksApiError({ status: 500, message: "boom" })),
    );
    tasksApi.list = listMock;
    const client = makeClient();
    const { container, getByRole } = renderWithClient(client, () => <TaskList />);

    await waitForErrorUI(container);
    const callsBeforeRetry = listMock.mock.calls.length;
    fireEvent.click(getByRole("button", { name: "Retry" }));
    await wait(50);
    expect(listMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it("Retry success transitions error → populated", async () => {
    // useTasks locks retry: 2, so the initial query fires 3 calls (initial + 2
    // retries) before isError flips. The Retry click triggers a fresh refetch
    // (call 3) which we resolve to success, populating the list.
    let calls = 0;
    tasksApi.list = mock(() => {
      if (calls++ < 3) {
        return Promise.reject(new TasksApiError({ status: 500, message: "boom" }));
      }
      return Promise.resolve([
        mockTask({ id: "0193f000-0000-7000-8000-000000000099", text: "recovered" }),
      ]);
    });
    const client = makeClient();
    const { container, getByRole, getByText, queryByText } = renderWithClient(client, () => (
      <TaskList />
    ));

    await waitForErrorUI(container);
    fireEvent.click(getByRole("button", { name: "Retry" }));

    const start = Date.now();
    while (!container.textContent?.includes("recovered")) {
      if (Date.now() - start > 1000) {
        throw new Error("Timed out waiting for populated state after Retry");
      }
      await wait(10);
    }
    expect(getByText("recovered")).toBeDefined();
    expect(queryByText("Couldn't load tasks — check connection.")).toBeNull();
  });
});

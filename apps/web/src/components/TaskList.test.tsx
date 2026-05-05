import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import axe from "axe-core";
import type { JSX } from "solid-js";
import { LOADING_DELAY_MS } from "../constants";
import { tasksApi, type Task } from "../data/api";
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

  it("renders one TaskRow per task in the resolved order, with role=list and responsive padding classes", async () => {
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
      expect(className).toContain("px-4");
      expect(className).toContain("min-[900px]:px-2");
    }

    await assertNoBlockingAxeViolations(container);
  });
});

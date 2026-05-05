import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import type { JSX } from "solid-js";
import type { Task } from "../data/api";
import { __deleteUndoMutators, __resetDeleteUndoStoreForTests } from "../data/deleteUndoStore";
import { __clearUndoCollapseTimerForTests } from "../data/queries";
import { UndoSnackbar } from "./UndoSnackbar";

afterEach(() => {
  cleanup();
  __resetDeleteUndoStoreForTests();
  __clearUndoCollapseTimerForTests();
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "0193f000-0000-7000-8000-000000000001",
  text: "snackbar task",
  completed: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const renderSnackbar = (): ReturnType<typeof render> => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    () =>
      (
        <QueryClientProvider client={client}>
          <UndoSnackbar />
        </QueryClientProvider>
      ) as JSX.Element,
  );
};

describe("UndoSnackbar", () => {
  it("renders nothing when deleteUndoStore is empty", () => {
    const { queryByRole } = renderSnackbar();
    expect(queryByRole("status")).toBeNull();
  });

  it("renders 'Task deleted' and Undo button for single entry", () => {
    const task = makeTask();
    __deleteUndoMutators.setEntry(task.id, { task, index: 0, deletedAt: 1_700_000_000_001 });
    const { getByRole, getByText } = renderSnackbar();
    expect(getByRole("status")).toBeTruthy();
    expect(getByText("Task deleted")).toBeTruthy();
    expect(getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("renders 'N tasks deleted' for multiple entries", () => {
    const task1 = makeTask({ id: "snack-1" });
    const task2 = makeTask({ id: "snack-2" });
    __deleteUndoMutators.setEntry(task1.id, {
      task: task1,
      index: 0,
      deletedAt: 1_700_000_000_001,
    });
    __deleteUndoMutators.setEntry(task2.id, {
      task: task2,
      index: 1,
      deletedAt: 1_700_000_000_002,
    });
    const { getByText } = renderSnackbar();
    expect(getByText("2 tasks deleted")).toBeTruthy();
  });

  it("clicking Undo clears the store", () => {
    const task = makeTask();
    __deleteUndoMutators.setEntry(task.id, { task, index: 0, deletedAt: 1_700_000_000_001 });
    const { getByRole, queryByRole } = renderSnackbar();
    const undoBtn = getByRole("button", { name: "Undo" });
    fireEvent.click(undoBtn);
    expect(queryByRole("status")).toBeNull();
  });
});

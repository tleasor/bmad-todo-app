import { afterEach, describe, expect, it } from "bun:test";
import type { Task } from "./api";
import {
  __deleteUndoMutators,
  __resetDeleteUndoStoreForTests,
  deleteUndoStoreCount,
  deleteUndoStorePeek,
} from "./deleteUndoStore";

afterEach(() => {
  __resetDeleteUndoStoreForTests();
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "0193f000-0000-7000-8000-000000000001",
  text: "test task",
  completed: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

describe("deleteUndoStore", () => {
  it("setEntry stores an entry by id", () => {
    const task = makeTask();
    __deleteUndoMutators.setEntry(task.id, { task, index: 2, deletedAt: 1_700_000_000_001 });
    const entry = deleteUndoStorePeek(task.id);
    expect(entry).toBeDefined();
    expect(entry?.task).toEqual(task);
    expect(entry?.index).toBe(2);
  });

  it("clearEntry removes an entry", () => {
    const task = makeTask();
    __deleteUndoMutators.setEntry(task.id, { task, index: 0, deletedAt: 1_700_000_000_001 });
    expect(deleteUndoStorePeek(task.id)).toBeDefined();
    __deleteUndoMutators.clearEntry(task.id);
    expect(deleteUndoStorePeek(task.id)).toBeUndefined();
  });

  it("clearAll removes all entries", () => {
    const task1 = makeTask({ id: "id-1" });
    const task2 = makeTask({ id: "id-2" });
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
    expect(deleteUndoStoreCount()).toBe(2);
    __deleteUndoMutators.clearAll();
    expect(deleteUndoStoreCount()).toBe(0);
  });

  it("deleteUndoStoreCount returns correct count", () => {
    expect(deleteUndoStoreCount()).toBe(0);
    const task1 = makeTask({ id: "count-1" });
    const task2 = makeTask({ id: "count-2" });
    __deleteUndoMutators.setEntry(task1.id, {
      task: task1,
      index: 0,
      deletedAt: 1_700_000_000_001,
    });
    expect(deleteUndoStoreCount()).toBe(1);
    __deleteUndoMutators.setEntry(task2.id, {
      task: task2,
      index: 1,
      deletedAt: 1_700_000_000_002,
    });
    expect(deleteUndoStoreCount()).toBe(2);
    __deleteUndoMutators.clearEntry(task1.id);
    expect(deleteUndoStoreCount()).toBe(1);
  });
});

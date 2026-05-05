import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type Database, openDb } from "./db";
import { runMigrations } from "./migrations/runner";
import {
  __resetTaskRepoForTests,
  __setTaskRepoForTests,
  createTaskRepo,
  type TaskRepo,
  taskRepo,
} from "./tasks";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

describe("taskRepo", () => {
  let db: Database;
  let repo: ReturnType<typeof createTaskRepo>;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, { dir: MIGRATIONS_DIR });
    repo = createTaskRepo(db);
  });

  describe("list", () => {
    it("returns an empty array on a fresh DB", () => {
      expect(repo.list()).toEqual([]);
    });
  });

  describe("create", () => {
    it("inserts a fresh task and returns created: true with timestamps in window", async () => {
      const id = Bun.randomUUIDv7();
      const before = Date.now();
      const result = repo.create({ id, text: "buy milk" });
      const after = Date.now();

      expect(result.created).toBe(true);
      expect(result.task.id).toBe(id);
      expect(result.task.text).toBe("buy milk");
      expect(result.task.completed).toBe(false);
      expect(typeof result.task.createdAt).toBe("number");
      expect(result.task.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.task.createdAt).toBeLessThanOrEqual(after);
      expect(result.task.updatedAt).toBe(result.task.createdAt);
    });

    it("returns created: false on idempotent retry with same id and same text", () => {
      const id = Bun.randomUUIDv7();
      const first = repo.create({ id, text: "buy milk" });
      const second = repo.create({ id, text: "buy milk" });

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.task.text).toBe("buy milk");
      const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM tasks").get();
      expect(count?.count).toBe(1);
    });

    it("returns the original row's text when same id is retried with different text (409 conflict contract)", () => {
      const id = Bun.randomUUIDv7();
      repo.create({ id, text: "original" });
      const second = repo.create({ id, text: "different" });

      expect(second.created).toBe(false);
      expect(second.task.text).toBe("original");
      const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM tasks").get();
      expect(count?.count).toBe(1);
    });
  });

  describe("list ordering", () => {
    it("returns tasks newest-first via ORDER BY id DESC (UUIDv7 monotonicity)", async () => {
      const id1 = Bun.randomUUIDv7();
      repo.create({ id: id1, text: "first" });
      await Bun.sleep(2);
      const id2 = Bun.randomUUIDv7();
      repo.create({ id: id2, text: "second" });
      await Bun.sleep(2);
      const id3 = Bun.randomUUIDv7();
      repo.create({ id: id3, text: "third" });

      const all = repo.list();
      expect(all.map((t) => t.id)).toEqual([id3, id2, id1]);
    });
  });

  describe("get", () => {
    it("returns the task for an existing id", () => {
      const id = Bun.randomUUIDv7();
      repo.create({ id, text: "find me" });
      const found = repo.get(id);
      expect(found?.id).toBe(id);
      expect(found?.text).toBe("find me");
    });

    it("returns undefined for a missing id", () => {
      expect(repo.get("nope-not-here")).toBeUndefined();
    });
  });

  describe("camelCase boundary", () => {
    it("returned Task objects expose only camelCase keys (no snake_case leak)", () => {
      const id = Bun.randomUUIDv7();
      repo.create({ id, text: "boundary" });
      const task = repo.list()[0];
      expect(task).toBeDefined();
      expect(Object.keys(task as object).sort()).toEqual([
        "completed",
        "createdAt",
        "id",
        "text",
        "updatedAt",
      ]);
    });
  });

  describe("update", () => {
    it("flips completed from false to true and returns the updated task", () => {
      const id = Bun.randomUUIDv7();
      repo.create({ id, text: "task" });
      const updated = repo.update(id, { completed: true });
      expect(updated).toBeDefined();
      expect(updated?.completed).toBe(true);
      expect(updated?.id).toBe(id);
    });

    it("does not modify createdAt", () => {
      const id = Bun.randomUUIDv7();
      const { task: original } = repo.create({ id, text: "task" });
      const updated = repo.update(id, { completed: true });
      expect(updated?.createdAt).toBe(original.createdAt);
    });

    it("sets updatedAt to a new value greater than or equal to the original", () => {
      const id = Bun.randomUUIDv7();
      const before = Date.now();
      const { task: original } = repo.create({ id, text: "task" });
      const updated = repo.update(id, { completed: true });
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(original.updatedAt);
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it("returns undefined for a non-existent id", () => {
      expect(repo.update("no-such-id", { completed: true })).toBeUndefined();
    });

    it("target-state idempotency: calling update twice with completed:true returns same result", () => {
      const id = Bun.randomUUIDv7();
      repo.create({ id, text: "task" });
      const first = repo.update(id, { completed: true });
      const second = repo.update(id, { completed: true });
      expect(first?.completed).toBe(true);
      expect(second?.completed).toBe(true);
    });

    it("can flip back to completed:false", () => {
      const id = Bun.randomUUIDv7();
      repo.create({ id, text: "task" });
      repo.update(id, { completed: true });
      const reverted = repo.update(id, { completed: false });
      expect(reverted?.completed).toBe(false);
    });
  });

  describe("stubs deferred to later stories", () => {
    it("delete throws (Story 3.1)", () => {
      expect(() => repo.delete("some-id")).toThrow(/Story 3.1/);
    });
  });
});

describe("taskRepo singleton test seam", () => {
  afterEach(() => {
    __resetTaskRepoForTests();
  });

  it("__setTaskRepoForTests swaps the singleton's delegate", () => {
    const fake: TaskRepo = {
      list: () => [],
      get: () => undefined,
      create: () => {
        throw new Error("not used in this test");
      },
      update: () => undefined,
      delete: () => false,
    };
    __setTaskRepoForTests(fake);
    expect(taskRepo.list()).toEqual([]);
    expect(taskRepo.get("anything")).toBeUndefined();
    expect(taskRepo.delete("anything")).toBe(false);
  });
});

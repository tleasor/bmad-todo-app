import { join } from "node:path";
import { beforeEach, describe, expect, it } from "bun:test";
import { type Database, openDb } from "./db";
import { runMigrations } from "./migrations/runner";
import { createTaskRepo } from "./tasks";

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

  describe("stubs deferred to later stories", () => {
    it("update throws (Story 2.1)", () => {
      expect(() => repo.update("some-id", { completed: true })).toThrow(/Story 2.1/);
    });

    it("delete throws (Story 3.1)", () => {
      expect(() => repo.delete("some-id")).toThrow(/Story 3.1/);
    });
  });
});

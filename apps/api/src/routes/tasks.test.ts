import { join } from "node:path";
import { type AnyElysia, Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { __resetBucketsForTests } from "../middleware/rateLimit";
import { bodySize } from "../middleware/bodySize";
import { rateLimit } from "../middleware/rateLimit";
import { requestLogger } from "../middleware/requestLogger";
import { registerOnError } from "../onError";
import { type Database, openDb } from "../storage/db";
import { runMigrations } from "../storage/migrations/runner";
import {
  __resetTaskRepoForTests,
  __setTaskRepoForTests,
  createTaskRepo,
  type TaskRepo,
} from "../storage/tasks";
import { tasksRoute } from "./tasks";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "storage", "migrations");

type TaskBody = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
};

type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
};

const TEST_IP = "10.0.0.1";

const post = async (app: AnyElysia, body: unknown, ip: string = TEST_IP): Promise<Response> =>
  app.handle(
    new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    }),
  );

const get = async (app: AnyElysia, ip: string = TEST_IP): Promise<Response> =>
  app.handle(
    new Request("http://localhost/api/tasks", {
      headers: { "x-forwarded-for": ip },
    }),
  );

const patch = async (
  app: AnyElysia,
  id: string,
  body: unknown,
  ip: string = TEST_IP,
): Promise<Response> =>
  app.handle(
    new Request(`http://localhost/api/tasks/${id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    }),
  );

const del = async (app: AnyElysia, id: string, ip: string = TEST_IP): Promise<Response> =>
  app.handle(
    new Request(`http://localhost/api/tasks/${id}`, {
      method: "DELETE",
      headers: { "x-forwarded-for": ip },
    }),
  );

const delAll = async (app: AnyElysia, ip: string = TEST_IP): Promise<Response> =>
  app.handle(
    new Request("http://localhost/api/tasks", {
      method: "DELETE",
      headers: { "x-forwarded-for": ip },
    }),
  );

describe("tasks route", () => {
  let testDb: Database;
  let testRepo: TaskRepo;
  let app: AnyElysia;

  beforeEach(() => {
    testDb = openDb(":memory:");
    runMigrations(testDb, { dir: MIGRATIONS_DIR });
    testRepo = createTaskRepo(testDb);
    __setTaskRepoForTests(testRepo);
    __resetBucketsForTests();
    const baseApp = new Elysia().use(requestLogger()).use(bodySize()).use(rateLimit());
    registerOnError(baseApp, { isDev: true });
    app = baseApp.use(tasksRoute);
  });

  afterEach(() => {
    __resetTaskRepoForTests();
    __resetBucketsForTests();
    testDb.close();
  });

  describe("GET /api/tasks", () => {
    it("returns 200 with an empty array on a fresh DB", async () => {
      const res = await get(app);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toContain("application/json");
      const body = (await res.json()) as TaskBody[];
      expect(body).toEqual([]);
    });

    it("returns tasks in newest-first order (UUIDv7 monotonic ids)", async () => {
      const id1 = Bun.randomUUIDv7();
      await post(app, { id: id1, text: "first" });
      await Bun.sleep(2);
      const id2 = Bun.randomUUIDv7();
      await post(app, { id: id2, text: "second" });
      await Bun.sleep(2);
      const id3 = Bun.randomUUIDv7();
      await post(app, { id: id3, text: "third" });

      const res = await get(app);
      expect(res.status).toBe(200);
      const body = (await res.json()) as TaskBody[];
      expect(body.map((t) => t.id)).toEqual([id3, id2, id1]);
    });
  });

  describe("POST /api/tasks", () => {
    it("creates a fresh task and returns 201 with the canonical Task shape", async () => {
      const id = Bun.randomUUIDv7();
      const before = Date.now();
      const res = await post(app, { id, text: "hello" });
      const after = Date.now();
      expect(res.status).toBe(201);
      expect(res.headers.get("content-type") ?? "").toContain("application/json");
      const body = (await res.json()) as TaskBody;
      expect(body.id).toBe(id);
      expect(body.text).toBe("hello");
      expect(body.completed).toBe(false);
      expect(typeof body.createdAt).toBe("number");
      expect(body.createdAt).toBeGreaterThanOrEqual(before);
      expect(body.createdAt).toBeLessThanOrEqual(after);
      expect(body.updatedAt).toBe(body.createdAt);
    });

    it("returns 200 on idempotent retry (same id + same text)", async () => {
      const id = Bun.randomUUIDv7();
      const first = await post(app, { id, text: "hello" });
      expect(first.status).toBe(201);
      const firstBody = (await first.json()) as TaskBody;

      const second = await post(app, { id, text: "hello" });
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as TaskBody;
      expect(secondBody).toEqual(firstBody);

      const list = await get(app);
      const listBody = (await list.json()) as TaskBody[];
      expect(listBody.length).toBe(1);
    });

    it("returns 409 with id_conflict envelope when same id has different text", async () => {
      const id = Bun.randomUUIDv7();
      const first = await post(app, { id, text: "a" });
      expect(first.status).toBe(201);

      const conflict = await post(app, { id, text: "b" });
      expect(conflict.status).toBe(409);
      expect(conflict.headers.get("content-type") ?? "").toContain("application/json");
      const envelope = (await conflict.json()) as ErrorBody;
      expect(envelope.error.code).toBe("id_conflict");
      expect(envelope.error.message.length).toBeGreaterThan(0);
      expect(envelope.requestId.length).toBeGreaterThan(0);

      const list = await get(app);
      const listBody = (await list.json()) as TaskBody[];
      expect(listBody[0]?.text).toBe("a");
    });
  });

  describe("validation", () => {
    it("returns 400 validation_error when text exceeds 500 chars", async () => {
      const res = await post(app, { id: Bun.randomUUIDv7(), text: "x".repeat(501) });
      expect(res.status).toBe(400);
      const envelope = (await res.json()) as ErrorBody;
      expect(envelope.error.code).toBe("validation_error");
    });

    it("returns 400 validation_error when text is empty", async () => {
      const res = await post(app, { id: Bun.randomUUIDv7(), text: "" });
      expect(res.status).toBe(400);
      const envelope = (await res.json()) as ErrorBody;
      expect(envelope.error.code).toBe("validation_error");
    });

    it("returns 400 validation_error when text field is missing", async () => {
      const res = await post(app, { id: Bun.randomUUIDv7() });
      expect(res.status).toBe(400);
      const envelope = (await res.json()) as ErrorBody;
      expect(envelope.error.code).toBe("validation_error");
    });

    it("returns 400 validation_error when id is wrong type", async () => {
      const res = await post(app, { id: 123, text: "ok" });
      expect(res.status).toBe(400);
      const envelope = (await res.json()) as ErrorBody;
      expect(envelope.error.code).toBe("validation_error");
    });
  });

  describe("rate limit", () => {
    it("21st POST from the same IP returns 429 with rate-limit headers and the envelope", async () => {
      for (let i = 0; i < 20; i += 1) {
        const res = await post(app, { id: Bun.randomUUIDv7(), text: `t${i}` });
        expect(res.status).toBe(201);
      }
      const limited = await post(app, { id: Bun.randomUUIDv7(), text: "over" });
      expect(limited.status).toBe(429);
      expect(limited.headers.get("x-ratelimit-limit")).toBe("20");
      expect(limited.headers.get("x-ratelimit-remaining")).toBe("0");
      const reset = limited.headers.get("x-ratelimit-reset");
      expect(reset).not.toBeNull();
      expect(Number.isFinite(Number(reset))).toBe(true);
      expect(limited.headers.get("retry-after")).not.toBeNull();
      const envelope = (await limited.json()) as ErrorBody;
      expect(envelope.error.code).toBe("rate_limited");
      expect(envelope.error.message.length).toBeGreaterThan(0);
      expect(envelope.requestId.length).toBeGreaterThan(0);
    });
  });

  describe("PATCH /api/tasks/:id", () => {
    it("returns 200 with the updated task when toggled to completed", async () => {
      const id = Bun.randomUUIDv7();
      const postRes = await post(app, { id, text: "toggle me" });
      const original = (await postRes.json()) as TaskBody;
      const res = await patch(app, id, { completed: true });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toContain("application/json");
      const body = (await res.json()) as TaskBody;
      expect(body.id).toBe(id);
      expect(body.text).toBe("toggle me");
      expect(body.completed).toBe(true);
      expect(typeof body.createdAt).toBe("number");
      expect(body.createdAt).toBe(original.createdAt);
      expect(typeof body.updatedAt).toBe("number");
      expect(body.updatedAt).toBeGreaterThanOrEqual(original.updatedAt);
    });

    it("returns 200 when toggled back to active", async () => {
      const id = Bun.randomUUIDv7();
      await post(app, { id, text: "toggle me" });
      await patch(app, id, { completed: true });
      const res = await patch(app, id, { completed: false });
      expect(res.status).toBe(200);
      const body = (await res.json()) as TaskBody;
      expect(body.completed).toBe(false);
    });

    it("target-state idempotency: PATCH with completed:true twice returns same result", async () => {
      const id = Bun.randomUUIDv7();
      await post(app, { id, text: "idempotent" });
      const first = await patch(app, id, { completed: true });
      const firstBody = (await first.json()) as TaskBody;
      const second = await patch(app, id, { completed: true });
      const secondBody = (await second.json()) as TaskBody;
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(firstBody.completed).toBe(true);
      expect(secondBody.completed).toBe(true);
    });

    it("returns 404 not_found envelope when id does not exist", async () => {
      const res = await patch(app, "no-such-id", { completed: true });
      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("not_found");
      expect(body.error.message.length).toBeGreaterThan(0);
      expect(body.requestId.length).toBeGreaterThan(0);
    });

    it("returns 400 validation_error when completed is not a boolean", async () => {
      const id = Bun.randomUUIDv7();
      await post(app, { id, text: "test" });
      const res = await patch(app, id, { completed: "yes" });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("validation_error");
    });

    it("returns 400 validation_error when completed field is missing", async () => {
      const id = Bun.randomUUIDv7();
      await post(app, { id, text: "test" });
      const res = await patch(app, id, {});
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("validation_error");
    });

    it("returns 429 rate_limited with rate-limit headers after burst exhaustion", async () => {
      const limitIp = "10.0.0.99";
      for (let i = 0; i < 20; i += 1) {
        await post(app, { id: Bun.randomUUIDv7(), text: `t${i}` }, limitIp);
      }
      const id = Bun.randomUUIDv7();
      await post(app, { id, text: "seed" });
      const res = await patch(app, id, { completed: true }, limitIp);
      expect(res.status).toBe(429);
      expect(res.headers.get("x-ratelimit-limit")).toBe("20");
      expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
      const reset = res.headers.get("x-ratelimit-reset");
      expect(reset).not.toBeNull();
      expect(Number.isFinite(Number(reset))).toBe(true);
      expect(res.headers.get("retry-after")).not.toBeNull();
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("rate_limited");
    });
  });

  describe("error envelope shape", () => {
    it("every error body has exact envelope shape with content-type application/json", async () => {
      const res = await post(app, { id: Bun.randomUUIDv7(), text: "" });
      expect(res.headers.get("content-type") ?? "").toContain("application/json");
      const body = (await res.json()) as ErrorBody;
      expect(typeof body.error.code).toBe("string");
      expect(typeof body.error.message).toBe("string");
      expect(typeof body.requestId).toBe("string");
    });
  });

  describe("DELETE /api/tasks/:id", () => {
    it("returns 204 when the task exists", async () => {
      const id = Bun.randomUUIDv7();
      await post(app, { id, text: "to delete" });
      const res = await del(app, id);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
    });

    it("returns 204 when the id does not exist (idempotent)", async () => {
      const res = await del(app, "nonexistent-id");
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
    });

    it("returns 429 rate_limited with rate-limit headers after burst exhaustion", async () => {
      const limitIp = "10.0.0.42";
      for (let i = 0; i < 20; i += 1) {
        await post(app, { id: Bun.randomUUIDv7(), text: `t${i}` }, limitIp);
      }
      const res = await del(app, Bun.randomUUIDv7(), limitIp);
      expect(res.status).toBe(429);
      expect(res.headers.get("x-ratelimit-limit")).toBe("20");
      expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
      const reset = res.headers.get("x-ratelimit-reset");
      expect(reset).not.toBeNull();
      expect(Number.isFinite(Number(reset))).toBe(true);
      expect(res.headers.get("retry-after")).not.toBeNull();
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("rate_limited");
    });
  });

  describe("DELETE /api/tasks (dev fixture reset)", () => {
    it("returns 204 and removes all tasks when IS_DEV is true", async () => {
      await post(app, { id: Bun.randomUUIDv7(), text: "task a" });
      await post(app, { id: Bun.randomUUIDv7(), text: "task b" });

      const res = await delAll(app);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");

      const listRes = await get(app);
      const body = (await listRes.json()) as TaskBody[];
      expect(body).toEqual([]);
    });
  });
});

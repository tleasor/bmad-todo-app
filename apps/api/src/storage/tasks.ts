import { type Database, db as defaultDb } from "./db";

export type Task = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
};

type TaskRow = {
  id: string;
  text: string;
  completed: number;
  createdAt: number;
  updatedAt: number;
};

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  text: row.text,
  completed: Boolean(row.completed),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export type TaskRepo = {
  list: () => Task[];
  get: (id: string) => Task | undefined;
  create: (input: { id: string; text: string }) => { task: Task; created: boolean };
  update: (id: string, input: { completed: boolean }) => Task | undefined;
  delete: (id: string) => boolean;
};

export const createTaskRepo = (db: Database): TaskRepo => {
  const list = (): Task[] => {
    const rows = db
      .query<TaskRow, []>(
        `SELECT id, text, completed, created_at AS createdAt, updated_at AS updatedAt
         FROM tasks
         ORDER BY id DESC`,
      )
      .all();
    return rows.map(toTask);
  };

  const get = (id: string): Task | undefined => {
    const row = db
      .query<TaskRow, [string]>(
        `SELECT id, text, completed, created_at AS createdAt, updated_at AS updatedAt
         FROM tasks
         WHERE id = ?`,
      )
      .get(id);
    return row ? toTask(row) : undefined;
  };

  const create = (input: { id: string; text: string }): { task: Task; created: boolean } => {
    const tx = db.transaction(() => {
      const now = Date.now();
      const result = db.run(
        `INSERT OR IGNORE INTO tasks (id, text, completed, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
        [input.id, input.text, now, now],
      );
      const created = result.changes === 1;
      const task = get(input.id);
      if (!task) {
        throw new Error("invariant: task missing after INSERT OR IGNORE");
      }
      return { task, created };
    });
    return tx();
  };

  // implemented in Story 2.1
  const update = (_id: string, _input: { completed: boolean }): Task | undefined => {
    throw new Error("taskRepo.update: implemented in Story 2.1");
  };

  // implemented in Story 3.1
  const remove = (_id: string): boolean => {
    throw new Error("taskRepo.delete: implemented in Story 3.1");
  };

  return { list, get, create, update, delete: remove };
};

// Lazy singleton: the default repo is created on first method call so importing
// this module never triggers env.DATABASE_PATH file I/O (matters for tests).
let _taskRepo: TaskRepo | undefined;
const ensureRepo = (): TaskRepo => {
  if (!_taskRepo) _taskRepo = createTaskRepo(defaultDb());
  return _taskRepo;
};

export const taskRepo: TaskRepo = {
  list: () => ensureRepo().list(),
  get: (id) => ensureRepo().get(id),
  create: (input) => ensureRepo().create(input),
  update: (id, input) => ensureRepo().update(id, input),
  delete: (id) => ensureRepo().delete(id),
};

export const __setTaskRepoForTests = (repo: TaskRepo): void => {
  _taskRepo = repo;
};

export const __resetTaskRepoForTests = (): void => {
  _taskRepo = undefined;
};

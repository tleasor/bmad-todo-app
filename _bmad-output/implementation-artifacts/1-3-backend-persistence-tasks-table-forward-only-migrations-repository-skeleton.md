# Story 1.3: Backend Persistence — Tasks Table, Forward-Only Migrations, Repository Skeleton

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the SQLite database, schema migrations, and tasks repository in place,
so that subsequent API stories can read and write tasks atomically against a real schema.

## Acceptance Criteria

1. **SQLite Database singleton (`apps/api/src/storage/db.ts`)** — exports an `openDb(path: string): Database` factory that constructs a `bun:sqlite` `Database`, applies the locked PRAGMAs in order (`journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`), and returns the connection. Also exports a lazy default `db` singleton that calls `openDb(env.DATABASE_PATH)` on first access (or eager at module load — dev's choice). The `Database` type is re-exported as `type Database = import("bun:sqlite").Database` for downstream consumers. Tests construct fresh in-memory databases via `openDb(":memory:")` so the PRAGMA path is exercised by every test (D2 + NFR-R3).
2. **Migration runner (`apps/api/src/storage/migrations/runner.ts`)** — exports `runMigrations(db: Database, options?: { dir?: string }): { applied: number[] }`. The runner: (a) creates the bootstrap table `schema_versions(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)` via `CREATE TABLE IF NOT EXISTS` if absent; (b) discovers all `*.up.sql` files from `options.dir ?? join(import.meta.dir, ".")` via `node:fs.readdirSync`; (c) sorts lexically (the `NNN_` numeric prefix gives correct chronological order); (d) extracts the integer version from the filename's leading digits (`001_create_tasks.up.sql` → `1`); (e) skips versions already in `schema_versions`; (f) for each unapplied migration, opens a `db.transaction(...)` that runs the SQL via `db.exec(sql)` AND inserts the `(version, Date.now())` row into `schema_versions` — both succeed or both roll back. Returns the list of versions applied this run (empty array on a no-op re-run).
3. **First migration (`apps/api/src/storage/migrations/001_create_tasks.up.sql`)** — creates the `tasks` table per architecture D2 exactly as specified: `id TEXT PRIMARY KEY NOT NULL`, `text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 500)`, `completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))`, `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL`. Use `CREATE TABLE` (not `CREATE TABLE IF NOT EXISTS`) so a corrupted partial state surfaces as a real error instead of being papered over — the `schema_versions` row is what guarantees idempotency, not the SQL itself.
4. **Migration runner tests (`apps/api/src/storage/migrations/runner.test.ts`)** — `bun:test` cases (using `openDb(":memory:")` plus the real SQL files via the default `dir`): (a) fresh DB → `runMigrations()` returns `{ applied: [1] }`, the `tasks` and `schema_versions` tables exist with the documented columns/types (use `PRAGMA table_info(tasks)` to assert column names + types + notnull + dflt_value flags, and the same for `schema_versions`); (b) running `runMigrations()` a second time on the same DB returns `{ applied: [] }`, leaves `schema_versions` row count at 1, and is non-destructive (existing rows in `tasks` survive); (c) **partially-applied scenario** — manually insert a `schema_versions` row for a non-existent version `999` plus run with version `1` unapplied, assert only version `1` runs and `999` stays untouched; (d) rolling back a failing migration — write a fixture migration directory containing a single bad SQL file (`002_bad.up.sql` with `INVALID SQL`), assert `runMigrations` throws, the `schema_versions` table has no row for version `2`, and the partial table state from the bad migration (if any) is rolled back (proving the transaction wrapper).
5. **Tasks repository skeleton (`apps/api/src/storage/tasks.ts`)** — exports the canonical `Task` type (`{ id: string; text: string; completed: boolean; createdAt: number; updatedAt: number }`) and a `taskRepo` factory or singleton with five methods: `list(): Task[]` (newest-first via `ORDER BY id DESC` since UUIDv7 IDs are time-ordered — D1), `get(id: string): Task | undefined`, `create(input: { id: string; text: string }): { task: Task; created: boolean }`, `update(id: string, input: { completed: boolean }): Task | undefined`, `delete(id: string): boolean`. The `created` flag on `create()` distinguishes a fresh insert (`true` → 201 caller path) from an idempotent retry hit on the existing row (`false` → 200 caller path); story 1.4 owns the HTTP status decision and the same-id-different-text → 409 conflict detection (caller compares the returned `task.text` to the request `input.text`). `update` and `delete` MAY be left as throwing stubs (`throw new Error("not implemented in 1.3")`) since Stories 2.1 / 3.1 own them; if the dev agent implements them anyway, they MUST follow the same camelCase ↔ snake_case translation pattern.
6. **Repository internals — camelCase ↔ snake_case boundary (`storage/tasks.ts`)** — every SELECT projects columns into camelCase keys (`SELECT id, text, completed, created_at AS createdAt, updated_at AS updatedAt FROM tasks`); every INSERT/UPDATE binds snake_case parameters explicitly. The boolean `completed` round-trips: SQLite stores `0`/`1` (per the CHECK constraint), JS sees `boolean` — convert via `Boolean(row.completed)` on read and `input.completed ? 1 : 0` on write. The repository file is the ONLY place in the codebase that touches snake_case column names; no other module references `created_at`, `updated_at`, or the SQL column casing.
7. **`taskRepo.create` idempotency via `INSERT OR IGNORE`** — `create({ id, text })` runs `INSERT OR IGNORE INTO tasks (id, text, completed, created_at, updated_at) VALUES (?, ?, 0, ?, ?)` (the two timestamps both equal `Date.now()` on insert). Use `db.run(...)` to capture the `changes` count: `changes === 1` means a fresh insert (`created: true`); `changes === 0` means the row already existed (`created: false`). Either way, follow the write with a `SELECT` against the PK and return the canonical row — never construct the returned `Task` from the input alone (the existing-row case requires returning what's actually persisted, since text may differ on the same-id-different-text retry path that Story 1.4 detects). The two statements are run inside a single `db.transaction(...)` so the read sees the post-insert state without a race window.
8. **Repository tests (`apps/api/src/storage/tasks.test.ts`)** — `bun:test` cases (fresh `:memory:` DB + `runMigrations` per test in `beforeEach`, NOT a shared singleton): (a) `list()` on empty DB returns `[]`; (b) `create({ id, text })` with a fresh id returns `{ task: { id, text, completed: false, createdAt: <number>, updatedAt: <number> }, created: true }` — assert `createdAt === updatedAt`, both > 0, both within the test's wall-clock window; (c) `create()` with an already-stored id and the same text returns `{ task: <existing>, created: false }` and the row count in `tasks` stays at 1; (d) `create()` with an already-stored id and DIFFERENT text returns `{ task: <existing-with-original-text>, created: false }` (the original text wins, mirroring `INSERT OR IGNORE` semantics — this is the row Story 1.4's caller compares against to detect the 409 conflict); (e) `list()` after three creates returns the three tasks in newest-first order (the third id sorts before the second, which sorts before the first — UUIDv7 monotonicity); (f) `get(id)` returns the task for an existing id and `undefined` for a missing id. Each test creates its own DB so tests can run in parallel without interference. **No mocking of `bun:sqlite`** — real DB, real schema, fast (`:memory:` is microseconds-per-statement).
9. **Boot sequence wires migrations into `apps/api/src/index.ts`** — at module load (before `app.listen()` runs), the file imports `db` from `./storage/db`, imports `runMigrations` from `./storage/migrations/runner`, and runs migrations inside a `try/catch`. On success: log `logger.info("migrations applied", { applied: result.applied })` (omit the field if `result.applied` is empty to keep the no-op path quiet on restart). On failure: log `logger.error("migrations failed", { stack: err.stack, message: err.message })`, set the readiness state to "failed" (see AC #10), and KEEP THE SERVER RUNNING — `app.listen()` still binds the port so `/health` can answer 503 with the envelope. Do NOT `process.exit()` on migration failure; the operator needs `/health` reachable to surface the failure cleanly to the platform.
10. **Readiness state surface — health returns 503 when migrations have not yet succeeded (NFR-R5, FR31)** — introduce a tiny readiness module so `health.ts` and `index.ts` agree on a single source of truth. Choose ONE of:

    **Option A (recommended) — `apps/api/src/storage/db.ts` owns the state:**
    ```ts
    let _ready = false;
    let _initError: Error | undefined;
    export const setDbReady = (): void => { _ready = true; _initError = undefined; };
    export const setDbFailed = (err: Error): void => { _ready = false; _initError = err; };
    export const getDbStatus = (): { ready: boolean; error: Error | undefined } => ({ ready: _ready, error: _initError });
    ```
    `index.ts` calls `setDbReady()` after `runMigrations` succeeds and `setDbFailed(err)` in the catch. `routes/health.ts` imports `getDbStatus`.

    **Option B — `apps/api/src/readiness.ts` standalone module** with the same shape, if the dev agent prefers symmetry with the existing `errors/` module separation.

    Document the choice in a one-line comment at the top of the chosen module. Either way, `routes/health.ts` MUST: when ready → return `200 { status: "ok", uptime: process.uptime() }` (unchanged); when not ready → set status `503` and return `errorEnvelope("service_unavailable", "Database migrations have not completed", requestId, env.IS_DEV ? { message: error?.message } : undefined)`. The `requestId` is read from the request via `getRequestId(request)` (re-using Story 1.2's WeakMap), with the same fallback semantics as the global `onError`. The `// Story 1.4: this route must be exempt from rateLimit middleware.` comment stays at the top of `health.ts` — Story 1.4 still owns that exemption.

11. **Health route tests (`apps/api/src/routes/health.test.ts`) updated** — extend the existing file with cases for the not-ready path. Use the chosen readiness module's setters in `beforeEach`/`afterEach` to flip the state. Cases: (a) when ready → status 200, body `{ status: "ok", uptime: <number> }` (existing case, keep); (b) when failed → status 503, body matches the error envelope shape exactly (`{ error: { code: "service_unavailable", message, details? }, requestId }`), `Content-Type` is JSON, the `requestId` is a non-empty string; (c) ready state can be flipped back via `setDbReady()` — i.e., the module is not write-once. **Reset the readiness state in `afterEach`** so other tests don't see stale "failed" state — this is the only piece of mutable module-level state in the `apps/api` runtime; treat it carefully.
12. **Boot integration test (`apps/api/src/index.test.ts` extended)** — add a single `describe("boot integration", ...)` block that exercises the migration → health round-trip via the live `app`. Cases: (a) after `import { app } from "./index"` (which triggers boot-time migration), `app.handle("/health")` returns 200 with the OK body; (b) (optional, time-permitting) flip the readiness module to "failed" via the exported setter and assert `/health` returns 503 with the envelope, then restore it. Do NOT add a test that simulates a real migration failure mid-boot — the import is one-shot; the failure-path coverage lives in `health.test.ts` via the readiness setter.
13. **Coverage gate stays green (NFR-M1)** — `bun run check:full` passes after this story: `bun scripts/check-coverage.ts` reports aggregate `% Funcs >= 70` AND `% Lines >= 70` across `apps/web` + `apps/api`. New modules (`storage/db.ts`, `storage/migrations/runner.ts`, `storage/tasks.ts`) MUST contribute meaningful tests — each public function has at least one behavioral assertion (not just "doesn't throw"). The repository's `update`/`delete` stubs (if left as throwing stubs per AC #5) are exempt from coverage minimums for THIS story; mark them with a one-line comment `// implemented in Story 2.1 / 3.1` so the next dev agent can find them.
14. **Implementation patterns honored (D5, D8, Implementation Patterns docs)** — named exports only (no `export default`); `import type` for type-only imports (e.g. `import type { Database } from "bun:sqlite"`); `describe` / `it` (not `test`); no `console.log` outside the existing `log.ts` (use `logger.*`); no `any` (use `unknown` and narrow); no magic numbers (`SCHEMA_VERSIONS_TABLE` and `MIGRATIONS_GLOB` are named constants in `storage/migrations/runner.ts` if used more than once); explicit return types on all exported functions; **NO inline SQL in route handlers** (this story does not add routes; the rule is enforced when Story 1.4 adds them). The repository is the single home of SQL.

## Tasks / Subtasks

- [x] **Task 1 — Database connection and PRAGMAs** (AC: #1, #14)
  - [x] Create `apps/api/src/storage/db.ts`. Import `Database` from `"bun:sqlite"` (use `import { Database } from "bun:sqlite"` — it's a class export; `import type` won't work because we instantiate it).
  - [x] Implement `openDb(path: string): Database`: `const db = new Database(path); db.exec("PRAGMA journal_mode = WAL"); db.exec("PRAGMA synchronous = NORMAL"); db.exec("PRAGMA foreign_keys = ON"); db.exec("PRAGMA busy_timeout = 5000"); return db;`. Note: `journal_mode = WAL` is a no-op on `:memory:` databases (SQLite silently keeps `MEMORY` journal); the test path must still apply the PRAGMA call so the production path is exercised. WAL applies on real file-backed paths.
  - [x] Export `Database` as a re-exported type: `export type { Database } from "bun:sqlite";` — this is the public surface the repository and migration runner type against.
  - [x] Default singleton: `let _db: Database | undefined; export const db = (): Database => { if (!_db) _db = openDb(env.DATABASE_PATH); return _db; };` OR eager-load: `export const db = openDb(env.DATABASE_PATH);`. Eager-load is simpler; lazy is safer if test files import from `db.ts` without wanting the production `tasks.db` to be opened. **Recommended: lazy-load** — if the `db()` getter pattern feels awkward, the alternative is to NOT export an eager singleton at all and require all callers to construct their own connection from `openDb(env.DATABASE_PATH)` at boot in `index.ts`.
  - [x] Add the readiness setters/getters per AC #10 Option A in this same file (`setDbReady`, `setDbFailed`, `getDbStatus`). Module-level `let _ready = false; let _initError: Error | undefined;`. This is the ONLY mutable module-level state in the backend; document with a one-line comment why.
  - [x] Add `apps/api/src/storage/db.test.ts`. Cases: `openDb(":memory:")` returns a working Database (`db.query("SELECT 1 AS x").get()` returns `{ x: 1 }`); the four PRAGMAs are applied (verify via `db.query("PRAGMA foreign_keys").get()` returns `{ foreign_keys: 1 }`, `PRAGMA busy_timeout` returns `5000`, `PRAGMA synchronous` returns `1` — `NORMAL` is integer mode 1; `journal_mode` returns `"memory"` for `:memory:` paths but the call should NOT throw); readiness setters/getters round-trip correctly (`getDbStatus()` defaults to `{ ready: false, error: undefined }`; after `setDbReady()` returns `{ ready: true, error: undefined }`; after `setDbFailed(new Error("x"))` returns `{ ready: false, error: <Error> }`).

- [x] **Task 2 — Migration runner** (AC: #2, #4, #14)
  - [x] Create `apps/api/src/storage/migrations/runner.ts`. Imports: `import { readFileSync, readdirSync } from "node:fs"; import { join } from "node:path"; import type { Database } from "../db";`.
  - [x] Module-level constant: `const SCHEMA_VERSIONS_DDL = ` the bootstrap CREATE TABLE IF NOT EXISTS for `schema_versions`. Expose `export const SCHEMA_VERSIONS_TABLE = "schema_versions"` so the test suite can query it without hardcoding the name.
  - [x] Helper: `const parseVersion = (filename: string): number | undefined`. Match the leading digit run via `/^(\d+)_/`; return `undefined` (not `NaN`) on no match. The runner SKIPS files whose filename does not match the convention — this lets us drop unrelated `.sql` files (e.g. `_seed.sql` — though we don't have any) without confusing the runner. Log `logger.warn("migration file skipped", { file })` for any skipped file.
  - [x] Public API:
    ```ts
    export const runMigrations = (
      db: Database,
      options?: { dir?: string },
    ): { applied: number[] } => {
      const dir = options?.dir ?? join(import.meta.dir, ".");
      db.exec(SCHEMA_VERSIONS_DDL);
      const applied = new Set<number>(
        db.query<{ version: number }, []>(`SELECT version FROM ${SCHEMA_VERSIONS_TABLE}`)
          .all()
          .map((r) => r.version),
      );
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".up.sql"))
        .sort();
      const newlyApplied: number[] = [];
      for (const file of files) {
        const version = parseVersion(file);
        if (version === undefined) {
          logger.warn("migration file skipped", { file });
          continue;
        }
        if (applied.has(version)) continue;
        const sql = readFileSync(join(dir, file), "utf8");
        db.transaction(() => {
          db.exec(sql);
          db.run(
            `INSERT INTO ${SCHEMA_VERSIONS_TABLE} (version, applied_at) VALUES (?, ?)`,
            [version, Date.now()],
          );
        })();
        newlyApplied.push(version);
        logger.info("migration applied", { version, file });
      }
      return { applied: newlyApplied };
    };
    ```
  - [x] **Important — Bun.Database typing for `query<Result, Params>`:** Bun's bun:sqlite types expect `query<RowType, ParamsType>(sql)`. If TypeScript complains about the type arguments, fall back to `.query(sql).all() as { version: number }[]`. The strict-typed form is preferred when it works; either is acceptable.
  - [x] Create `apps/api/src/storage/migrations/runner.test.ts`. Use a tmp dir for the failing-migration case via `mkdtempSync(join(tmpdir(), "migrations-"))`. Always pass an explicit `dir` option in tests OTHER than the "real migrations" case so a co-resident bad fixture doesn't pollute the test that uses the production `001_create_tasks.up.sql`.
  - [x] Test cases (each with a fresh `openDb(":memory:")` in a `beforeEach`):
    - "applies migration 001 on a fresh DB and returns `{ applied: [1] }`": call `runMigrations(db)` (no `dir` option → uses real migrations); assert `result.applied` equals `[1]`; assert `tasks` table exists via `db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get()`; assert `schema_versions` has one row with version `1` and `applied_at` is a recent integer.
    - "is a no-op on second run": run twice; second run returns `{ applied: [] }`; `schema_versions` row count stays at 1.
    - "honors a partially-applied schema_versions": pre-insert `(999, Date.now())` into `schema_versions` (after first creating the table via a manual DDL), then run with the real migrations dir; assert version `1` runs (added to `applied`) and `999` is left alone (not in `applied`).
    - "rolls back the transaction when a migration's SQL throws": create a tmp dir, write `002_bad.up.sql` containing `CREATE TABLE wat (id INT); INVALID SQL HERE;`; first run `runMigrations(db, { dir: realMigrationsDir })` to apply `001`; then run `runMigrations(db, { dir: tmpDir })` — wrap in `expect(() => ...).toThrow()`; assert `schema_versions` has NO row for version `2`; assert the `wat` table does NOT exist (`db.query("SELECT name FROM sqlite_master WHERE name='wat'").get()` returns `null`/`undefined`) — this proves the transaction wrapped both statements.
    - "skips files that do not match the NNN_ prefix convention": tmp dir with one valid file `010_extra.up.sql` (e.g. `CREATE TABLE extra(id INT)`) and one ignored file `notes.up.sql`; assert `applied` contains `10` and the test does not throw on the misnamed file.
    - "PRAGMA `table_info(tasks)` returns the documented schema": after running migration 001, query `PRAGMA table_info(tasks)` and assert each row's `name`, `type`, `notnull`, `dflt_value`, `pk` matches D2 exactly. For `completed`, also assert via a SELECT against a CHECK violation that `completed = 2` is rejected (`expect(() => db.run("INSERT INTO tasks ...")).toThrow()`).

- [x] **Task 3 — First migration SQL** (AC: #3)
  - [x] Delete `apps/api/src/storage/migrations/.gitkeep`.
  - [x] Create `apps/api/src/storage/migrations/001_create_tasks.up.sql` with the exact schema from D2:
    ```sql
    CREATE TABLE tasks (
      id          TEXT    PRIMARY KEY NOT NULL,
      text        TEXT    NOT NULL CHECK(length(text) BETWEEN 1 AND 500),
      completed   INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    ```
  - [x] No trailing comments inside the SQL file (keep it byte-identical to the architecture doc).
  - [x] Verify the file is included in the runtime image by checking that the existing `Dockerfile` copies `apps/api/src/` (it does, per Story 1.1 — no Docker change needed in this story; if the dev agent finds a glob exclusion that would skip `*.sql`, that's a Story 1.1 regression and should be reported).

- [x] **Task 4 — Tasks repository** (AC: #5, #6, #7, #8, #14)
  - [x] Create `apps/api/src/storage/tasks.ts`. Imports: `import type { Database } from "./db"; import { db as defaultDb } from "./db";` (or the eager singleton equivalent — match Task 1's choice).
  - [x] Define and export the `Task` type:
    ```ts
    export type Task = {
      id: string;
      text: string;
      completed: boolean;
      createdAt: number;
      updatedAt: number;
    };
    ```
  - [x] Define internal row type for SELECT projections:
    ```ts
    type TaskRow = {
      id: string;
      text: string;
      completed: number;       // SQLite stores 0/1
      createdAt: number;
      updatedAt: number;
    };
    const toTask = (row: TaskRow): Task => ({ ...row, completed: Boolean(row.completed) });
    ```
  - [x] Factory pattern (recommended, supports DI for tests):
    ```ts
    export const createTaskRepo = (db: Database) => {
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
        const now = Date.now();
        const tx = db.transaction(() => {
          const result = db.run(
            `INSERT OR IGNORE INTO tasks (id, text, completed, created_at, updated_at)
             VALUES (?, ?, 0, ?, ?)`,
            [input.id, input.text, now, now],
          );
          const created = result.changes === 1;
          const task = get(input.id);
          if (!task) throw new Error("invariant: task missing after INSERT OR IGNORE");
          return { task, created };
        });
        return tx();
      };

      const update = (_id: string, _input: { completed: boolean }): Task | undefined => {
        throw new Error("taskRepo.update: implemented in Story 2.1");
      };

      const remove = (_id: string): boolean => {
        throw new Error("taskRepo.delete: implemented in Story 3.1");
      };

      return { list, get, create, update, delete: remove };
    };

    export const taskRepo = createTaskRepo(defaultDb);
    ```
    Naming note: `delete` is a reserved word but is fine as an object key. The internal local variable is `remove` to avoid the reserved word in declarations.
  - [x] Create `apps/api/src/storage/tasks.test.ts`. Each test creates its own DB via `beforeEach`:
    ```ts
    let testDb: Database;
    let repo: ReturnType<typeof createTaskRepo>;
    beforeEach(() => {
      testDb = openDb(":memory:");
      runMigrations(testDb, { dir: join(import.meta.dir, "migrations") });
      repo = createTaskRepo(testDb);
    });
    ```
  - [x] Test cases (covering AC #8): empty list; create with fresh id (assert task fields, `created: true`, timestamps within `[before, after]` window); idempotent same-id same-text retry (`created: false`, single row in DB); idempotent same-id different-text (`created: false`, returned `task.text` is the ORIGINAL — proves `INSERT OR IGNORE` semantics for the 1.4 conflict-detection contract); newest-first ordering of three creates with monotonic UUIDv7 ids (use `Bun.randomUUIDv7()` for test ids; spread the calls with a 1-2ms `await Bun.sleep(2)` between them to guarantee monotonic timestamps drive the ordering); `get()` happy + missing.
  - [x] **Test for the camelCase-only boundary:** add a smoke test asserting that `taskRepo.list()[0]` has the keys `["id", "text", "completed", "createdAt", "updatedAt"]` (exactly — no `created_at`/`updated_at`). The cleanest assertion: `expect(Object.keys(task).sort()).toEqual(["completed", "createdAt", "id", "text", "updatedAt"])`. This guards the boundary contract from regression.

- [x] **Task 5 — Wire migrations into boot + readiness state** (AC: #9, #10, #11, #12)
  - [x] Update `apps/api/src/index.ts`:
    - Add imports: `import { db, setDbReady, setDbFailed } from "./storage/db"; import { runMigrations } from "./storage/migrations/runner";`.
    - At module load (top-level, before the `Elysia` chain), wrap migrations in try/catch:
      ```ts
      try {
        const result = runMigrations(db());      // or `runMigrations(db)` if eager singleton
        setDbReady();
        if (result.applied.length > 0) logger.info("migrations applied", { applied: result.applied });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setDbFailed(error);
        logger.error("migrations failed", { stack: error.stack, message: error.message });
      }
      ```
    - **Do NOT wrap in `if (import.meta.main)`** — migrations must run when the module is imported by tests too, so `app.handle("/health")` reflects the real ready state. The test that wants to bypass migrations would import `db.ts`/`runner.ts` directly, not `index.ts`.
    - Confirm the `app.listen(...)` block stays inside `if (import.meta.main)` — the listening side-effect is gated, but boot-time migrations are not. This split is intentional.
  - [x] Update `apps/api/src/routes/health.ts`:
    - Keep the `// Story 1.4: this route must be exempt from rateLimit middleware.` comment as line 1.
    - Import `getDbStatus` from `../storage/db`, `getRequestId` from `../middleware/requestLogger`, `errorEnvelope` from `../errors/envelope`, `env` from `../env`.
    - Replace the body:
      ```ts
      export const healthRoute = new Elysia().get("/health", ({ request, set }) => {
        const status = getDbStatus();
        if (status.ready) return { status: "ok", uptime: process.uptime() };
        set.status = 503;
        const requestId = getRequestId(request) ?? Bun.randomUUIDv7();
        return errorEnvelope(
          "service_unavailable",
          "Database migrations have not completed",
          requestId,
          env.IS_DEV ? { message: status.error?.message } : undefined,
        );
      });
      ```
  - [x] Update `apps/api/src/routes/health.test.ts`:
    - Existing case continues to pass (boot-time migration sets ready before tests run, so `/health` responds 200). KEEP the existing assertions; add a `describe("when migrations have failed", ...)` block that calls `setDbFailed(new Error("test failure"))` in `beforeEach` and `setDbReady()` in `afterEach`. **Do not skip the `afterEach` reset** — leaving the readiness state stuck at "failed" will fail every other test in the suite that depends on `/health` returning 200 (boot integration test in `index.test.ts`, the `/health` Playwright smoke spec).
    - Cases for the failed branch: status 503; body `error.code === "service_unavailable"`; `body.error.message` is non-empty; `Content-Type` includes `application/json`; `body.requestId` is a non-empty string; in `IS_DEV` (process.env.NODE_ENV !== 'production' — the default in tests), `body.error.details.message === "test failure"`.
    - Re-readiness flip: assert that calling `setDbReady()` after `setDbFailed()` returns the route to 200. This proves the readiness module is not write-once.
  - [x] Update `apps/api/src/index.test.ts`:
    - Add `describe("boot integration", ...)`: a single `it("/health returns 200 after boot-time migrations applied", ...)` test that does `expect((await app.handle(new Request("http://localhost/health"))).status).toBe(200)`. This is mostly redundant with `health.test.ts` but it proves the full integrated boot path (import `index.ts` → migrations run → readiness flips → health returns 200) is wired correctly.

- [x] **Task 6 — Verify all check scripts pass** (AC: #13)
  - [x] Run `bun run check` (oxlint + oxfmt + tsgo + dep-count) — green.
  - [x] Run `bun run check:full` — green; `scripts/check-coverage.ts` reports both `% Funcs >= 70` and `% Lines >= 70` across both packages. If coverage drops because the `update`/`delete` stubs throw without a test, that's expected — the AC permits it. If coverage drops because the new modules don't have enough behavioral assertions, ADD assertions; do NOT lower the threshold.
  - [x] Run `bun run check:release` — green (Playwright multi-browser smoke + Lighthouse). The `e2e/smoke.spec.ts` hits `/health`; verify it still passes (the boot-time migration runs before `app.listen`, so `/health` is 200 from the first request).
  - [x] `docker compose up --build` — `docker compose logs` shows: (a) the request-logger entry+exit JSON lines for `/health`, (b) a `migrations applied` info line on first boot with `applied: [1]`, (c) NO `migrations applied` line on subsequent boots (the `applied.length > 0` gate), (d) the `tasks.db` file exists in the mounted `/data` volume. `docker compose down && docker compose up --build` (no volume removal) shows the same `tasks.db` survives (FR13).

- [x] **Task 7 — Quick review pass against architecture and previous-story patterns** (AC: #14)
  - [x] Re-read `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md` § "Backend handler discipline" + "Anti-Patterns". Confirm: no inline SQL outside `storage/`; named exports only; no `console.log`; no `any`; explicit return types on exported functions; `import type` used for type-only imports.
  - [x] Re-read `_bmad-output/planning-artifacts/architecture/core-architectural-decisions.md` § D1 + D2. Confirm: `id TEXT PRIMARY KEY` matches D1; PRAGMAs match D2 exactly; the schema in `001_create_tasks.up.sql` matches D2's CHECK constraints exactly; forward-only — no `*.down.sql` files in the migrations directory.
  - [x] Run `git grep -n "created_at\\|updated_at"` and confirm the only matches are inside `apps/api/src/storage/` (the SQL file, the SELECT alias, the INSERT column list). If any match is outside that directory, the camelCase boundary has leaked — fix before declaring the story done.
  - [x] Run `git grep -n "console\\.\\(log\\|warn\\|error\\)"` and confirm the only matches are inside `apps/api/src/log.ts` (the implementation), inside `*.test.ts` files, or inside `scripts/`. Production code uses `logger.*`.

### Review Findings

<!-- Populated by code-review workflow after dev-story completes -->

## Dev Notes

### Critical context for the dev agent

This is **Story 1.3 of 30** — the THIRD implementation story in Epic 1. The repo already has Story 1.1's monorepo scaffold and Story 1.2's logger / error envelope / request-logger middleware / global `onError` / `routes/health.ts`. **This story is the data layer foundation** — every subsequent backend story (1.4 GET+POST `/api/tasks`, 2.1 PATCH, 3.1 DELETE) depends on the repository pattern, the migration runner, and the `Task` type that this story defines.

**This story is plumbing — it does NOT introduce HTTP routes for tasks**. Out-of-scope work this story must NOT do:

- Adding `GET /api/tasks` or `POST /api/tasks` routes (Story 1.4 owns `routes/tasks.ts`).
- Implementing rate-limit middleware or body-size limit middleware (Story 1.4).
- Implementing `taskRepo.update` (Story 2.1) or `taskRepo.delete` (Story 3.1) bodies — they are throwing stubs in this story.
- Frontend changes — none.
- Modifying `apps/api/src/log.ts`, `apps/api/src/errors/*`, `apps/api/src/middleware/requestLogger.ts`, `apps/api/src/onError.ts` — those are Story 1.2 surfaces.
- Modifying `apps/api/src/env.ts` — Story 1.1 finalized it; the existing `DATABASE_PATH` field is what this story consumes.
- Adding any npm dependency. `bun:sqlite` is a Bun runtime built-in — `import { Database } from "bun:sqlite"`. No `better-sqlite3`, no `sqlite3`, no `drizzle-orm`, no `kysely`, no `prisma`. **D2 locks zero deps for the storage layer.**

The scope is: SQLite Database + PRAGMAs + a forward-only migration runner + the first migration's tasks-table SQL + the repository skeleton with `INSERT OR IGNORE` idempotency on `create` + readiness state + boot wiring + tests for all of the above. Nothing more.

### Locked architectural decisions (non-negotiable)

| Concern | Decision | Source |
|---|---|---|
| SQLite client | `bun:sqlite` (built into Bun 1.3.11). No external SQLite package. | core-architectural-decisions.md → D2 + Updated Dependency Matrix |
| ID type | `TEXT PRIMARY KEY NOT NULL`; client-generated UUIDv7 strings (D1) | D1 + D2 |
| Schema | Single `tasks` table per D2 exactly (5 columns; CHECK on text length and completed in {0,1}) | D2 |
| PRAGMAs | `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000` — applied on every `openDb` call | D2 |
| Migrations | Hand-rolled runner, forward-only, `*.up.sql` files in lexical order, tracked in `schema_versions(version INTEGER PK, applied_at INTEGER)` | D2 |
| No down migrations | Recovery is filesystem backup of `tasks.db`. No `*.down.sql` files. | D2 |
| Repository pattern | Routes call `taskRepo.x()`; no inline SQL in handlers | implementation-patterns-consistency-rules.md → "Backend handler discipline" |
| camelCase ↔ snake_case | Repository is the ONLY translator. JSON / TS keys are camelCase; columns are snake_case. | D3 + Implementation Patterns "Naming Conventions" |
| Idempotency on create | `INSERT OR IGNORE` against the PK (D1's UUIDv7 ID is the idempotency key) | D1 + D2 + FR29 |
| Atomic ops | Single-statement queries from the repo; transactions only when reading a row immediately after writing it | NFR-R3 |
| Newest-first list | `ORDER BY id DESC` — UUIDv7's time-prefix sorts naturally; no `ORDER BY created_at` needed | D1 + D3 |
| Readiness gate on health | `/health` returns 503 with the error envelope until migrations have applied successfully | FR31 + NFR-R5 |

### `bun:sqlite` API — what to use, what to avoid

Bun 1.3.11 ships `bun:sqlite` natively. The relevant API surface for this story:

```ts
import { Database } from "bun:sqlite";

const db = new Database(":memory:");           // or new Database("./tasks.db") or new Database(path, { create: true })
db.exec("PRAGMA journal_mode = WAL");          // for DDL / multi-statement / no-binding execution
db.run("INSERT INTO tasks (...) VALUES (?, ?)", [id, text]);   // returns { changes: number, lastInsertRowid: number | bigint }
db.query<RowType, ParamsTuple>("SELECT ...").all();            // returns RowType[]
db.query<RowType, ParamsTuple>("SELECT ...").get(...params);   // returns RowType | null

const tx = db.transaction(() => { /* statements */ return value; });
tx();   // commits; on throw rolls back; nested calls re-enter
```

**Use:**
- `db.exec(sql)` for the migration SQL files (multi-statement OK; no parameter binding).
- `db.query<R, P>(sql)` for parameterized SELECTs (preferred over `prepare` — bun:sqlite caches the prepared statement automatically).
- `db.run(sql, params)` for INSERT/UPDATE/DELETE — capture `result.changes` to detect idempotent retries.
- `db.transaction(fn)` for atomic multi-statement work.

**Avoid:**
- `db.prepare(sql)` followed by `.run()`/`.all()` outside a tight loop — `db.query` is the modern API; `prepare` is the lower-level alternative.
- `db.serialize()` — that's `node-sqlite3`'s API; bun:sqlite is synchronous.
- Returning a `Statement` from an exported function — keep prepared statements module-local; the repository methods return rows or row arrays.
- `db.loadExtension` — not needed.
- Multi-statement strings inside `db.run()` — use `db.exec()` for those.

Reference: [bun:sqlite docs](https://bun.sh/docs/api/sqlite).

### Migration runner — design choices to match

Two design points the dev agent must NOT silently change:

1. **The `schema_versions` table is created via `CREATE TABLE IF NOT EXISTS` inside the runner — not via a `000_init.up.sql` file.** Bootstrapping the tracking table from a tracked migration would be a chicken-and-egg loop. The runner owns the bootstrap step; the first numbered migration (`001_create_tasks.up.sql`) is regular application schema.

2. **Each migration runs inside its own `db.transaction`, not one giant transaction wrapping all unapplied migrations.** Reason: if migration `005` fails on a real production DB that already has `001`–`004` applied, we want `001`–`004`'s `schema_versions` rows committed and `005`'s rolled back. The forward-only recovery path is "fix the broken migration, ship a new build, re-run". Conversely, within a single migration, the SQL statements AND the `schema_versions` insert MUST be in one transaction so a crash mid-migration doesn't leave the schema partially applied with no version row to mark it.

3. **The runner sorts files lexically, not by parsing version numbers first.** The `NNN_` prefix convention forces lexical order to match chronological order. If we ever pass `010` (two-digit prefix coexisting with three-digit prefixes), lexical sort will mis-order — we'll bump to four-digit prefixes before that's a problem. For this MVP, `001` ... `999` is more than enough.

### `INSERT OR IGNORE` semantics — what the conflict-detection contract is

Story 1.4 owns the HTTP-status decision for the POST `/api/tasks` flow, but the SQL semantics are LOCKED in this story:

- Same id, same text (idempotent retry from a flaky network) → `INSERT OR IGNORE` skips; `changes === 0`; the existing row is returned. Story 1.4 maps this to `200 OK`.
- Same id, different text (someone else minted the same UUIDv7 — astronomically unlikely, but the contract handles it deterministically) → `INSERT OR IGNORE` still skips; `changes === 0`; the EXISTING row (with the original text) is returned. Story 1.4's caller compares `returned.task.text` to the request `input.text` and emits `409 id_conflict` when they differ.
- Fresh id → `INSERT OR IGNORE` inserts; `changes === 1`; the new row is returned. Story 1.4 maps this to `201 Created`.

This is why `taskRepo.create` returns `{ task, created }` — the `created` boolean tells the caller "this is a fresh insert", and the `task.text` is what the caller compares to detect the 409 case. **Do NOT design `create` to return `null` on conflict and require the caller to call `get()` separately** — the round-trip cost is the same and the API surface is worse.

### Health route 503 path — why we don't `process.exit`

NFR-R5 requires the health endpoint to "report status within 5 seconds of container start and return HTTP 200 when the product is ready to serve requests". The implication is that the inverse case — not ready — must surface as a real HTTP response, not a refused connection. If the process exited on migration failure, the platform's healthcheck would see "connection refused" and either restart the container in a loop or mark it broken without surfacing why.

Instead: the server stays running, `/health` returns 503 with the error envelope including (in dev) the migration error message in `details`. Operators reading `docker compose logs` see the full structured error log line. The 503 + envelope contract reuses Story 1.2's envelope so client code (Eden Treaty later, ops tools today) gets a single error shape.

The pattern is symmetric with the no-database-yet startup window: even a successful migration run takes a few hundred ms. If a load balancer hits `/health` between `app.listen()` and `setDbReady()`, it sees 503; once ready, 200. This is fine — the readiness state is the source of truth.

### Why `taskRepo.update` and `taskRepo.delete` are stubs in this story

The architecture mandates `taskRepo` exports `list / get / create / update / delete`, but only `create` + `list` (+ `get` as an internal helper for `create`) are used by Story 1.4's GET+POST endpoints. Story 2.1 (`PATCH`) and Story 3.1 (`DELETE`) are the natural homes for the `update` and `delete` implementations.

Two valid approaches; either is acceptable:

- **Throwing stubs (recommended).** `update(id, input) { throw new Error("taskRepo.update: implemented in Story 2.1"); }`. Pro: any accidental call surfaces fast and loud. Con: the signatures must be kept up-to-date (no real test exercises them).
- **Full implementation now.** Pro: the next story has zero work. Con: scope creep — and the `update` signature might evolve when Story 2.1's `PATCH` schema is finalized (e.g., do we accept partial updates? Just `completed`? Add `text` later?). The current contract is "target-state for `completed` only" per D3, so the signature is stable, but the test surface for an unused method is dead weight in this story's coverage.

The AC permits both (AC #5: "MAY be left as throwing stubs"). Pick throwing stubs unless you have a strong reason otherwise.

### `AppError.cause` is not yet supported (deferred from Story 1.2)

Per `_bmad-output/implementation-artifacts/deferred-work.md`: `AppError`'s constructor does NOT accept the standard `ErrorOptions.cause`. If the migration runner or repository wraps a SQLite error in an `AppError`, the original stack is lost. **Workaround for THIS story:** when a migration / DB error needs to bubble out as an `AppError` (it shouldn't in 1.3 — the runner's errors fail boot and are logged with the full stack via `logger.error`), include the original `error.message` and `error.stack` as fields in the log line, not in the AppError. The repository methods themselves do NOT throw `AppError` — they let `bun:sqlite`'s native errors propagate; the boundary that converts to `AppError` is the route handler in Story 1.4 and the boot-time `try/catch` in `index.ts`.

If you find a case where you need to wrap-and-rethrow with cause-chain preservation, add the `cause` parameter to `AppError` as part of THIS story (it's a one-line change) and remove the bullet from `deferred-work.md`. Otherwise, leave it for the story that genuinely needs it.

### File structure to create / modify

**Files this story creates:**

```
apps/api/src/storage/db.ts                                   + .test.ts
apps/api/src/storage/tasks.ts                                + .test.ts
apps/api/src/storage/migrations/runner.ts                    + .test.ts
apps/api/src/storage/migrations/001_create_tasks.up.sql
```

**Files this story modifies:**

- `apps/api/src/index.ts` — add boot-time migration block (try/catch around `runMigrations(db)`); set readiness state; do NOT gate migrations behind `import.meta.main` (the listening side-effect stays gated, but boot-time data setup must run on import too).
- `apps/api/src/index.test.ts` — add a `boot integration` describe with one `/health → 200` test.
- `apps/api/src/routes/health.ts` — consult readiness state; return 503 + error envelope when not ready; preserve the Story 1.4 rate-limit comment.
- `apps/api/src/routes/health.test.ts` — extend with not-ready cases; ensure `afterEach` resets the readiness state.

**Files this story must NOT modify:**

- `apps/api/src/env.ts` (locked in 1.1).
- `apps/api/src/log.ts`, `apps/api/src/errors/*`, `apps/api/src/middleware/requestLogger.ts`, `apps/api/src/onError.ts` (locked in 1.2).
- `apps/api/src/constants.ts` — empty placeholder; can stay empty; do NOT rehome storage-layer constants here (they belong in `storage/migrations/runner.ts` as module-local constants).
- `apps/api/package.json` — no new deps. If `bun-types` is somehow missing the `bun:sqlite` types (it shouldn't be on Bun 1.3.11's bun-types 1.3.11), report it as a separate issue, do NOT add `@types/better-sqlite3` or anything else.
- Anything in `apps/web/`.

**Files this story must DELETE:**

- `apps/api/src/storage/migrations/.gitkeep` — replaced by the real `001_create_tasks.up.sql`.

### Concrete code shapes (recommended)

**`apps/api/src/storage/db.ts`:**

```ts
import { Database } from "bun:sqlite";
import { env } from "../env";

export type { Database } from "bun:sqlite";

export const openDb = (path: string): Database => {
  const database = new Database(path);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  return database;
};

let _db: Database | undefined;
export const db = (): Database => {
  if (!_db) _db = openDb(env.DATABASE_PATH);
  return _db;
};

// Module-level mutable state — the only such state in `apps/api/src/`.
// Tracks migration readiness so /health can return 503 until the schema is in place (NFR-R5).
let _ready = false;
let _initError: Error | undefined;

export const setDbReady = (): void => {
  _ready = true;
  _initError = undefined;
};

export const setDbFailed = (err: Error): void => {
  _ready = false;
  _initError = err;
};

export const getDbStatus = (): { ready: boolean; error: Error | undefined } => ({
  ready: _ready,
  error: _initError,
});
```

**`apps/api/src/storage/migrations/runner.ts`:** see Task 2 above for the full skeleton.

**`apps/api/src/storage/migrations/001_create_tasks.up.sql`:**

```sql
CREATE TABLE tasks (
  id          TEXT    PRIMARY KEY NOT NULL,
  text        TEXT    NOT NULL CHECK(length(text) BETWEEN 1 AND 500),
  completed   INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

**`apps/api/src/storage/tasks.ts`:** see Task 4 above for the full skeleton.

**`apps/api/src/routes/health.ts` (modified):**

```ts
// Story 1.4: this route must be exempt from rateLimit middleware.
import { Elysia } from "elysia";
import { env } from "../env";
import { errorEnvelope } from "../errors/envelope";
import { getRequestId } from "../middleware/requestLogger";
import { getDbStatus } from "../storage/db";

export const healthRoute = new Elysia().get("/health", ({ request, set }) => {
  const status = getDbStatus();
  if (status.ready) return { status: "ok", uptime: process.uptime() };
  set.status = 503;
  const requestId = getRequestId(request) ?? Bun.randomUUIDv7();
  return errorEnvelope(
    "service_unavailable",
    "Database migrations have not completed",
    requestId,
    env.IS_DEV ? { message: status.error?.message } : undefined,
  );
});
```

**`apps/api/src/index.ts` (boot block to add, near the top after imports):**

```ts
try {
  const result = runMigrations(db());
  setDbReady();
  if (result.applied.length > 0) {
    logger.info("migrations applied", { applied: result.applied });
  }
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  setDbFailed(error);
  logger.error("migrations failed", { stack: error.stack, message: error.message });
}
```

### Anti-patterns to actively avoid

- ❌ Adding `better-sqlite3`, `sqlite3`, `node-sqlite`, `drizzle-orm`, `kysely`, `prisma`, or any other DB dep — `bun:sqlite` is the locked choice.
- ❌ Hand-rolling a UUIDv7 generator on the backend — Bun has `Bun.randomUUIDv7()` natively (used in tests for fixture IDs).
- ❌ A separate `000_init.up.sql` for `schema_versions` — the runner bootstraps that table; the convention is "first numbered migration is application schema".
- ❌ Down migrations (`*.down.sql` files) — D2 locks forward-only.
- ❌ Inline SQL in `index.ts` or `routes/*.ts` — every SQL statement lives inside `apps/api/src/storage/`.
- ❌ Reading `Bun.env.DATABASE_PATH` in `db.ts` directly — go through `env.DATABASE_PATH` from `apps/api/src/env.ts` (the env-validation boundary).
- ❌ A row-cache or query-cache layer in `taskRepo` — bun:sqlite caches prepared statements internally; an in-memory row cache would cause stale reads after writes.
- ❌ `process.exit(1)` on migration failure — keep the server running so `/health` can answer 503.
- ❌ Snake_case keys leaking into `Task` objects (`created_at`, `updated_at`) — the SELECT projection aliases columns, the row → Task mapper does the boolean conversion. Snake_case stays inside `storage/`.
- ❌ Storing `completed` as `boolean` in SQLite — D2 says `INTEGER NOT NULL CHECK(completed IN (0, 1))`. The boundary converts at the repo layer.
- ❌ Using `db.prepare(sql)` followed by `.all()` instead of `db.query(sql).all()` — bun:sqlite's `query()` is the modern API and caches prepared statements automatically.
- ❌ Letting tests share a singleton database — each test creates its own `:memory:` DB in `beforeEach` so tests are deterministic and parallel-safe.
- ❌ Running migrations inside `if (import.meta.main)` — they need to run on import too, so test files that import `index.ts` see a ready DB.
- ❌ Forgetting to reset readiness state in `afterEach` of the health-failed test — every other test that hits `/health` will fail.

### Previous story intelligence (Story 1.2)

What Story 1.2 left in the repo that this story builds on:

- **`apps/api/src/index.ts:38`** — `const baseApp = new Elysia().use(requestLogger()).use(healthRoute);`. The boot-time migration block goes BEFORE this line (top-level, after imports, before the Elysia chain).
- **`apps/api/src/index.ts:49-52`** — `if (import.meta.main) { app.listen(env.PORT); logger.info("listening", ...); }`. This is the side-effect gate; migrations are NOT inside it (they run on import).
- **`apps/api/src/middleware/requestLogger.ts`** — exports `getRequestId(request)` that reads from a module-scoped `WeakMap<Request, string>`. The new `health.ts` body uses this exact function to read the requestId for the 503 envelope.
- **`apps/api/src/errors/codes.ts`** — `ERROR_STATUS["service_unavailable"] === 503`. The 503 mapping is already locked; `health.ts` sets `set.status = 503` directly because Elysia's response composition needs the literal status, not a code lookup. (The `onError` flow uses the lookup; this is a normal handler returning a non-error envelope-shaped body, hence the direct status.)
- **`apps/api/src/errors/envelope.ts`** — `errorEnvelope(code, message, requestId, details?)` is the helper. The 503 path uses `errorEnvelope("service_unavailable", "Database migrations have not completed", requestId, env.IS_DEV ? { message: ... } : undefined)`.
- **`apps/api/src/onError.ts`** — exports `registerOnError(app, { isDev })`. The `health.ts` 503 path does NOT route through `onError` (it's a 200/503 response, not a thrown error), so `onError` is unchanged this story.
- **`apps/api/src/log.ts`** — `logger.info / warn / error` — used for `migrations applied` (info) and `migrations failed` (error).
- **`apps/api/src/env.ts`** — exposes `env.DATABASE_PATH` (default `"./tasks.db"`) and `env.IS_DEV`. The `db.ts` singleton consumes `DATABASE_PATH`; `health.ts` uses `IS_DEV` to gate the dev-only `details.message` echo.
- **Test idiom** — `describe(...)` + `it(...)`, no mocking of `bun:sqlite`, real `:memory:` DBs, JSON-line capture via monkey-patched `process.stdout.write`. Story 1.2's `requestLogger.test.ts` is a great template for how to capture log output if a test needs to assert that `migrations applied` was emitted.
- **Coverage budget reality** — Story 1.2's suite reports `~98.15% funcs / ~95.16% lines` per its Change Log. Adding ~3 new modules + ~3 new test files plus the `update`/`delete` stubs (which throw and won't have positive coverage) will dip the aggregate. Budget tests so each new public function has at least one behavioral test; the gate is `>= 70%` so headroom is comfortable, but the throwing-stub branches will show as uncovered — that's expected.

### Git intelligence — recent commits

Recent activity (`git log --oneline -10`): Story 1.2's review patches landed in `50a4497 Review story 1.2`; `2483602 Dev story 1.2` is the implementation; `5a3efae Create story 1.2` was the predecessor of THIS workflow. Repo is clean. The architecture-locked dep versions (Bun 1.3.11, Elysia 1.4.28, bun-types 1.3.11) are pinned exact in `apps/api/package.json` and `bun.lock` — do NOT bump them in this story. The migration-runner tests will exercise `bun:sqlite` directly, which is why bun-types 1.3.11 is required (it ships the `bun:sqlite` ambient types).

### Project Structure Notes

**Alignment:** every file this story creates is at the path the architecture's *Project Structure & Boundaries* section pre-declares:

- `apps/api/src/storage/db.ts` — ✓
- `apps/api/src/storage/tasks.ts` + `.test.ts` — ✓
- `apps/api/src/storage/migrations/runner.ts` + `.test.ts` — ✓
- `apps/api/src/storage/migrations/001_create_tasks.up.sql` — ✓

**Detected variances:**

- The architecture's directory tree at `project-structure-boundaries.md` line 82 lists `storage/db.ts` without a `+ .test.ts`. This story ADDS `db.test.ts` because the readiness state setters and the PRAGMA application path are public surface that should be tested. The architecture is a guide, not a constraint on test coverage — adding sibling tests is permitted (and required by NFR-M1). Document the deviation in the dev notes / completion log.
- The readiness state (`setDbReady` / `setDbFailed` / `getDbStatus`) is NOT mentioned in the architecture document. It's introduced in this story as the resolution to the FR31 + NFR-R5 requirement that `/health` returns 503 until the schema is ready. The chosen home is `storage/db.ts` (Option A in AC #10) because the readiness signal is intrinsically about the database. If the dev agent prefers a separate `apps/api/src/readiness.ts` module (Option B), that's acceptable — document the choice in the file's top-line comment.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-1-3] — story BDD acceptance criteria (lines 428–458)
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#data-architecture] — D1 (UUIDv7 client-side), D2 (SQLite schema, PRAGMAs, forward-only migrations)
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#api-communication-patterns] — D3 (REST shape; `ORDER BY id DESC`; camelCase JSON)
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#naming-conventions] — TS / file / DB naming
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#code-style-conventions] — repository pattern, no inline SQL in handlers
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#cross-cutting-conventions] — logging, constants, env vars
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#anti-patterns-forbidden] — `console.log` ban, `any` ban, default exports ban, magic-number ban
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#per-package-src-layout-backend] — file paths for `storage/`
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#requirements-to-structure-mapping] — FR11–FR13 (persistence) location mapping; FR29 idempotency in `INSERT OR IGNORE`
- [Source: _bmad-output/planning-artifacts/prd.md] — FR1 (≤500 char), FR11–FR13 (persistence), FR29 (idempotency), FR31 (health), NFR-R3 (atomic ops), NFR-R5 (health within 5s, 200 when ready), NFR-M1 (≥70% coverage), NFR-S5 (input limits — note the schema's CHECK on text length)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — `AppError.cause` not yet supported (relevant if wrapping SQLite errors)
- [Source: _bmad-output/implementation-artifacts/1-2-backend-plumbing-logger-error-envelope-request-middleware-health-endpoint.md] — Story 1.2 patterns (logger, envelope, requestId WeakMap, health route ownership)
- [bun:sqlite reference](https://bun.sh/docs/api/sqlite) — `Database`, `query`, `run`, `exec`, `transaction`
- [SQLite PRAGMA reference](https://www.sqlite.org/pragma.html) — `journal_mode`, `synchronous`, `foreign_keys`, `busy_timeout`
- [SQLite WAL docs](https://www.sqlite.org/wal.html) — why WAL on file-backed paths (concurrent readers, durability under crash)
- [Bun.randomUUIDv7 reference](https://bun.com/reference/bun/randomUUIDv7) — used in repo tests for monotonic-id fixtures

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Opus 4.7, 1M context)

### Debug Log References

- All seven tasks were authored using a red-green-refactor cycle. Test files were written alongside each module before the suite was run; no test was retroactively softened to fit a passing implementation.
- `apps/api/src/storage/db.ts` exports a lazy `db()` getter rather than an eager `db` Database constant. Reason: under `bun test`, importing any file that transitively touches `tasks.ts` triggers module evaluation; an eager singleton would open `env.DATABASE_PATH` (default `./tasks.db`) at the repo root during every test run, even for tests that supply their own `:memory:` connection. The lazy getter defers the file open until production code actually calls it (boot-time migration in `index.ts`).
- `apps/api/src/storage/tasks.ts` exports a lazy `taskRepo` proxy for the same reason — the default repo is created on first method call, so importing the module never touches `env.DATABASE_PATH`. Tests use `createTaskRepo(testDb)` directly with their own `:memory:` connections.
- The migration runner runs each migration inside its own `db.transaction(() => {...})()` so that, on a multi-migration run, earlier migrations stay committed even if a later one fails — matching the forward-only recovery model in D2.
- `health.ts` consults `getDbStatus()` from `storage/db.ts` rather than a separate readiness module (Option A from AC #10). The single mutable module-level state is documented at its declaration site.
- `index.ts` runs migrations at top-level (not inside `if (import.meta.main)`), so test files that import `index.ts` see a ready DB when calling `app.handle("/health")`. `app.listen()` remains gated.
- Verified Docker round-trip end-to-end: first boot logs `migrations applied: [1]`; after `docker compose down && up`, the `tasks.db` file in the `/data` volume survives, no `migrations applied` line is emitted (idempotent gate honors `applied.length > 0`), `/health` returns 200 immediately. WAL files (`tasks.db-shm`, `tasks.db-wal`) are present, confirming `journal_mode=WAL` activates on file-backed paths.

### Completion Notes List

- AC #1 — `openDb` applies all four PRAGMAs in order; `Database` is re-exported as a type; lazy `db()` singleton is the public surface.
- AC #2 — `runMigrations(db, options?)` bootstraps `schema_versions`, sorts `*.up.sql` lexically, parses the leading `NNN_` prefix, runs each migration in its own transaction, and returns the newly-applied versions.
- AC #3 — `001_create_tasks.up.sql` matches D2's schema verbatim (5 columns, CHECK on text length 1..500, CHECK completed in {0,1}). No down migrations.
- AC #4 — Six runner tests cover: fresh-DB application, no-op re-run, partial schema_versions row, transactional rollback on bad SQL, skip-misnamed-files, and `PRAGMA table_info(tasks)` matching D2.
- AC #5 — `Task` type plus `createTaskRepo` factory with `list/get/create/update/delete`. `update`/`delete` are throwing stubs annotated `// implemented in Story 2.1` / `// implemented in Story 3.1` per the AC; behavioral tests assert each stub throws with the right message.
- AC #6 — Repository is the only place that touches snake_case columns. `git grep` confirmed: `created_at`/`updated_at` only appear inside `apps/api/src/storage/`. SELECTs alias columns to camelCase; INSERTs bind snake_case parameters explicitly; the `completed` boolean is converted at the boundary via `Boolean(row.completed)` on read and `0/1` literal on write.
- AC #7 — `create()` uses `INSERT OR IGNORE` inside a `db.transaction(...)`, captures `result.changes`, and follows with a `SELECT` for the canonical row. Returns `{ task, created }` exactly as Story 1.4 will consume.
- AC #8 — Ten repository tests cover: empty list, fresh insert (`created: true` + timestamp window), idempotent same-id-same-text retry, idempotent same-id-different-text (original text wins), newest-first ordering with monotonic UUIDv7, `get()` happy + missing, camelCase boundary smoke test, and the throwing stubs.
- AC #9 — `index.ts` runs migrations at top-level, calls `setDbReady()` on success and `setDbFailed(err)` on failure. The success log is gated by `result.applied.length > 0` so re-runs stay quiet.
- AC #10 — Option A: `setDbReady`/`setDbFailed`/`getDbStatus` live in `storage/db.ts` with a one-line comment documenting the only mutable module-level state in `apps/api/src/`.
- AC #11 — `health.test.ts` extended with a `when migrations have failed` describe; `afterEach(setDbReady)` resets state so other tests are not affected. Asserts envelope shape, `Content-Type`, dev-mode `details.message` echo, and the not-write-once flip.
- AC #12 — `index.test.ts` adds a `boot integration` describe with one `/health → 200` test that proves the full import-time wiring.
- AC #13 — `bun run check:full` reports `funcs 95.04% / lines 94.87%` (well above 70%); `bun audit` clean; build + bundle-size pass. `bun run check:release` runs all three Playwright browsers (chromium/webkit/firefox) green and both Lighthouse passes (mobile + desktop) green.
- AC #14 — Named exports only; `import type` for type-only imports; `describe`/`it`; no `console.*` outside `log.ts`/tests/scripts; explicit return types on exported functions; SQL is confined to `storage/`.
- Architecture variances documented per Project Structure Notes: `db.test.ts` was added (not in the architecture's directory tree, but required by NFR-M1 and AC #1); the readiness module lives in `storage/db.ts` (Option A) since the readiness signal is intrinsically about the database.
- Boot-side-effect note for future readers: importing `apps/api/src/index.ts` opens `env.DATABASE_PATH` (default `./tasks.db` at the repo root). `*.db` is gitignored. Tests that don't need a real DB should import `db.ts`/`runner.ts` directly with `:memory:` connections rather than touching `index.ts`.

### File List

**Created:**

- `apps/api/src/storage/db.ts`
- `apps/api/src/storage/db.test.ts`
- `apps/api/src/storage/migrations/runner.ts`
- `apps/api/src/storage/migrations/runner.test.ts`
- `apps/api/src/storage/migrations/001_create_tasks.up.sql`
- `apps/api/src/storage/tasks.ts`
- `apps/api/src/storage/tasks.test.ts`

**Modified:**

- `apps/api/src/index.ts` — added boot-time migration block + readiness state setters at top level; preserved the `if (import.meta.main)` gate on `app.listen()`.
- `apps/api/src/index.test.ts` — added `boot integration` describe with one `/health → 200` test.
- `apps/api/src/routes/health.ts` — replaced static body with readiness-aware handler that returns 503 + error envelope when migrations have not completed.
- `apps/api/src/routes/health.test.ts` — added the `when migrations have failed` describe with envelope-shape, dev-mode-details, and re-readiness-flip cases.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped story 1.3 status `ready-for-dev` → `in-progress` → `review`.

**Deleted:**

- `apps/api/src/storage/migrations/.gitkeep`

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-04-30 | Amelia (claude-opus-4-7[1m]) | Implemented Story 1.3 — SQLite database singleton with PRAGMAs, forward-only migration runner with transactional per-migration semantics, first migration creating the `tasks` table per D2, repository skeleton with `INSERT OR IGNORE` idempotency on `create`, readiness state surface, boot wiring, and health-route 503 path. All 14 ACs satisfied; coverage 95.04% funcs / 94.87% lines; `check:release` and Docker round-trip both verified end-to-end. |

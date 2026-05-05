import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type Database, openDb } from "../db";
import { SCHEMA_VERSIONS_TABLE, runMigrations } from "./runner";

const REAL_MIGRATIONS_DIR = import.meta.dir;

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type SchemaVersionsRow = { version: number; applied_at: number };

describe("runMigrations", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("applies migration 001 on a fresh DB and returns { applied: [1] }", () => {
    const result = runMigrations(db);
    expect(result.applied).toEqual([1]);

    const tasksTable = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'",
      )
      .get();
    expect(tasksTable?.name).toBe("tasks");

    const versions = db
      .query<SchemaVersionsRow, []>(`SELECT version, applied_at FROM ${SCHEMA_VERSIONS_TABLE}`)
      .all();
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
    expect(versions[0]?.applied_at).toBeGreaterThan(0);
  });

  it("is a no-op on second run and preserves existing rows", () => {
    runMigrations(db);
    db.run(
      "INSERT INTO tasks (id, text, completed, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
      ["abc", "hello", Date.now(), Date.now()],
    );
    const result = runMigrations(db);
    expect(result.applied).toEqual([]);
    const versionRows = db
      .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${SCHEMA_VERSIONS_TABLE}`)
      .get();
    expect(versionRows?.count).toBe(1);
    const taskRows = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM tasks").get();
    expect(taskRows?.count).toBe(1);
  });

  it("honors a partially-applied schema_versions row for an unrelated version", () => {
    db.exec(
      `CREATE TABLE ${SCHEMA_VERSIONS_TABLE} (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`,
    );
    db.run(`INSERT INTO ${SCHEMA_VERSIONS_TABLE} (version, applied_at) VALUES (?, ?)`, [
      999,
      Date.now(),
    ]);
    const result = runMigrations(db);
    expect(result.applied).toEqual([1]);
    const versions = db
      .query<{ version: number }, []>(
        `SELECT version FROM ${SCHEMA_VERSIONS_TABLE} ORDER BY version`,
      )
      .all()
      .map((r) => r.version);
    expect(versions).toEqual([1, 999]);
  });

  it("rolls back the transaction when a migration's SQL throws", () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), "migrations-"));
      writeFileSync(join(tmpDir, "002_bad.up.sql"), "CREATE TABLE wat (id INT); INVALID SQL HERE;");

      runMigrations(db, { dir: REAL_MIGRATIONS_DIR });

      expect(() => runMigrations(db, { dir: tmpDir as string })).toThrow();

      const versionRow = db
        .query<{ version: number }, [number]>(
          `SELECT version FROM ${SCHEMA_VERSIONS_TABLE} WHERE version = ?`,
        )
        .get(2);
      expect(versionRow).toBeNull();

      const watTable = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='wat'",
        )
        .get();
      expect(watTable).toBeNull();
    } finally {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips files that do not match the NNN_ prefix convention", () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), "migrations-skip-"));
      writeFileSync(
        join(tmpDir, "010_extra.up.sql"),
        "CREATE TABLE extra (id INTEGER PRIMARY KEY)",
      );
      writeFileSync(join(tmpDir, "notes.up.sql"), "CREATE TABLE notes (id INTEGER PRIMARY KEY)");
      const result = runMigrations(db, { dir: tmpDir });
      expect(result.applied).toEqual([10]);
      const extraTable = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='extra'",
        )
        .get();
      expect(extraTable?.name).toBe("extra");
      const notesTable = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'",
        )
        .get();
      expect(notesTable).toBeNull();
    } finally {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("PRAGMA table_info(tasks) matches the documented schema", () => {
    runMigrations(db);
    const rows = db.query<TableInfoRow, []>("PRAGMA table_info(tasks)").all();
    const byName = new Map(rows.map((r) => [r.name, r]));

    const id = byName.get("id");
    expect(id).toBeDefined();
    expect(id?.type).toBe("TEXT");
    expect(id?.notnull).toBe(1);
    expect(id?.pk).toBe(1);

    const text = byName.get("text");
    expect(text?.type).toBe("TEXT");
    expect(text?.notnull).toBe(1);

    const completed = byName.get("completed");
    expect(completed?.type).toBe("INTEGER");
    expect(completed?.notnull).toBe(1);
    expect(completed?.dflt_value).toBe("0");

    const createdAt = byName.get("created_at");
    expect(createdAt?.type).toBe("INTEGER");
    expect(createdAt?.notnull).toBe(1);

    const updatedAt = byName.get("updated_at");
    expect(updatedAt?.type).toBe("INTEGER");
    expect(updatedAt?.notnull).toBe(1);

    expect(() =>
      db.run(
        "INSERT INTO tasks (id, text, completed, created_at, updated_at) VALUES (?, ?, 2, ?, ?)",
        ["x", "violation", Date.now(), Date.now()],
      ),
    ).toThrow();
  });

  it("PRAGMA table_info(schema_versions) matches the documented schema", () => {
    runMigrations(db);
    const rows = db.query<TableInfoRow, []>(`PRAGMA table_info(${SCHEMA_VERSIONS_TABLE})`).all();
    const byName = new Map(rows.map((r) => [r.name, r]));

    const version = byName.get("version");
    expect(version).toBeDefined();
    expect(version?.type).toBe("INTEGER");
    expect(version?.pk).toBe(1);

    const appliedAt = byName.get("applied_at");
    expect(appliedAt).toBeDefined();
    expect(appliedAt?.type).toBe("INTEGER");
    expect(appliedAt?.notnull).toBe(1);
  });

  it("throws when two migration files share the same parsed version", () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), "migrations-dup-"));
      writeFileSync(join(tmpDir, "001_a.up.sql"), "CREATE TABLE a (id INTEGER PRIMARY KEY)");
      writeFileSync(join(tmpDir, "0001_b.up.sql"), "CREATE TABLE b (id INTEGER PRIMARY KEY)");
      expect(() => runMigrations(db, { dir: tmpDir as string })).toThrow(
        /duplicate migration version 1/,
      );
      const aTable = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='a'",
        )
        .get();
      expect(aTable).toBeNull();
    } finally {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when a migration file is empty", () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), "migrations-empty-"));
      writeFileSync(join(tmpDir, "001_empty.up.sql"), "   \n  \n");
      expect(() => runMigrations(db, { dir: tmpDir as string })).toThrow(
        /001_empty\.up\.sql is empty/,
      );
      const versionRow = db
        .query<{ version: number }, [number]>(
          `SELECT version FROM ${SCHEMA_VERSIONS_TABLE} WHERE version = ?`,
        )
        .get(1);
      expect(versionRow).toBeNull();
    } finally {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when no migration files are found and no versions are recorded", () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), "migrations-empty-dir-"));
      expect(() => runMigrations(db, { dir: tmpDir as string })).toThrow(
        /no migration files found/,
      );
    } finally {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

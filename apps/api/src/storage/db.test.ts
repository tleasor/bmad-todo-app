import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type Database, getDbStatus, openDb, setDbFailed, setDbReady } from "./db";

describe("openDb", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("returns a working Database connection", () => {
    const row = db.query<{ x: number }, []>("SELECT 1 AS x").get();
    expect(row).toEqual({ x: 1 });
  });

  it("applies PRAGMA foreign_keys = ON", () => {
    const row = db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
    expect(row).toEqual({ foreign_keys: 1 });
  });

  it("applies PRAGMA busy_timeout = 5000", () => {
    const row = db.query<{ timeout: number }, []>("PRAGMA busy_timeout").get();
    expect(row).toEqual({ timeout: 5000 });
  });

  it("applies PRAGMA synchronous = NORMAL (mode 1)", () => {
    const row = db.query<{ synchronous: number }, []>("PRAGMA synchronous").get();
    expect(row).toEqual({ synchronous: 1 });
  });

  it("does not throw when applying journal_mode on :memory: (returns memory mode)", () => {
    const row = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
    expect(row?.journal_mode).toBeDefined();
  });
});

describe("readiness state", () => {
  afterEach(() => {
    setDbReady();
  });

  it("setDbReady transitions state to ready with no error", () => {
    setDbFailed(new Error("boom"));
    setDbReady();
    expect(getDbStatus()).toEqual({ ready: true, error: undefined });
  });

  it("setDbFailed transitions state to not-ready with the error attached", () => {
    setDbReady();
    const err = new Error("migration crashed");
    setDbFailed(err);
    const status = getDbStatus();
    expect(status.ready).toBe(false);
    expect(status.error).toBe(err);
  });

  it("supports flipping between ready and failed states (not write-once)", () => {
    setDbReady();
    expect(getDbStatus().ready).toBe(true);
    setDbFailed(new Error("regression"));
    expect(getDbStatus().ready).toBe(false);
    setDbReady();
    expect(getDbStatus().ready).toBe(true);
    expect(getDbStatus().error).toBeUndefined();
  });
});

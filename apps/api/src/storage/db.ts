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

// Module-level mutable state — the only such state in apps/api/src/.
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

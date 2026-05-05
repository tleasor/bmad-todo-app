import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../db";
import { logger } from "../../log";

export const SCHEMA_VERSIONS_TABLE = "schema_versions";

const SCHEMA_VERSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA_VERSIONS_TABLE} (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )
`;

const VERSION_PREFIX = /^(\d+)_/;

const parseVersion = (filename: string): number | undefined => {
  const match = VERSION_PREFIX.exec(filename);
  if (!match || !match[1]) return undefined;
  return Number.parseInt(match[1], 10);
};

export const runMigrations = (db: Database, options?: { dir?: string }): { applied: number[] } => {
  const dir = options?.dir ?? import.meta.dir;
  db.exec(SCHEMA_VERSIONS_DDL);
  const applied = new Set<number>(
    db
      .query<{ version: number }, []>(`SELECT version FROM ${SCHEMA_VERSIONS_TABLE}`)
      .all()
      .map((r) => r.version),
  );
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();

  const seen = new Map<number, string>();
  for (const file of files) {
    const version = parseVersion(file);
    if (version === undefined) continue;
    const prior = seen.get(version);
    if (prior !== undefined) {
      throw new Error(`duplicate migration version ${version}: ${prior}, ${file}`);
    }
    seen.set(version, file);
  }

  if (seen.size === 0 && applied.size === 0) {
    throw new Error(`no migration files found in ${dir} and no prior versions recorded`);
  }

  const newlyApplied: number[] = [];
  for (const file of files) {
    const version = parseVersion(file);
    if (version === undefined) {
      logger.warn("migration file skipped", { file });
      continue;
    }
    if (applied.has(version)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    if (sql.trim().length === 0) {
      throw new Error(`migration ${file} is empty`);
    }
    const apply = db.transaction(() => {
      db.exec(sql);
      db.run(`INSERT INTO ${SCHEMA_VERSIONS_TABLE} (version, applied_at) VALUES (?, ?)`, [
        version,
        Date.now(),
      ]);
    });
    apply();
    newlyApplied.push(version);
    logger.info("migration applied", { version, file });
  }
  return { applied: newlyApplied };
};

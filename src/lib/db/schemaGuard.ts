import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";

/** One lock for every ensure* path so two requests cannot ALTER the same table. */
export const SCHEMA_LOCK_NAME = "nmt_schema";
const LOCK_WAIT_SEC = 15;

/**
 * Versions recorded by `npm run migrate`. When every one is present,
 * ensure* skips DDL and only asserts that the migration runner already ran.
 */
export async function schemaMigrationsApplied(
  connection: SqlConnection,
  versions: readonly string[],
): Promise<boolean> {
  if (versions.length === 0) return false;
  let rows: Array<{ version?: string }>;
  try {
    const placeholders = versions.map(() => "?").join(", ");
    rows = await connection.query<{ version?: string }>(
      `SELECT version FROM schema_migrations WHERE version IN (${placeholders})`,
      [...versions],
    );
  } catch (error) {
    if (mysqlErrno(error) === 1146) return false;
    throw error;
  }
  const have = new Set(
    rows.map((row) => row.version).filter((version): version is string => Boolean(version)),
  );
  return versions.every((version) => have.has(version));
}

type LockResult = "acquired" | "busy" | "unknown";

function lockFlag(rows: Array<Record<string, unknown>>): LockResult {
  const row = rows[0];
  if (!row) return "unknown";
  const value = row.got ?? row.GOT ?? Object.values(row)[0];
  if (value === 1 || value === "1" || value === true || value === BigInt(1)) return "acquired";
  if (value === 0 || value === "0" || value === false || value === BigInt(0)) return "busy";
  return "unknown";
}

function lockReleased(rows: Array<Record<string, unknown>>): boolean {
  const row = rows[0];
  if (!row) return false;
  const value = row.released ?? row.RELEASED ?? Object.values(row)[0];
  return value === 1 || value === "1" || value === true || value === BigInt(1);
}

/**
 * Runs DDL at most once per process for `key`, and only while holding
 * `GET_LOCK('nmt_schema')` when the driver actually returns the lock.
 * A test double that does not implement GET_LOCK is treated as already safe.
 */
const inflight = new Map<string, Promise<void>>();
let lockDepth = 0;

export function resetSchemaGuardForTests(key?: string): void {
  if (key) inflight.delete(key);
  else inflight.clear();
  lockDepth = 0;
}

export async function ensureSchemaOnce(
  key: string,
  versions: readonly string[],
  getConnection: () => Promise<SqlConnection>,
  migrate: (connection: SqlConnection) => Promise<void>,
): Promise<void> {
  const pending = inflight.get(key);
  if (pending) {
    await pending;
    return;
  }
  const job = runOnce(versions, getConnection, migrate).catch((error: unknown) => {
    inflight.delete(key);
    throw error;
  });
  inflight.set(key, job);
  await job;
}

async function runOnce(
  versions: readonly string[],
  getConnection: () => Promise<SqlConnection>,
  migrate: (connection: SqlConnection) => Promise<void>,
): Promise<void> {
  const connection = await getConnection();
  let acquired: LockResult = "unknown";
  const nested = lockDepth > 0;
  let heldHere = false;
  try {
    if (await schemaMigrationsApplied(connection, versions)) return;
    if (!nested) {
      const rows = await connection.query<Record<string, unknown>>(
        `SELECT GET_LOCK(?, ?) AS got`,
        [SCHEMA_LOCK_NAME, LOCK_WAIT_SEC],
      );
      acquired = lockFlag(rows);
      if (acquired === "busy") {
        throw new Error("Schema migration lock is busy.");
      }
      lockDepth += 1;
      heldHere = true;
    }
    try {
      if (await schemaMigrationsApplied(connection, versions)) return;
      await migrate(connection);
    } finally {
      if (heldHere) lockDepth -= 1;
    }
  } finally {
    let leaked = false;
    if (heldHere && acquired === "acquired") {
      try {
        const rows = await connection.query<Record<string, unknown>>(
          `SELECT RELEASE_LOCK(?) AS released`,
          [SCHEMA_LOCK_NAME],
        );
        leaked = !lockReleased(rows);
      } catch (error) {
        leaked = true;
        console.error("schema lock release failed", error);
      }
    }
    if (leaked && connection.discard) connection.discard();
    else connection.release();
  }
}

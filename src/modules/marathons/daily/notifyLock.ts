import type { SqlConnection } from "@/lib/db/mysql";

/** Separate from `nmt_schema` so a tick never waits on DDL. */
export const MARATHON_NOTIFY_LOCK = "nmt_marathon_notify";

const PING_MS = 15_000;

type LockHandle = {
  tryLock: () => Promise<boolean>;
  unlock: () => Promise<void>;
};

export type NotifyRun<T> =
  | { skipped: true }
  | { skipped: false; value: T };

/**
 * One in-memory gate plus a DB lock the caller holds across the tick.
 * A second call in this process returns immediately. A second Node
 * process fails `tryLock` and also returns without running the work.
 */
export function createNotifyGate(lock: LockHandle) {
  let running = false;
  return {
    async run<T>(work: () => Promise<T>): Promise<NotifyRun<T>> {
      if (running) return { skipped: true };
      running = true;
      let held = false;
      try {
        held = await lock.tryLock();
        if (!held) return { skipped: true };
        const value = await work();
        return { skipped: false, value };
      } finally {
        if (held) {
          try {
            await lock.unlock();
          } catch (error) {
            console.error("marathon scheduler unlock", error);
          }
        }
        running = false;
      }
    },
  };
}

type LockState = {
  connection: SqlConnection | null;
  ping: ReturnType<typeof setInterval> | null;
};

/**
 * `GET_LOCK` is tied to this connection. A shared host drops idle sockets,
 * so the connection is pinged until the tick finishes. The lock dies with
 * the process, which lets the other copy take the next tick.
 */
export function createMysqlNotifyLock(
  getConnection: () => Promise<SqlConnection>,
): LockHandle {
  const state: LockState = { connection: null, ping: null };
  return {
    async tryLock() {
      const connection = await getConnection();
      try {
        const rows = await connection.query<{ got?: number | string | null }>(
          `SELECT GET_LOCK(?, 0) AS got`,
          [MARATHON_NOTIFY_LOCK],
        );
        const got = rows[0]?.got;
        if (got !== 1 && got !== "1") {
          connection.release();
          return false;
        }
        state.connection = connection;
        state.ping = setInterval(() => {
          void connection.query("SELECT 1", []).catch((error: unknown) => {
            console.error("marathon scheduler lock ping", error);
          });
        }, PING_MS);
        state.ping.unref?.();
        return true;
      } catch (error) {
        connection.release();
        throw error;
      }
    },
    async unlock() {
      if (state.ping) clearInterval(state.ping);
      state.ping = null;
      const connection = state.connection;
      state.connection = null;
      if (!connection) return;
      try {
        await connection.query(`SELECT RELEASE_LOCK(?) AS released`, [MARATHON_NOTIFY_LOCK]);
      } finally {
        connection.release();
      }
    },
  };
}

let gate: ReturnType<typeof createNotifyGate> | null = null;

export function marathonNotifyGate(): ReturnType<typeof createNotifyGate> {
  if (!gate) {
    gate = createNotifyGate(createMysqlNotifyLock(async () => {
      const { getConnection } = await import("@/lib/db/mysql");
      return getConnection();
    }));
  }
  return gate;
}

export function resetNotifyGateForTests(): void {
  gate = null;
}

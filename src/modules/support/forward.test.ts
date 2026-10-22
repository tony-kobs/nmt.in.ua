import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { reportSupportForward } from "./store";

test("a migrated team chat is logged and stored without the ticket text", async () => {
  const logs: unknown[] = [];
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const log = (...args: unknown[]) => {
    logs.push(args);
  };
  const connection = {
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { affectedRows: 1, insertId: 1 };
    },
  } as Pick<SqlConnection, "execute">;

  await reportSupportForward({
    status: "rejected",
    context: { errorCode: 400, migrateToChatId: "-1009876543210" },
  }, connection, log);

  assert.deepEqual(logs, [["support forward migrate_to_chat_id", "-1009876543210"]]);
  assert.match(calls[0]?.sql ?? "", /support_forward_state/);
  assert.deepEqual(calls[0]?.params, ["-1009876543210"]);
  assert.equal(JSON.stringify(logs).includes("умова"), false);

  logs.length = 0;
  calls.length = 0;
  await reportSupportForward({ status: "rejected", context: { errorCode: 400 } }, connection, log);
  assert.deepEqual(logs, [["support forward", "rejected"]]);
  assert.equal(calls.length, 0);

  await reportSupportForward({ status: "sent", messageId: 3 }, connection, log);
  assert.equal(logs.length, 1);
});

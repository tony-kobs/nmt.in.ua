import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { createUser, CreateUserError, findUserById } from "./users";

test("createUser inserts a student and returns AuthUser", async () => {
  let released = false;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>() => {
      // ensureAuthSchema: CREATE TABLE, then COUNT(*) — demo seed skipped when count > 0
      return [{ count: 3 }] as T[];
    },
    execute: async (sql, params = []) => {
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("ON DUPLICATE KEY UPDATE")) {
        return { insertId: 0, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO app_users")) {
        assert.equal(params[0], "maria_k");
        assert.equal(typeof params[1], "string");
        assert.match(String(params[1]), /^scrypt:/);
        assert.equal(params[2], "Марія Коваленко");
        assert.equal(params[3], "student");
        return { insertId: 42, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      released = true;
    },
  };

  // Reset schemaReady by importing fresh module is hard; call createUser with deps
  // that skip shared schemaReady by providing getConnection that works for ensureAuthSchema
  const user = await createUser(
    {
      login: "maria_k",
      displayName: "Марія Коваленко",
      password: "securepass",
      role: "student",
    },
    { getConnection: async () => connection },
  );

  assert.deepEqual(user, {
    id: 42,
    login: "maria_k",
    displayName: "Марія Коваленко",
    role: "student",
  });
  assert.equal(released, true);
});

test("createUser maps MySQL duplicate key to login_taken", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>() => [{ count: 3 }] as T[],
    execute: async (sql) => {
      if (sql.includes("CREATE TABLE") || sql.includes("ON DUPLICATE KEY")) {
        return { insertId: 0, affectedRows: 0 };
      }
      const err = Object.assign(new Error("Duplicate entry"), { errno: 1062 });
      throw err;
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  await assert.rejects(
    () =>
      createUser(
        {
          login: "taken",
          displayName: "Taken User",
          password: "securepass",
        },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof CreateUserError && error.code === "login_taken",
  );
});

test("findUserById maps avatar_rev onto AuthUser", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      if (sql.includes("COUNT(*)")) {
        return [{ count: 3 }] as T[];
      }
      return [
        {
          id: 42,
          login: "maria_k",
          display_name: "Марія Коваленко",
          role: "student",
          avatar_rev: "1700000111",
        },
      ] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const user = await findUserById(42, {
    getConnection: async () => connection,
  });

  assert.deepEqual(user, {
    id: 42,
    login: "maria_k",
    displayName: "Марія Коваленко",
    role: "student",
    avatarRev: 1_700_000_111,
  });
});

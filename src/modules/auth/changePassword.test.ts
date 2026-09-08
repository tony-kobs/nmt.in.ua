import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { changePassword, ChangePasswordError } from "./changePassword";
import { hashPassword } from "./password";

const student = {
  id: 42,
  login: "maria_k",
  displayName: "Марія Коваленко",
  role: "student" as const,
};

function makeConnection(options: {
  passwordHash?: string;
  onUpdate?: (sql: string, params: unknown[]) => void;
}) {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      if (sql.includes("COUNT(*)")) {
        return [{ count: 3 }] as T[];
      }
      if (sql.includes("FROM app_users") && sql.includes("login")) {
        return [
          {
            id: student.id,
            login: student.login,
            password_hash: options.passwordHash,
            display_name: student.displayName,
            role: student.role,
          },
        ] as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("UPDATE") && sql.includes("password_hash")) {
        options.onUpdate?.(sql, params);
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  return connection;
}

test("changePassword rejects demo accounts without touching the database", async () => {
  let queried = false;
  const connection = makeConnection({
    onUpdate: () => {
      throw new Error("should not update");
    },
  });
  const originalQuery = connection.query;
  connection.query = async (sql, params) => {
    queried = true;
    return originalQuery(sql, params);
  };

  await assert.rejects(
    () =>
      changePassword(
        {
          user: {
            id: 1,
            login: "demo-student",
            displayName: "Олена Коваленко",
            role: "student",
          },
          currentPassword: "demo12345",
          newPassword: "newpass12",
          newPasswordConfirm: "newpass12",
        },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof ChangePasswordError && error.code === "demoAccount",
  );
  assert.equal(queried, false);
});

test("changePassword rejects the wrong current password", async () => {
  const connection = makeConnection({
    passwordHash: hashPassword("oldpass12"),
    onUpdate: () => {
      throw new Error("should not update");
    },
  });

  await assert.rejects(
    () =>
      changePassword(
        {
          user: student,
          currentPassword: "wrongpass",
          newPassword: "newpass12",
          newPasswordConfirm: "newpass12",
        },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof ChangePasswordError && error.code === "wrongCurrent",
  );
});

test("changePassword updates the hash when the current password matches", async () => {
  const updates: unknown[][] = [];
  const connection = makeConnection({
    passwordHash: hashPassword("oldpass12"),
    onUpdate: (_sql, params) => {
      updates.push(params);
    },
  });

  await changePassword(
    {
      user: student,
      currentPassword: "oldpass12",
      newPassword: "newpass12",
      newPasswordConfirm: "newpass12",
    },
    { getConnection: async () => connection },
  );

  assert.equal(updates.length, 1);
  assert.match(String(updates[0]?.[0]), /^scrypt:/);
  assert.equal(updates[0]?.[1], 42);
});

import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { AVATAR_MAX_BYTES } from "../avatarConstants";
import { removeAvatar, uploadAvatar, UploadAvatarError } from "./upload";

const student = {
  id: 42,
  login: "maria_k",
  displayName: "Марія Коваленко",
  role: "student" as const,
};

function jpegFile(size = 32): File {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return new File([bytes], "avatar.jpg", { type: "image/jpeg" });
}

function makeConnection(options: {
  onUpsert?: (sql: string, params: unknown[]) => void;
  onDelete?: (sql: string, params: unknown[]) => void;
  rev?: number;
}) {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      if (sql.includes("avatar_rev")) {
        return [{ avatar_rev: options.rev ?? 1_700_000_111 }] as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("INSERT INTO user_avatars")) {
        options.onUpsert?.(sql, params);
        return { insertId: 0, affectedRows: 1 };
      }
      if (sql.includes("DELETE FROM user_avatars")) {
        options.onDelete?.(sql, params);
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

test("uploadAvatar rejects demo accounts without touching the database", async () => {
  let touched = false;
  const connection = makeConnection({
    onUpsert: () => {
      touched = true;
    },
  });

  await assert.rejects(
    () =>
      uploadAvatar(
        {
          user: {
            id: 1,
            login: "demo-student",
            displayName: "Олена Коваленко",
            role: "student",
          },
          file: jpegFile(),
        },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof UploadAvatarError && error.code === "demoAccount",
  );
  assert.equal(touched, false);
});

test("uploadAvatar rejects a missing file", async () => {
  const connection = makeConnection({});
  await assert.rejects(
    () =>
      uploadAvatar(
        { user: student, file: null },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof UploadAvatarError && error.code === "requiredFile",
  );
});

test("uploadAvatar rejects a non-image payload", async () => {
  const connection = makeConnection({
    onUpsert: () => {
      throw new Error("should not upsert");
    },
  });
  const file = new File(["not-an-image!!!!"], "avatar.svg", {
    type: "image/svg+xml",
  });
  await assert.rejects(
    () =>
      uploadAvatar(
        { user: student, file },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof UploadAvatarError && error.code === "invalidType",
  );
});

test("uploadAvatar rejects an oversized file", async () => {
  const connection = makeConnection({
    onUpsert: () => {
      throw new Error("should not upsert");
    },
  });
  await assert.rejects(
    () =>
      uploadAvatar(
        { user: student, file: jpegFile(AVATAR_MAX_BYTES + 1) },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof UploadAvatarError && error.code === "tooLarge",
  );
});

test("uploadAvatar stores a jpeg and returns the revision", async () => {
  const upserts: unknown[][] = [];
  const connection = makeConnection({
    rev: 1_700_000_222,
    onUpsert: (_sql, params) => {
      upserts.push(params);
    },
  });

  const file = jpegFile(24);
  const rev = await uploadAvatar(
    { user: student, file },
    { getConnection: async () => connection },
  );

  assert.equal(rev, 1_700_000_222);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0]?.[0], 42);
  assert.equal(upserts[0]?.[1], "image/jpeg");
  assert.ok(Buffer.isBuffer(upserts[0]?.[2]));
  assert.equal((upserts[0]?.[2] as Buffer).length, 24);
});

test("removeAvatar deletes the row for a real account", async () => {
  const deletes: unknown[][] = [];
  const connection = makeConnection({
    onDelete: (_sql, params) => {
      deletes.push(params);
    },
  });

  await removeAvatar(student, { getConnection: async () => connection });
  assert.deepEqual(deletes, [[42]]);
});

test("removeAvatar rejects demo accounts", async () => {
  let deleted = false;
  const connection = makeConnection({
    onDelete: () => {
      deleted = true;
    },
  });

  await assert.rejects(
    () =>
      removeAvatar(
        {
          id: 1,
          login: "demo-student",
          displayName: "Олена Коваленко",
          role: "student",
        },
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof UploadAvatarError && error.code === "demoAccount",
  );
  assert.equal(deleted, false);
});

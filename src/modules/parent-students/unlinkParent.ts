import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import type { AuthUser } from "@/modules/auth/types";

export type LinkedParent = { id: number; displayName: string };

export type UnlinkParentResult =
  | { status: "ok" }
  | { status: "error"; code: "unauthorized" | "forbidden" | "notFound" | "serverError" };

type Deps = {
  getUser: () => Promise<AuthUser | null>;
  getConnection: () => Promise<SqlConnection>;
};

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function isStudent(user: AuthUser): boolean {
  return !user.isBanned && user.role === "student" && (user.realRole ?? user.role) === "student";
}

function parentId(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/** Parents linked to the signed-in student. The student id is never taken from the client. */
export async function listLinkedParents(
  deps: Deps = { getUser: optionalLiveUser, getConnection: loadConnection },
): Promise<LinkedParent[]> {
  const user = await deps.getUser();
  if (!user || !isStudent(user)) return [];
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{ id: number; display_name: string | null }>(
      `SELECT parent.id, parent.display_name
       FROM parent_students ps
       INNER JOIN app_users student ON student.id = ps.student_user_id
         AND student.role = 'student' AND student.is_banned = 0
       INNER JOIN app_users parent ON parent.id = ps.parent_user_id
         AND parent.role = 'parent'
       WHERE ps.student_user_id = ?
       ORDER BY parent.display_name ASC, parent.id ASC`,
      [user.id],
    );
    return rows.map((row) => ({ id: row.id, displayName: row.display_name?.trim() || "—" }));
  } finally {
    connection.release();
  }
}

/** Removes one parent link. Access checks on the next parent read see the delete immediately. */
export async function unlinkParent(
  rawParentId: unknown,
  deps: Deps = { getUser: optionalLiveUser, getConnection: loadConnection },
): Promise<UnlinkParentResult> {
  const user = await deps.getUser();
  if (!user) return { status: "error", code: "unauthorized" };
  if (!isStudent(user)) return { status: "error", code: "forbidden" };
  const id = parentId(rawParentId);
  if (!id || id === user.id) return { status: "error", code: "notFound" };

  let connection: SqlConnection | undefined;
  try {
    connection = await deps.getConnection();
    const removed = await connection.execute(
      `DELETE ps FROM parent_students ps
       INNER JOIN app_users student ON student.id = ps.student_user_id
         AND student.id = ? AND student.role = 'student' AND student.is_banned = 0
       WHERE ps.parent_user_id = ?`,
      [user.id, id],
    );
    if (removed.affectedRows !== 1) return { status: "error", code: "notFound" };
    return { status: "ok" };
  } catch {
    return { status: "error", code: "serverError" };
  } finally {
    connection?.release();
  }
}

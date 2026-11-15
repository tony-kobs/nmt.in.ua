import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import type { AuthUser } from "@/modules/auth/types";
import { ParentAccessError, type ParentChild } from "./types";

export type ParentReadDeps = {
  getUser: () => Promise<AuthUser | null>;
  getConnection: () => Promise<SqlConnection>;
};

export const defaultParentReadDeps: ParentReadDeps = {
  getUser: optionalLiveUser,
  getConnection: async () => {
    const { getConnection } = await import("@/lib/db/mysql");
    return getConnection();
  },
};

export async function requireParentReadUser(deps: ParentReadDeps): Promise<AuthUser> {
  const user = await deps.getUser();
  if (!user) throw new ParentAccessError("unauthorized");
  if (user.isBanned || user.role !== "parent" || (user.realRole ?? user.role) !== "parent") {
    throw new ParentAccessError("forbidden");
  }
  return user;
}

export function parentChildId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ParentAccessError("not_found");
  }
  return value;
}

/** Internal shared read: never accepts a parent id or grants a reusable authorization token. */
export async function readParentChildren(
  options: { childId?: unknown },
  deps: ParentReadDeps,
): Promise<ParentChild[]> {
  const user = await requireParentReadUser(deps);
  const targeted = Object.hasOwn(options, "childId");
  if (targeted) parentChildId(options.childId);

  const connection = await deps.getConnection();
  try {
    // Preserve the parent row even when there are no accessible children. This
    // distinguishes a valid empty roster from a parent whose role/ban changed.
    const rows = await connection.query<{ id: number | null; display_name: string | null }>(
      `SELECT child.id, child.display_name
       FROM app_users parent
       LEFT JOIN parent_students ps ON ps.parent_user_id = parent.id
         ${targeted ? "AND ps.student_user_id = ?" : ""}
       LEFT JOIN app_users child ON child.id = ps.student_user_id
         AND child.role = 'student' AND child.is_banned = 0
       WHERE parent.id = ? AND parent.role = 'parent' AND parent.is_banned = 0
       ORDER BY child.display_name ASC, child.id ASC`,
      targeted ? [options.childId, user.id] : [user.id],
    );
    if (rows.length === 0) throw new ParentAccessError("forbidden");
    return rows.flatMap((row) => row.id === null ? [] : [{ id: row.id, displayName: row.display_name ?? "" }]);
  } finally {
    // Deliberately no catch: connection/query failures are not an empty roster.
    connection.release();
  }
}

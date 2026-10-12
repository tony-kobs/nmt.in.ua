import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { loadTelegramConnection } from "./schema";

export type TelegramAccountRole = "student" | "teacher";
export type TelegramAccountProfile = {
  accountId: number;
  userId: number;
  /** Verified from `app_users.role`; admins can run mentor assignments, so they get the teacher menu. */
  role: TelegramAccountRole;
  displayName: string;
  linkedAt: number | null;
};
export type TelegramAccountResult = { status: "success"; profile: TelegramAccountProfile }
  | { status: "error"; code: "notLinked" | "databaseFailure" };

type Deps = { getConnection: () => Promise<SqlConnection>; logError?: (error: unknown) => void };

const SQL_PROFILE = `
  SELECT uta.id AS account_id, uta.user_id, UNIX_TIMESTAMP(uta.linked_at) AS linked_unix, u.role, u.display_name
  FROM user_telegram_accounts uta
  INNER JOIN app_users u ON u.id = uta.user_id AND u.is_banned = 0
  WHERE uta.telegram_user_id = ?
  LIMIT 1
`;

export function isTelegramIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
}

/** Resolves the linked, non-banned app account for a Telegram user id. Never trusts an app user id from Telegram. */
export async function getTelegramAccountProfile(
  telegramUserId: unknown,
  deps: Deps = { getConnection: loadTelegramConnection },
): Promise<TelegramAccountResult> {
  if (!isTelegramIdentity(telegramUserId)) return { status: "error", code: "notLinked" };
  try {
    const connection = await deps.getConnection();
    try {
      const rows = await connection.query<{
        account_id: number; user_id: number; linked_unix: number | string | null; role: string; display_name: string | null;
      }>(SQL_PROFILE, [telegramUserId]);
      const row = rows[0];
      if (!row) return { status: "error", code: "notLinked" };
      const linked = row.linked_unix == null ? NaN : Number(row.linked_unix);
      return {
        status: "success",
        profile: {
          accountId: Number(row.account_id),
          userId: Number(row.user_id),
          role: row.role === "teacher" || row.role === "admin" ? "teacher" : "student",
          displayName: (row.display_name ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
          linkedAt: Number.isFinite(linked) ? linked : null,
        },
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    (deps.logError ?? ((value) => console.error("telegram account lookup failed", value)))(error);
    return { status: "error", code: "databaseFailure" };
  }
}

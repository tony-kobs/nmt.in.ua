import type { SqlConnection } from "@/lib/db/mysql";
import type { AvailableTopicTheme } from "./types";

export type { AvailableTopicTheme } from "./types";

const SQL_AVAILABLE_THEMES = `
  SELECT t.id, t.code, t.name, t.ord, COUNT(q.id) AS task_count
  FROM themes t
  INNER JOIN quiz_tasks q ON q.theme_id = t.id
  GROUP BY t.id, t.code, t.name, t.ord
  HAVING task_count >= 1
  ORDER BY t.ord ASC, t.id ASC
`;

type GetAvailableTopicThemesDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Themes that have at least one quiz task in the bank. */
export async function getAvailableTopicThemes(
  deps: GetAvailableTopicThemesDeps = { getConnection: loadDefaultConnection },
): Promise<AvailableTopicTheme[]> {
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{
      id: number;
      code: string;
      name: string;
      ord: number;
      task_count: number;
    }>(SQL_AVAILABLE_THEMES);

    return rows.map((row) => ({
      id: row.id,
      code: row.code.trim(),
      name: row.name.trim(),
      ord: row.ord,
      taskCount: Number(row.task_count),
    }));
  } finally {
    connection.release();
  }
}

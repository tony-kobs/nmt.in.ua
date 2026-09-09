import type { SqlConnection } from "@/lib/db/mysql";

export type NmtVariantListItem = {
  id: number;
  year: number;
  label: string;
  tasksNumber: number;
  sourceNote: string | null;
  /** Best completed attempt for the current user, if any. */
  bestAttempt: {
    sessionId: number;
    percent: number;
    timeSec: number;
  } | null;
};

type VariantRow = {
  id: number;
  year: number;
  label: string;
  tasks_number: number;
  source_note: string | null;
  session_id: number | null;
  right_number: number | null;
  tasks_number_done: number | null;
  time_sec: number | null;
};

const SQL_LIST = `
  SELECT
    v.id,
    v.year,
    v.label,
    v.tasks_number,
    v.source_note,
    best.id AS session_id,
    best.right_number,
    best.tasks_number AS tasks_number_done,
    best.time AS time_sec
  FROM nmt_variants v
  LEFT JOIN task_sessions best
    ON best.id = (
      SELECT ts.id
      FROM task_sessions ts
      WHERE ts.user_id = ?
        AND ts.session_type = 4
        AND ts.session_status = 1
        AND ts.nmt_variant_id = v.id
      ORDER BY
        (ts.right_number / NULLIF(ts.tasks_number, 0)) DESC,
        ts.id DESC
      LIMIT 1
    )
  WHERE v.is_published = 1
  ORDER BY v.year DESC, v.id DESC
`;

type GetNmtVariantsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function percentOf(right: number | null, total: number | null): number {
  if (!total || total <= 0 || right == null) return 0;
  return Math.round((100 * right) / total);
}

export async function getNmtVariantsForUser(
  userId: number,
  deps: GetNmtVariantsDeps = { getConnection: loadDefaultConnection },
): Promise<NmtVariantListItem[]> {
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<VariantRow>(SQL_LIST, [userId]);
    return rows.map((row) => ({
      id: row.id,
      year: row.year,
      label: row.label.trim(),
      tasksNumber: row.tasks_number,
      sourceNote: row.source_note,
      bestAttempt:
        row.session_id == null
          ? null
          : {
              sessionId: row.session_id,
              percent: percentOf(row.right_number, row.tasks_number_done),
              timeSec: row.time_sec ?? 0,
            },
    }));
  } finally {
    connection.release();
  }
}

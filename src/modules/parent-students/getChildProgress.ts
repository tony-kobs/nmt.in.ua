import "server-only";

import { TOPIC_RESULTS_SESSIONS_PER_THEME } from "@/modules/results/getTopicResults";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { defaultParentReadDeps, parentChildId, requireParentReadUser, type ParentReadDeps } from "./parentAccess";
import { ParentAccessError } from "./types";
import {
  buildChildProgress,
  type ChildProgress,
  type ProgressAttemptRow,
  type ProgressRecentRow,
  type ProgressSessionMetricRow,
  type ProgressThemeRow,
  type ProgressTotalsRow,
} from "./buildChildProgress";

export const CHILD_RECENT_RESULTS_LIMIT = 5;

const parentAndChild = `
  FROM parent_students ps
  INNER JOIN app_users parent ON parent.id = ps.parent_user_id
    AND parent.role = 'parent' AND parent.is_banned = 0
  INNER JOIN app_users child ON child.id = ps.student_user_id
    AND child.role = 'student' AND child.is_banned = 0`;

// Every read independently checks the current parent, child and relationship.
// LEFT JOIN preserves an authorized child with no completed sessions as a sentinel row.
const scopedSessions = `
  ${parentAndChild}
  LEFT JOIN task_sessions ts ON ts.user_id = child.id
    AND ts.session_status = ${SESSION_STATUS_COMPLETED} AND ts.session_type IN (1, 2, 3, 4, 5)
  LEFT JOIN themes t ON t.id = ts.theme_id
  WHERE ps.parent_user_id = ? AND ps.student_user_id = ?`;

const themeCatalogSql = `
  SELECT child.id AS child_id, t.id AS theme_id, t.code AS theme_code,
         t.name AS theme_name, t.ord AS theme_ord
  ${parentAndChild}
  LEFT JOIN themes t ON 1 = 1
  WHERE ps.parent_user_id = ? AND ps.student_user_id = ?
  ORDER BY t.ord ASC, t.id ASC`;

const sessionMetricsSql = `
  SELECT child.id AS child_id, ranked.id AS session_id, ranked.theme_id,
         ranked.tasks_number, ranked.right_number, ranked.\`time\`
  ${parentAndChild}
  LEFT JOIN (
    SELECT id, theme_id, tasks_number, right_number, \`time\`,
           ROW_NUMBER() OVER (PARTITION BY theme_id ORDER BY id DESC) AS rn
    FROM task_sessions
    WHERE user_id = ?
      AND (session_status = ${SESSION_STATUS_COMPLETED} OR expire_time > ?)
      AND session_type IN (1, 2, 3, 4, 5)
      AND theme_id IS NOT NULL
  ) ranked ON ranked.rn <= ${TOPIC_RESULTS_SESSIONS_PER_THEME}
  WHERE ps.parent_user_id = ? AND ps.student_user_id = ?
  ORDER BY ranked.id DESC`;

const attemptCountsSql = `
  SELECT child.id AS child_id, ts.theme_id, COUNT(ts.id) AS attempts
  ${parentAndChild}
  LEFT JOIN task_sessions ts ON ts.user_id = child.id
    AND ts.session_status = ${SESSION_STATUS_COMPLETED}
    AND ts.session_type IN (1, 2, 3, 4, 5)
    AND ts.theme_id IS NOT NULL
  WHERE ps.parent_user_id = ? AND ps.student_user_id = ?
  GROUP BY child.id, ts.theme_id`;

export async function getChildProgress(
  rawChildId: unknown, deps: ParentReadDeps = defaultParentReadDeps,
): Promise<ChildProgress> {
  const user = await requireParentReadUser(deps);
  const childId = parentChildId(rawChildId);
  const connection = await deps.getConnection();
  const params = [user.id, childId];
  try {
    // Stored totals already exclude follow-up tasks and reflect first-attempt scoring.
    // Do not recount tasks2session or substitute NMT test_points for right_number.
    const summary = await connection.query<ProgressTotalsRow>(
      `SELECT child.id AS child_id, child.display_name,
              COUNT(ts.id) AS completed_sessions, SUM(ts.tasks_number) AS total_tasks,
              SUM(ts.right_number) AS correct_answers
       ${scopedSessions} GROUP BY child.id, child.display_name`, params,
    );
    if (!summary[0]) throw new ParentAccessError("not_found");
    const themes = await connection.query<ProgressThemeRow>(themeCatalogSql, params);
    if (!themes.length) throw new ParentAccessError("not_found");
    const sessions = await connection.query<ProgressSessionMetricRow>(
      sessionMetricsSql, [childId, nowUnixSec(), user.id, childId],
    );
    if (!sessions.length) throw new ParentAccessError("not_found");
    const attempts = await connection.query<ProgressAttemptRow>(attemptCountsSql, params);
    if (!attempts.length) throw new ParentAccessError("not_found");
    const recent = await connection.query<ProgressRecentRow>(
      `SELECT child.id AS child_id, ts.id AS session_id, ts.session_type, ts.theme_id,
              t.name AS theme_name, ts.start_time, ts.tasks_number, ts.right_number,
              ts.test_points, ts.test_points_max
       ${scopedSessions} ORDER BY ts.start_time DESC, ts.id DESC LIMIT ${CHILD_RECENT_RESULTS_LIMIT}`, params,
    );
    if (!recent.length) throw new ParentAccessError("not_found");
    return buildChildProgress(summary[0], themes, sessions, attempts, recent);
  } finally {
    connection.release();
  }
}

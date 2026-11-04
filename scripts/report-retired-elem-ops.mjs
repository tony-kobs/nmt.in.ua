/**
 * Read-only counts for 065_remove_elem_ops_theme.sql.
 * Does not write. Prints one row per table the migration can change.
 *
 *   DB_HOST=127.0.0.1 DB_USER=... DB_PASSWORD=... DB_NAME=... \
 *     node scripts/report-retired-elem-ops.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const retired = `th.id = 1 AND th.code = 'MATH-05-ELEM-OPS'`;

const counts = [
  ["themes", `SELECT COUNT(*) AS n FROM themes th WHERE ${retired}`],
  ["themes_names_to_trim", `SELECT COUNT(*) AS n FROM themes WHERE CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(name, '\\\\n', ''), CHAR(10), ''), CHAR(13), ''))) > 0 AND CHAR_LENGTH(name) <> CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(name, '\\\\n', ''), CHAR(10), ''), CHAR(13), '')))`],
  ["quiz_tasks", `SELECT COUNT(*) AS n FROM quiz_tasks q INNER JOIN themes th ON th.id = q.theme_id AND ${retired}`],
  ["tasks2session_type_1", `SELECT COUNT(*) AS n FROM tasks2session t2s INNER JOIN quiz_tasks q ON q.id = t2s.task_id AND t2s.task_type = 1 INNER JOIN themes th ON th.id = q.theme_id AND ${retired}`],
  ["practice_task_origin", `SELECT COUNT(*) AS n FROM practice_task_origin origin_row INNER JOIN tasks2session t2s ON t2s.id = origin_row.tasks2session_id INNER JOIN quiz_tasks q ON q.id = t2s.task_id AND t2s.task_type = 1 INNER JOIN themes th ON th.id = q.theme_id AND ${retired}`],
  ["marathon_day_tasks", `SELECT COUNT(*) AS n FROM marathon_day_tasks day_task INNER JOIN quiz_tasks q ON q.id = day_task.question_id INNER JOIN themes th ON th.id = q.theme_id AND ${retired}`],
  ["session_tasks", `SELECT COUNT(*) AS n FROM session_tasks session_task INNER JOIN quiz_tasks q ON q.id = session_task.quiz_task_id INNER JOIN themes th ON th.id = q.theme_id AND ${retired}`],
  ["sessions", `SELECT COUNT(*) AS n FROM sessions learning_session INNER JOIN themes th ON th.id = learning_session.theme_id AND ${retired}`],
  ["mentor_assignments", `SELECT COUNT(*) AS n FROM mentor_assignments assignment INNER JOIN themes th ON th.id = assignment.theme_id AND ${retired}`],
  ["user_self_scores", `SELECT COUNT(*) AS n FROM user_self_scores WHERE theme_id = 1 AND NOT EXISTS (SELECT 1 FROM themes th WHERE th.id = 1 AND th.code <> 'MATH-05-ELEM-OPS')`],
  ["problems", `SELECT COUNT(*) AS n FROM problems problem INNER JOIN themes th ON th.id = problem.theme_id AND ${retired}`],
  ["nmt_quiz_tasks_unlink", `SELECT COUNT(*) AS n FROM nmt_quiz_tasks nmt INNER JOIN themes th ON th.id = nmt.theme_id AND ${retired}`],
  ["theme_connections", `SELECT COUNT(*) AS n FROM theme_connections edge INNER JOIN themes th ON th.id = 1 AND th.code = 'MATH-05-ELEM-OPS' WHERE edge.vertex_start = th.id OR edge.vertex_finish = th.id`],
  ["user_notifications", `SELECT COUNT(*) AS n FROM user_notifications WHERE link LIKE '%topic=MATH-05-ELEM-OPS%' OR ((link = '/?theme=1' OR link LIKE '/?theme=1&%') AND NOT EXISTS (SELECT 1 FROM themes th WHERE th.id = 1 AND th.code <> 'MATH-05-ELEM-OPS'))`],
  ["textbook_sections", `SELECT COUNT(*) AS n FROM textbook_sections WHERE theme_code = 'MATH-05-ELEM-OPS'`],
  ["textbook_section_versions", `SELECT COUNT(*) AS n FROM textbook_section_versions WHERE theme_code = 'MATH-05-ELEM-OPS'`],
  ["task_sessions_kept", `SELECT COUNT(*) AS n FROM task_sessions WHERE theme_id = 1`],
];

loadEnvLocal();
const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  console.log("dry-run MATH-05-ELEM-OPS (no writes)");
  for (const [table, sql] of counts) {
    try {
      const [rows] = await connection.query(sql);
      console.log(`${table}\t${rows[0]?.n ?? 0}`);
    } catch (error) {
      const errno = error && typeof error === "object" ? error.errno : "";
      console.log(`${table}\tmissing (${errno || "error"})`);
    }
  }
} finally {
  await connection.end();
}

import type { SqlConnection } from "@/lib/db/mysql";

/**
 * Draw topic-bank ids for a new hand-out.
 *
 * Preference, per student, is: never issued, then issued but never solved,
 * then already solved. A class hand-out keeps one shared list: a task that
 * is still new for more of the selected students ranks first. Ties are
 * shuffled with `random` (values in [0, 1)).
 *
 * Answer options are not touched. The caller decides which ids are legal
 * and must pass only published bank ids. A draft never belongs in this draw.
 */

const TASK_TYPE_TOPIC = 1;

export type TopicTaskHistory = {
  issued: ReadonlySet<number>;
  solved: ReadonlySet<number>;
};

type RankedId = {
  id: number;
  fresh: number;
  open: number;
  tie: number;
};

function asId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function emptyHistory(): TopicTaskHistory {
  return { issued: new Set(), solved: new Set() };
}

export function pickFreshTaskIds(
  pool: readonly number[],
  histories: readonly TopicTaskHistory[],
  limit: number,
  random: () => number = Math.random,
): number[] {
  if (limit <= 0) return [];

  const unique: number[] = [];
  const seen = new Set<number>();
  for (const raw of pool) {
    const id = asId(raw);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (unique.length === 0) return [];

  const people = histories.length > 0 ? histories : [emptyHistory()];
  const ranked: RankedId[] = unique.map((id) => {
    let fresh = 0;
    let open = 0;
    for (const person of people) {
      const solved = person.solved.has(id);
      const issued = person.issued.has(id) || solved;
      if (!issued) fresh += 1;
      else if (!solved) open += 1;
    }
    return { id, fresh, open, tie: random() };
  });

  ranked.sort(
    (a, b) => b.fresh - a.fresh || b.open - a.open || a.tie - b.tie,
  );
  return ranked.slice(0, Math.min(limit, ranked.length)).map((row) => row.id);
}

type AttemptRow = {
  user_id: number | string;
  task_id: number | string;
  solved: number | string | null;
};

type AssignedRow = {
  user_id: number | string;
  task_id: number | string;
};

/** Started attempts: issued, and solved when any try was correct. */
const SQL_ATTEMPTS = `
  /* topic-task-attempts */
  SELECT t2s.user_id AS user_id,
         t2s.task_id AS task_id,
         MAX(CASE
           WHEN t2s.status = 1 OR t2s.first_attempt_status = 1 THEN 1
           ELSE 0
         END) AS solved
  FROM tasks2session t2s
  INNER JOIN quiz_tasks q ON q.id = t2s.task_id
  WHERE t2s.task_type = ${TASK_TYPE_TOPIC}
    AND q.theme_id = ?
    AND t2s.user_id IN (__USER_IDS__)
  GROUP BY t2s.user_id, t2s.task_id
`;

/**
 * Active assignment lists count as issued even before the student opens
 * them. A cancelled assignment does not.
 */
const SQL_ASSIGNED = `
  /* topic-task-assigned */
  SELECT mam.student_user_id AS user_id,
         st.quiz_task_id AS task_id
  FROM mentor_assignment_members mam
  INNER JOIN mentor_assignments a
    ON a.id = mam.assignment_id AND a.status = 'active'
  INNER JOIN session_tasks st ON st.session_id = a.session_id
  INNER JOIN quiz_tasks q ON q.id = st.quiz_task_id
  WHERE q.theme_id = ?
    AND mam.student_user_id IN (__USER_IDS__)
`;

/**
 * One record per requested user, in the same order. Users with no rows
 * stay empty so a class draw still treats those tasks as new for them.
 */
export async function loadTopicTaskHistories(
  connection: SqlConnection,
  userIds: readonly number[],
  themeId: number,
): Promise<TopicTaskHistory[]> {
  const ids = [...new Set(userIds.filter((id) => asId(id) != null))];
  if (ids.length === 0 || asId(themeId) == null) {
    return userIds.map(() => emptyHistory());
  }

  const marks = ids.map(() => "?").join(", ");
  const attempts = await connection.query<AttemptRow>(
    SQL_ATTEMPTS.replace("__USER_IDS__", marks),
    [themeId, ...ids],
  );
  const assigned = await connection.query<AssignedRow>(
    SQL_ASSIGNED.replace("__USER_IDS__", marks),
    [themeId, ...ids],
  );

  const byUser = new Map<number, { issued: Set<number>; solved: Set<number> }>();
  for (const id of ids) {
    byUser.set(id, { issued: new Set(), solved: new Set() });
  }

  for (const row of attempts) {
    const userId = asId(row.user_id);
    const taskId = asId(row.task_id);
    const bucket = userId == null ? undefined : byUser.get(userId);
    if (taskId == null || !bucket) continue;
    bucket.issued.add(taskId);
    if (Number(row.solved) === 1) bucket.solved.add(taskId);
  }

  for (const row of assigned) {
    const userId = asId(row.user_id);
    const taskId = asId(row.task_id);
    const bucket = userId == null ? undefined : byUser.get(userId);
    if (taskId == null || !bucket) continue;
    bucket.issued.add(taskId);
  }

  return userIds.map((id) => byUser.get(id) ?? emptyHistory());
}

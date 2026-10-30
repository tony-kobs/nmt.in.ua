/**
 * Which task list a legacy assignment becomes.
 * The SQL procedure in `062_teacher_learning_sessions.sql` uses the same rule
 * for attempts that already started: the `tasks2session` row with the smallest
 * id picks the student attempt, then that attempt's tasks stay in mapping order.
 * Attempts that never started are frozen in SQL by `quiz_tasks.id` (not here).
 */
export type MigratedMemberTasks = {
  taskSessionId: number;
  firstMappingId: number;
  taskIds: readonly number[];
};

export function chooseMigratedTaskIds(
  members: readonly MigratedMemberTasks[],
): number[] | null {
  const started = members.filter(
    (member) =>
      member.taskIds.length > 0 &&
      Number.isInteger(member.firstMappingId) &&
      member.firstMappingId > 0,
  );
  if (started.length === 0) return null;

  const [first] = [...started].sort(
    (a, b) =>
      a.firstMappingId - b.firstMappingId || a.taskSessionId - b.taskSessionId,
  );
  if (!first) return null;

  const seen = new Set<number>();
  const ids: number[] = [];
  for (const id of first.taskIds) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

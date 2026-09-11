/**
 * Where a Practice-mode follow-up task ("similar task") lands in the client's
 * task list. Pure and side-effect free so the placement rule is unit-testable
 * without rendering `TopicTrainer`.
 *
 * Inserting right after the task that was just answered incorrectly — not at
 * the end of the list — matters: `TopicTrainer` derives `isLast` from
 * `currentIndex === taskList.length - 1`. Appending to the end always makes
 * the new task "last", which hides the "Next" button for any real tasks still
 * waiting after it and hides "Finish" too (they're still unanswered) — the
 * student is left with only the "back to topics" link. Inserting right after
 * the current task keeps the remaining original tasks reachable via "Next".
 */
export function insertFollowUpTask<T>(
  list: readonly T[],
  afterIndex: number,
  task: T,
): { list: T[]; index: number } {
  const insertAt = afterIndex + 1;
  return {
    list: [...list.slice(0, insertAt), task, ...list.slice(insertAt)],
    index: insertAt,
  };
}

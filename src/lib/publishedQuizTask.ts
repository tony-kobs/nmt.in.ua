/**
 * Student pools, level counts, and student task lists read only published
 * `quiz_tasks`. Drafts stay in the admin bank until someone publishes them.
 */
export function publishedQuizTaskSql(alias?: string): string {
  if (alias && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error("Invalid quiz task alias.");
  }
  const column = alias ? `${alias}.status` : "status";
  return `${column} = 'published'`;
}

/**
 * A quiz row belongs to a theme by `theme_id`, or by a catalog title
 * `«Назва теми — 35»` when the id was stored on another theme.
 * The trailing number is an import index, not a second theme.
 */
export function quizTaskMatchesThemeSql(taskAlias: string, themeAlias: string): string {
  return `(
    ${taskAlias}.theme_id = ${themeAlias}.id
    OR ${taskAlias}.name = ${themeAlias}.name
    OR ${taskAlias}.name LIKE CONCAT(${themeAlias}.name, ' — %')
    OR ${taskAlias}.name LIKE CONCAT(${themeAlias}.name, ' - %')
  )`;
}

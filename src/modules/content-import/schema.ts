/**
 * Column lists and length limits, verified against the `themes`,
 * `theme_connections`, and `quiz_tasks` tables in phpMyAdmin. Column order
 * here is also the required CSV header order and the SQL column order used
 * for every INSERT.
 */

export const THEMES_REQUIRED_COLUMNS = [
  "id",
  "name",
  "description",
  "ord",
] as const;

export const THEMES_COLUMNS = [
  ...THEMES_REQUIRED_COLUMNS,
  "code",
] as const;

export const MAX_LEN_THEME_CODE = 32;
export const THEME_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const THEME_CONNECTIONS_COLUMNS = [
  "id",
  "vertex_start",
  "vertex_finish",
] as const;
export const QUIZ_TASKS_COLUMNS = [
  "id",
  "name",
  "task_text",
  "theme_id",
  "answer_1",
  "answer_2",
  "answer_3",
  "answer_4",
  "right_answer_n",
  "comments",
] as const;

/** varchar(100) columns: themes.name, quiz_tasks.name */
export const MAX_LEN_VARCHAR_100 = 100;
/** varchar(50) columns: quiz_tasks.answer_1..4 */
export const MAX_LEN_VARCHAR_50 = 50;
/** varchar(100) column: quiz_tasks.comments */
export const MAX_LEN_COMMENTS = 100;
/**
 * themes.description and quiz_tasks.task_text are `text` columns (up to
 * 65535 bytes in MySQL). This is a conservative application-level guard
 * against abusive uploads, not the column's real capacity.
 */
export const MAX_LEN_TEXT = 20000;

export const MIN_RIGHT_ANSWER = 1;
export const MAX_RIGHT_ANSWER = 4;

/**
 * Signed MySQL `INT` bounds. Every `int` column in the verified schema
 * (`id`, `ord`, `vertex_start`, `vertex_finish`, `theme_id`,
 * `right_answer_n`) is constrained to this range so a value that would
 * overflow the column is rejected before it ever reaches SQL.
 */
export const MYSQL_INT_MIN = -2147483648;
export const MYSQL_INT_MAX = 2147483647;

/** Conservative cap on the combined size of all uploaded import files. */
export const MAX_TOTAL_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Cap on the declared `Content-Length` of the whole HTTP request body.
 * `Content-Length` also counts multipart boundaries and part headers, not
 * just file content, so this must stay above `MAX_TOTAL_UPLOAD_BYTES` to
 * leave headroom for that overhead — matches the `MAX_BODY_BYTES=8388608`
 * (8 MiB) recommendation for `server.js` in README.md.
 */
export const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;

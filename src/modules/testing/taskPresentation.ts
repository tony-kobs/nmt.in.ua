/**
 * Rich-task architecture (see AGENTS task "interactive diagnostic
 * experience"). The current `quiz_tasks` schema can only ever describe one
 * interaction shape — a question plus 4 fixed text answers, one correct
 * index — so every format below is a *typed* target for future schema work,
 * not something the UI can pick between today.
 *
 * `resolveTaskPresentation` is the single place that turns raw task data
 * into a presentation: today it only ever returns "choice" or "table-choice"
 * (both fully implemented — see `TaskVisualArea`), because those are the
 * only two formats derivable from the existing `task_text` column without a
 * migration:
 *  - "choice": plain task_text, no visual.
 *  - "table-choice": task_text opens with a GFM-style pipe table (authored
 *    today via the existing CSV/JSON `task_text` field — no new column). The
 *    table is parsed out and rendered in the visual area; the remaining text
 *    stays the question.
 *  - a leading `![alt](url)` markdown image line in task_text is likewise
 *    parsed out into a "choice" task's visual (still "choice" — an image
 *    illustrating a text question isn't a different interaction).
 *
 * To add a real "visual-choice" (image/graph answer *cards*), "numeric-line",
 * "matching", "ordering", "error-spotting", "fill-gap", or
 * "expression-builder" format, the DB needs new structured columns/tables to
 * carry that shape safely (e.g. per-answer image URLs, an ordered step list,
 * a numeric range + tolerance). Until then those formats stay declared here
 * for type-safety and documentation only; `resolveTaskPresentation` never
 * produces them, and any task data that somehow requested one should fall
 * back to plain "choice" rendering rather than break.
 */
export type TaskFormat =
  | "choice"
  | "visual-choice"
  | "numeric-line"
  | "matching"
  | "ordering"
  | "error-spotting"
  | "fill-gap"
  | "table-choice"
  | "expression-builder";

/** Formats `resolveTaskPresentation` can actually produce from the current
 * schema. Keep in sync with the switch in `resolveTaskPresentation`. */
export const IMPLEMENTED_TASK_FORMATS = ["choice", "table-choice"] as const;
export type ImplementedTaskFormat = (typeof IMPLEMENTED_TASK_FORMATS)[number];

export type TaskVisual =
  | { kind: "image"; src: string; alt: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | null;

export type TaskPresentation = {
  format: ImplementedTaskFormat;
  /** `taskText` with any leading visual markup stripped out — this is what
   * should be handed to `MathText`, not the raw field. */
  displayText: string;
  visual: TaskVisual;
};

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)[ \t]*/;

function extractImage(
  text: string,
): { alt: string; src: string; rest: string } | null {
  const match = IMAGE_LINE.exec(text);
  if (!match) return null;
  const [full, alt, src] = match;
  const rest = text.slice(full.length).trim();
  // A task whose entire text is the image markup has no question left to
  // ask — treat it as plain text rather than silently dropping the content.
  if (!rest) return null;
  return { alt, src, rest };
}

const TABLE_ROW = /^\|.*\|$/;
const TABLE_SEPARATOR_ROW = /^\|(\s*:?-{1,}:?\s*\|)+$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function extractTable(
  text: string,
): { headers: string[]; rows: string[][]; rest: string } | null {
  const lines = text.split(/\r?\n/);
  if (lines.length < 3) return null;

  const headerLine = lines[0]!.trim();
  const separatorLine = lines[1]!.trim();
  if (!TABLE_ROW.test(headerLine) || !TABLE_SEPARATOR_ROW.test(separatorLine)) {
    return null;
  }

  const headers = splitTableRow(headerLine);
  const rows: string[][] = [];
  let index = 2;
  while (index < lines.length && TABLE_ROW.test(lines[index]!.trim())) {
    rows.push(splitTableRow(lines[index]!));
    index += 1;
  }

  const rest = lines.slice(index).join("\n").trim();
  // A table with no question below it isn't "read the table, pick the
  // conclusion" — nothing to pick from, so don't classify it as table-choice.
  if (!rest) return null;

  return { headers, rows, rest };
}

/** Pure derivation from already-loaded task data — safe to call on every
 * render; does not touch the network or the DB. */
export function resolveTaskPresentation(task: {
  taskText: string;
}): TaskPresentation {
  const trimmed = task.taskText.trim();

  const image = extractImage(trimmed);
  if (image) {
    return {
      format: "choice",
      displayText: image.rest,
      visual: { kind: "image", src: image.src, alt: image.alt },
    };
  }

  const table = extractTable(trimmed);
  if (table) {
    return {
      format: "table-choice",
      displayText: table.rest,
      visual: { kind: "table", headers: table.headers, rows: table.rows },
    };
  }

  return { format: "choice", displayText: trimmed, visual: null };
}

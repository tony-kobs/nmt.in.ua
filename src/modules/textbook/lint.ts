import katex from "katex";
import { isUploadPlaceholderSrc } from "./imageLimits";
import { safeImageSrc } from "./markup";

import { isBankTaskLine, listTextbookTaskRefs, parseBankTaskLine } from "./bankTask";
import { lineHasImportReview } from "./importMarkers";

export type TextbookLintCode =
  | "formula"
  | "fence"
  | "fence-end"
  | "image"
  | "paper"
  | "math"
  | "task"
  | "task-missing"
  | "import";

export type TextbookLintIssue = {
  line: number;
  code: TextbookLintCode;
  detail: string;
};

const FORMULA_CACHE_LIMIT = 500;
const formulaOk = new Set<string>();

type Frame = { kind: "table" | "row" | "cell" | "graph"; line: number };

export function textbookFormulaError(formula: string): string | null {
  const body = formula.trim();
  if (formulaOk.has(body)) return null;
  try {
    katex.renderToString(body, {
      throwOnError: true,
      output: "html",
      strict: "ignore",
      trust: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "formula";
    return message.replace(/\s+/g, " ").trim().slice(0, 180);
  }
  if (formulaOk.size >= FORMULA_CACHE_LIMIT) {
    const oldest = formulaOk.values().next().value;
    if (oldest !== undefined) formulaOk.delete(oldest);
  }
  formulaOk.add(body);
  return null;
}

function formulasOnLine(line: string): { formulas: string[] } | { unclosed: true } {
  const formulas: string[] = [];
  let index = 0;
  while (index < line.length) {
    if (line.startsWith("\\\\", index)) {
      index += 2;
      continue;
    }
    const open = line.startsWith("\\(", index) ? "\\(" : line.startsWith("\\[", index) ? "\\[" : "";
    if (!open) {
      index += 1;
      continue;
    }
    const close = open === "\\(" ? "\\)" : "\\]";
    const end = line.indexOf(close, index + 2);
    if (end === -1) return { unclosed: true };
    formulas.push(line.slice(index + 2, end));
    index = end + 2;
  }
  return { formulas };
}

function endKind(line: string): Frame["kind"] | null {
  if (line === ":::endtable") return "table";
  if (line === ":::endrow") return "row";
  if (line === ":::endcell") return "cell";
  return null;
}

function openKind(line: string): Frame["kind"] | null {
  if (line === ":::graph") return "graph";
  if (line === ":::row") return "row";
  if (line === ":::cell" || line.startsWith(":::cell ")) return "cell";
  if (line === ":::table" || line.startsWith(":::table ")) return "table";
  return null;
}

/**
 * Formula and fence problems in one section. Line numbers are 1-based.
 * An in-flight upload placeholder (`pending-…`) is not an image error.
 */
export function lintTextbookMarkup(source: string): TextbookLintIssue[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const issues: TextbookLintIssue[] = [];
  const stack: Frame[] = [];

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trim();
    if (lineHasImportReview(raw)) {
      issues.push({ line: lineNo, code: "import", detail: "" });
    }
    if (isBankTaskLine(line)) {
      if (!parseBankTaskLine(line)) issues.push({ line: lineNo, code: "task", detail: "" });
      return;
    }
    const closing = endKind(line);
    if (closing) {
      const top = stack[stack.length - 1];
      if (!top || top.kind !== closing) {
        issues.push({ line: lineNo, code: "fence-end", detail: line });
      } else {
        stack.pop();
      }
      return;
    }
    if (line === ":::" && stack.some((frame) => frame.kind === "graph")) {
      for (let frame = stack.length - 1; frame >= 0; frame -= 1) {
        if (stack[frame]?.kind === "graph") {
          stack.splice(frame, 1);
          break;
        }
      }
      return;
    }
    const opening = openKind(line);
    if (opening) {
      stack.push({ kind: opening, line: lineNo });
      return;
    }
    if (line.startsWith(":::paper ") && !/^:::paper (\d+) (\d+)(?: (\d+))?$/.test(line)) {
      issues.push({ line: lineNo, code: "paper", detail: "" });
    }
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
    if (image) {
      const src = image[2] ?? "";
      if (!safeImageSrc(src) && !isUploadPlaceholderSrc(src)) {
        issues.push({ line: lineNo, code: "image", detail: "" });
      }
    }
    const math = formulasOnLine(raw);
    if ("unclosed" in math) {
      issues.push({ line: lineNo, code: "math", detail: "" });
      return;
    }
    for (const formula of math.formulas) {
      const detail = textbookFormulaError(formula);
      if (detail) issues.push({ line: lineNo, code: "formula", detail });
    }
  });

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (!frame) continue;
    issues.push({ line: frame.line, code: "fence", detail: `:::${frame.kind}` });
  }
  return issues;
}

/** Ids the bank lookup confirmed are gone. Line numbers follow the current draft. */
export function missingTaskLint(source: string, missing: readonly string[]): TextbookLintIssue[] {
  const gone = new Set(missing);
  return listTextbookTaskRefs(source).flatMap((item) =>
    gone.has(item.ref) ? [{ line: item.line, code: "task-missing" as const, detail: item.ref }] : [],
  );
}

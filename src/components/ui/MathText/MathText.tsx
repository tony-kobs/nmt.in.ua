import clsx from "clsx";
import katex from "katex";
import { parseMathText } from "./parseMathText";
import css from "./MathText.module.css";

type MathTextProps = {
  text: string;
  className?: string;
  as?: "span" | "div";
};

/**
 * KaTeX parsing is the slowest part of showing a task, and the trainer walks
 * back and forth over the same handful of formulas. Rendered markup is pure a
 * function of (content, displayMode), so keep it — bounded, because materials
 * pages can walk through hundreds of distinct formulas in one session.
 */
const RENDER_CACHE_LIMIT = 500;
const renderCache = new Map<string, string>();

function renderFormula(content: string, displayMode: boolean): string {
  let formula = content.trim();
  formula = formula
    .replace(/^\\\(\s*/, "")
    .replace(/\s*\\\)$/, "")
    .replace(/^\\\[\s*/, "")
    .replace(/\s*\\\]$/, "")
    .trim();
  const useDisplay =
    displayMode || /\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}/.test(formula);

  const key = `${useDisplay ? "d" : "i"}:${formula}`;
  const cached = renderCache.get(key);
  if (cached !== undefined) return cached;

  const html = katex.renderToString(formula, {
    displayMode: useDisplay,
    throwOnError: false,
    output: "htmlAndMathml",
    strict: "ignore",
    trust: false,
  });

  if (renderCache.size >= RENDER_CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, html);
  return html;
}

function Formula({
  content,
  displayMode,
}: {
  content: string;
  displayMode: boolean;
}) {
  const useDisplay =
    displayMode ||
    /\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}/.test(content);
  const html = renderFormula(content, displayMode);

  return (
    <span
      className={clsx(
        css.formula,
        useDisplay ? css.displayFormula : css.inlineFormula,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathText({ text, className, as = "span" }: MathTextProps) {
  const Tag = as === "div" ? "div" : "span";
  const parts = parseMathText(text);

  return (
    <Tag className={clsx(css.root, className)}>
      {parts.map((part, index) =>
        part.type === "formula" ? (
          <Formula
            key={`${part.type}-${index}`}
            content={part.content}
            displayMode={part.displayMode}
          />
        ) : (
          <span key={`${part.type}-${index}`}>{part.content}</span>
        ),
      )}
    </Tag>
  );
}

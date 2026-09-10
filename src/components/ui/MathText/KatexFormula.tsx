"use client";

import clsx from "clsx";
import katex from "katex";
import "katex/dist/katex.min.css";
import css from "./MathText.module.css";

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
    displayMode ||
    /\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}/.test(formula);

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

export function KatexFormula({
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

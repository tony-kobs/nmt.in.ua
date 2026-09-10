"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { parseMathText } from "./parseMathText";
import css from "./MathText.module.css";

type MathTextProps = {
  text: string;
  className?: string;
  as?: "span" | "div";
};

/**
 * KaTeX lives in a separate async chunk (`KatexFormula`) so routes that never
 * render formulas do not download katex JS/CSS. Formula pages still SSR via
 * `ssr: true`.
 */
const KatexFormula = dynamic(
  () => import("./KatexFormula").then((mod) => mod.KatexFormula),
  {
    ssr: true,
    loading: () => null,
  },
);

export function MathText({ text, className, as = "span" }: MathTextProps) {
  const Tag = as === "div" ? "div" : "span";
  const parts = parseMathText(text);
  const hasFormula = parts.some((part) => part.type === "formula");

  return (
    <Tag className={clsx(css.root, className)}>
      {parts.map((part, index) =>
        part.type === "formula" && hasFormula ? (
          <KatexFormula
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

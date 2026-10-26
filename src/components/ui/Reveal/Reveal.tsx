import { createElement, type ReactNode } from "react";
import css from "./Reveal.module.css";

type RevealTag = "div" | "span" | "li" | "section" | "article" | "header";

type RevealProps = {
  children: ReactNode;
  /** Element to render. Keeps list/section semantics intact. */
  as?: RevealTag;
  /** Stagger offset in milliseconds. */
  delay?: number;
  className?: string;
};

/** CSS reveal. No motion runtime, so the landing does not load that library. */
export function Reveal({
  children,
  as = "div",
  delay = 0,
  className,
}: RevealProps) {
  return createElement(
    as,
    {
      className: [css.reveal, className].filter(Boolean).join(" "),
      style: { "--reveal-delay": `${delay}ms` },
    },
    children,
  );
}

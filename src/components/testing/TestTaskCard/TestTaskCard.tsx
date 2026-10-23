import type { ReactNode } from "react";
import css from "./TestTaskCard.module.css";

type TestTaskCardProps = {
  title: ReactNode;
  titleId?: string;
  /** Subject, theme, or points — the green pill in the heading. */
  badge?: ReactNode;
  /** Short topic line under the heading. */
  kicker?: ReactNode;
  /** Question statement in the inner paper well. */
  prompt?: ReactNode;
  /** Pin row: hint, explanation, or a status that is not the answer key. */
  hint?: ReactNode;
  /** Green pill: revealed result or a short verdict. */
  result?: ReactNode;
  children?: ReactNode;
  /** `fieldset` when the card is a radio group. The legend is the title. */
  as?: "article" | "fieldset";
  heading?: "h2" | "h3";
};

function Dots() {
  return (
    <span className={css.dots} aria-hidden="true">
      <span className={css.dot} />
      <span className={css.dotSoft} />
    </span>
  );
}

function Pin() {
  return (
    <svg className={css.pin} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.15a4.35 4.35 0 0 0-4.35 4.35c0 3.15 4.35 8.35 4.35 8.35s4.35-5.2 4.35-8.35A4.35 4.35 0 0 0 8 1.15Zm0 5.85a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
      />
    </svg>
  );
}

function Heading({
  as,
  heading,
  titleId,
  title,
  badge,
}: Pick<TestTaskCardProps, "as" | "heading" | "titleId" | "title" | "badge">) {
  const label = (
    <>
      <Dots />
      <span id={as === "fieldset" ? titleId : undefined}>{title}</span>
    </>
  );

  if (as === "fieldset") {
    return (
      <legend className={css.head}>
        <span className={css.title}>{label}</span>
        {badge ? <span className={css.badge}>{badge}</span> : null}
      </legend>
    );
  }

  const Tag = heading === "h3" ? "h3" : "h2";
  return (
    <div className={css.head}>
      <Tag id={titleId} className={css.title}>
        {label}
      </Tag>
      {badge ? <p className={css.badge}>{badge}</p> : null}
    </div>
  );
}

export function TestTaskCard({
  title,
  titleId,
  badge,
  kicker,
  prompt,
  hint,
  result,
  children,
  as = "article",
  heading = "h2",
}: TestTaskCardProps) {
  const body = (
    <>
      <Heading as={as} heading={heading} titleId={titleId} title={title} badge={badge} />
      {kicker ? <p className={css.kicker}>{kicker}</p> : null}
      {prompt ? <div className={css.prompt}>{prompt}</div> : null}
      {children}
      {hint || result ? (
        <div className={css.foot}>
          {hint ? (
            <div className={css.hint}>
              <Pin />
              <div className={css.hintBody}>{hint}</div>
            </div>
          ) : null}
          {result ? <p className={css.result}>{result}</p> : null}
        </div>
      ) : null}
    </>
  );

  if (as === "fieldset") {
    return <fieldset className={css.card}>{body}</fieldset>;
  }

  return (
    <article className={css.card} aria-labelledby={titleId}>
      {body}
    </article>
  );
}

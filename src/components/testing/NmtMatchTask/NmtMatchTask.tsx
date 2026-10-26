"use client";

import { useId, type ReactNode } from "react";
import Image from "next/image";

import { MathText } from "@/components/ui/MathText";
import { Select } from "@/components/ui/Select";
import type { NmtMatchView } from "@/modules/testing/nmtMatch";

import styles from "./NmtMatchTask.module.css";

type NmtMatchTaskProps = {
  match: NmtMatchView;
  imageAlt: string;
  /** Latin column codes already chosen for rows 1–3. */
  selected?: readonly string[];
  locked?: boolean;
  instruction?: string;
  pickLabel?: string;
  submitLabel?: string;
  rowLabel?: (row: number) => string;
  onSelect?: (row: number, value: string) => void;
  onSubmit?: () => void;
};

function TaskBody({
  text,
  imageAlt,
}: {
  text: string;
  imageAlt: string;
}) {
  if (!text.trim()) return null;
  const parts = text.split(/!\[\s*\]\s*\(([^)]+)\)/g);
  return (
    <div className={styles.text}>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <span key={index} className={styles.imageWrap}>
              <Image
                src={part.trim()}
                alt={imageAlt}
                width={604}
                height={340}
                className={styles.image}
                unoptimized
              />
            </span>
          );
        }
        if (!part.trim()) return null;
        return <MathText key={index} as="div" text={part} />;
      })}
    </div>
  );
}

function Column({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.column} aria-labelledby={title ? titleId : undefined}>
      {title ? (
        <p id={titleId} className={styles.title}>
          {title}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function NmtMatchTask({
  match,
  imageAlt,
  selected = [],
  locked = false,
  instruction,
  pickLabel,
  submitLabel,
  rowLabel,
  onSelect,
  onSubmit,
}: NmtMatchTaskProps) {
  const baseId = useId();
  const interactive = Boolean(onSubmit);
  const ready = interactive && selected.length >= match.left.length && selected.every(Boolean);

  const columns = (
    <div className={styles.columns}>
      <div className={styles.options}>
        <Column title={match.rightTitle} titleId={`${baseId}-right`}>
          <ul className={styles.list}>
            {match.right.map((option) => (
              <li key={option.value} className={styles.item}>
                <span className={styles.mark}>{option.label}</span>
                <TaskBody text={option.text} imageAlt={imageAlt} />
              </li>
            ))}
          </ul>
        </Column>
      </div>
      <div className={styles.prompts}>
        <Column title={match.leftTitle} titleId={`${baseId}-left`}>
          {instruction ? <p className={styles.instruction}>{instruction}</p> : null}
          <ol className={styles.list}>
            {match.left.map((text, row) => (
              <li key={row} className={styles.item}>
                <span className={styles.mark}>{row + 1}</span>
                <div className={styles.promptBody}>
                  <TaskBody text={text} imageAlt={imageAlt} />
                  {interactive ? (
                    <div className={styles.select}>
                      <Select
                        value={selected[row] ?? ""}
                        placeholder={pickLabel}
                        disabled={locked}
                        aria-label={rowLabel?.(row + 1) ?? String(row + 1)}
                        options={match.right.map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        onChange={(next) => onSelect?.(row, next)}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Column>
      </div>
    </div>
  );

  if (!interactive) {
    return <div className={styles.board}>{columns}</div>;
  }

  return (
    <form
      className={styles.board}
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || locked) return;
        onSubmit?.();
      }}
    >
      {columns}
      <button type="submit" className={styles.submit} disabled={locked || !ready}>
        {submitLabel}
      </button>
    </form>
  );
}

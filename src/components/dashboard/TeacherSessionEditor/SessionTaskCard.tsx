"use client";

import { useId } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { TestTaskCard, optionLetter, taskKicker, topicOptionsStackUntilTablet } from "@/components/testing/TestTaskCard";
import cardCss from "@/components/testing/TestTaskCard/TestTaskCard.module.css";
import { MathText } from "@/components/ui/MathText";
import { taskImageSrc } from "@/modules/textbook/bankTask";
import type { SessionTaskView } from "@/modules/teacher-sessions/types";
import css from "./TeacherSessionEditor.module.css";

const NativeImage = "img";

function TaskRichText({ text, imageAlt }: { text: string; imageAlt: string }) {
  const parts = text.split(/!\[([^\]]*)\]\(([^)\s]+)\)/g);
  const nodes = [];
  for (let index = 0; index < parts.length; index += 3) {
    const plain = parts[index] ?? "";
    if (plain) nodes.push(<MathText key={`t-${index}`} text={plain} />);
    const alt = parts[index + 1];
    const src = parts[index + 2] ? taskImageSrc(parts[index + 2]) : null;
    if (src) {
      nodes.push(
        <NativeImage key={`i-${index}`} className={css.promptImage} src={src} alt={alt || imageAlt} />,
      );
    }
  }
  if (nodes.length === 0) return null;
  return <div className={css.rich}>{nodes}</div>;
}

type SessionTaskCardProps = {
  task: SessionTaskView;
  index: number;
  onRemove?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
};

export function SessionTaskCard({
  task,
  index,
  onRemove,
  onUp,
  onDown,
  disableUp,
  disableDown,
}: SessionTaskCardProps) {
  const t = useTranslations("TeacherSessions");
  const titleId = useId();
  const imageAlt = t("imageAlt", { n: index + 1 });
  const tools = onRemove || onUp || onDown;

  if (task.missing) {
    return (
      <article className={css.missing} aria-labelledby={titleId}>
        <h3 id={titleId} className={css.missingTitle}>
          {t("taskLabel", { n: index + 1 })}
        </h3>
        <p className={css.missingBody}>{t("missing")}</p>
      </article>
    );
  }

  const stack = topicOptionsStackUntilTablet(task.options.map((option) => option.text));
  const correct = task.options.find((option) => option.number === task.correctNumber);

  return (
    <div className={css.taskBlock}>
      {tools ? (
        <div className={css.taskTools}>
          <button type="button" className={css.tool} onClick={onUp} disabled={disableUp}>
            {t("moveUp")}
          </button>
          <button type="button" className={css.tool} onClick={onDown} disabled={disableDown}>
            {t("moveDown")}
          </button>
          <button type="button" className={css.toolDanger} onClick={onRemove}>
            {t("remove")}
          </button>
        </div>
      ) : null}
      <TestTaskCard
        title={t("taskLabel", { n: index + 1 })}
        titleId={titleId}
        badge={t("levelBadge", { level: task.difficulty })}
        kicker={taskKicker(task.name, task.prompt)}
        heading="h3"
        prompt={task.prompt ? <TaskRichText text={task.prompt} imageAlt={imageAlt} /> : null}
        hint={
          <>
            <strong>{t("explanation")}</strong>
            {task.explanation ? (
              <TaskRichText text={task.explanation} imageAlt={imageAlt} />
            ) : (
              <span>{t("noExplanation")}</span>
            )}
          </>
        }
        result={
          correct
            ? t("correct", { letter: optionLetter(correct.number - 1) })
            : undefined
        }
      >
        {task.options.length > 0 ? (
          <ul className={clsx(cardCss.answers, stack && cardCss.answersSingleUntilMd)}>
            {task.options.map((option) => {
              const key = option.number === task.correctNumber;
              return (
                <li
                  key={option.number}
                  className={clsx(cardCss.option, cardCss.optionFrozen, key && cardCss.optionKey)}
                >
                  <span className={cardCss.mark}>{optionLetter(option.number - 1)}</span>
                  <span className={cardCss.optionText}>
                    <TaskRichText text={option.text} imageAlt={imageAlt} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </TestTaskCard>
    </div>
  );
}

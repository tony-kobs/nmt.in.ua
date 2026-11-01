"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { NmtMatchTask } from "@/components/testing/NmtMatchTask/NmtMatchTask";
import { TestTaskCard, taskKicker, topicOptionsStackUntilTablet } from "@/components/testing/TestTaskCard";
import cardCss from "@/components/testing/TestTaskCard/TestTaskCard.module.css";
import { MathText } from "@/components/ui/MathText";
import {
  bankTaskRenderPlan,
  taskImageSrc,
  type BankTaskView,
} from "@/modules/textbook/bankTask";
import css from "./BankTaskCard.module.css";

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

export function BankTaskCard({ view }: { view: BankTaskView }) {
  const t = useTranslations("TextbookEditor");
  const titleId = useId();
  const answerId = useId();
  const [open, setOpen] = useState(false);
  const imageAlt = t("taskImageAlt");
  const bankLabel =
    view.bank === "nmt" ? t("bankNmt") : view.bank === "problem" ? t("bankProblem") : t("bankQuiz");
  const stack = topicOptionsStackUntilTablet(view.options.map((option) => option.text));

  return (
    <TestTaskCard
      title={t("taskTitle")}
      titleId={titleId}
      badge={bankLabel}
      kicker={taskKicker(view.name, view.prompt)}
      heading="h3"
      prompt={
        <>
          {view.image ? (
            <NativeImage className={css.promptImage} src={view.image.src} alt={view.image.alt || imageAlt} />
          ) : null}
          {view.prompt ? <TaskRichText text={view.prompt} imageAlt={imageAlt} /> : null}
        </>
      }
    >
      {view.options.length > 0 ? (
        <ul className={clsx(cardCss.answers, stack && cardCss.answersSingleUntilMd)}>
          {view.options.map((option) => (
            <li
              key={option.letter}
              className={clsx(cardCss.option, cardCss.optionFrozen, open && option.correct && cardCss.optionKey)}
            >
              <span className={cardCss.mark}>{option.letter}</span>
              <span className={cardCss.optionText}>
                <TaskRichText text={option.text} imageAlt={imageAlt} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {view.match ? <NmtMatchTask match={view.match} imageAlt={imageAlt} /> : null}
      <button
        className={css.reveal}
        type="button"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? t("hideAnswer") : t("showAnswer")}
      </button>
      {open ? (
        <div id={answerId} className={css.answer}>
          <p>
            <strong>{t("answerLabel")}. </strong>
            {view.answer ? <MathText text={view.answer} /> : t("answerEmpty")}
          </p>
          {view.explanation ? (
            <p>
              <strong>{t("explanationLabel")}. </strong>
              <MathText text={view.explanation} />
            </p>
          ) : null}
        </div>
      ) : null}
    </TestTaskCard>
  );
}

export function BankTaskSlot({
  view,
  missingRef,
  mode,
}: {
  view?: BankTaskView;
  missingRef: string;
  mode: "student" | "admin";
}) {
  const t = useTranslations("TextbookEditor");
  const plan = bankTaskRenderPlan(view, mode);
  if (plan === "skip") return null;
  if (plan === "warn" || !view) {
    return <p className={css.missing}>{t("bankMissing", { ref: missingRef })}</p>;
  }
  return <BankTaskCard view={view} />;
}

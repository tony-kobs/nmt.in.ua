"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import { textbookTopicHref } from "@/content/learningMaterials/textbookHref";
import { MathText } from "@/components/ui/MathText";
import { NmtMatchTask } from "@/components/testing/NmtMatchTask/NmtMatchTask";
import { TestTaskCard, taskKicker } from "@/components/testing/TestTaskCard";
import css from "./TopicTrainerMistakeReview.module.css";

type TopicTrainerMistakeReviewProps = {
  mistakes: SessionMistakeItem[];
  title: string;
  /** When true, show textbook + topic-test links for each mapped theme. */
  showThemeLinks?: boolean;
};

function MistakeBody({
  text,
  className,
  imageAlt,
}: {
  text: string;
  className?: string;
  imageAlt: string;
}) {
  const parts = text.split(/!\[\]\(([^)]+)\)/g);
  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <span key={index} className={css.taskImageWrap}>
              <Image
                src={part}
                alt={imageAlt}
                width={604}
                height={340}
                className={css.taskImage}
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

export function TopicTrainerMistakeReview({
  mistakes,
  title,
  showThemeLinks = false,
}: TopicTrainerMistakeReviewProps) {
  const t = useTranslations("TopicTrainerSummary");

  if (mistakes.length === 0) return null;

  return (
    <section
      className={css.topicTrainerMistakeReview}
      aria-labelledby="mistake-review-title"
    >
      <h2 id="mistake-review-title" className={css.title}>
        {title}
      </h2>
      <ul className={css.list}>
        {mistakes.map((item, index) => (
          <li
            key={`${item.name}-${index}-${item.taskText.slice(0, 40)}`}
            className={css.item}
          >
            <TestTaskCard
              heading="h3"
              titleId={`mistake-task-${index}`}
              title={t("taskHeading", { number: index + 1 })}
              badge={item.themeName ?? undefined}
              kicker={taskKicker(item.name, item.taskText) ? <MathText text={item.name} /> : undefined}
              prompt={
                <MistakeBody
                  text={item.taskText}
                  imageAlt={t("taskImageAlt", { n: index + 1 })}
                />
              }
              hint={
                item.comment ? (
                  <MistakeBody
                    text={item.comment}
                    imageAlt={t("taskImageAlt", { n: index + 1 })}
                  />
                ) : undefined
              }
            >
            {item.match ? (
              <NmtMatchTask
                match={item.match}
                imageAlt={t("taskImageAlt", { n: index + 1 })}
              />
            ) : null}
            {showThemeLinks ? (
              item.themeId != null && item.themeName ? (
                <nav className={css.themeLinks} aria-label={item.themeName}>
                  <p className={css.themeLabel}>
                    {t("mistakeTheme", { theme: item.themeName })}
                  </p>
                  <div className={css.themeActions}>
                    {item.themeCode ? (
                      <Link
                        href={textbookTopicHref(item.themeCode)}
                        className={css.themeLink}
                      >
                        {t("mistakeMaterials")}
                      </Link>
                    ) : null}
                    <Link
                      href={`/?theme=${item.themeId}`}
                      className={css.themeLink}
                    >
                      {t("mistakePractice")}
                    </Link>
                  </div>
                </nav>
              ) : (
                <p className={css.themeMissing}>{t("mistakeThemeUnknown")}</p>
              )
            ) : null}
            </TestTaskCard>
          </li>
        ))}
      </ul>
    </section>
  );
}

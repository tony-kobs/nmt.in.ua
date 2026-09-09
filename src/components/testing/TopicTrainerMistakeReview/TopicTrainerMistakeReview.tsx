"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import { textbookTopicHref } from "@/content/learningMaterials/textbookHref";
import { MathText } from "@/components/ui/MathText";
import css from "./TopicTrainerMistakeReview.module.css";

type TopicTrainerMistakeReviewProps = {
  mistakes: SessionMistakeItem[];
  title: string;
  /** When true, show textbook + topic-test links for each mapped theme. */
  showThemeLinks?: boolean;
};

function MistakeBody({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/!\[\]\(([^)]+)\)/g);
  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <span key={index} className={css.taskImageWrap}>
              <Image
                src={part}
                alt=""
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
            <p className={css.itemName}>{item.name}</p>
            <MistakeBody text={item.taskText} className={css.itemText} />
            {item.comment ? (
              <MistakeBody text={item.comment} className={css.comment} />
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
          </li>
        ))}
      </ul>
    </section>
  );
}

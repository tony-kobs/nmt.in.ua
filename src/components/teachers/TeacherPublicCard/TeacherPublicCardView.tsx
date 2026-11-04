"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/account/UserAvatar";
import type { PublicTeacherCard } from "@/modules/teachers";
import type { TeacherLevel, TeachingLanguage } from "@/modules/teachers/types";
import css from "./TeacherPublicCard.module.css";

type TeacherPublicCardViewProps = {
  card: PublicTeacherCard;
  showCta?: boolean;
  ctaLabel?: string;
  onCtaClick?: () => void;
  extraContent?: ReactNode;
};

export function TeacherPublicCardView({
  card,
  showCta = true,
  ctaLabel,
  onCtaClick,
  extraContent,
}: TeacherPublicCardViewProps) {
  const t = useTranslations("TeacherPublicCard");

  const levelLabels: Record<TeacherLevel, string> = {
    grades_5_9: t("levels.grades_5_9"),
    grades_10_11: t("levels.grades_10_11"),
    nmt: t("levels.nmt"),
    adult: t("levels.adult"),
  };

  const languageLabels: Record<TeachingLanguage, string> = {
    uk: t("languages.uk"),
    en: t("languages.en"),
    de: t("languages.de"),
    pl: t("languages.pl"),
  };

  const hasPrice =
    card.lessonPrice !== null &&
    card.lessonPrice !== undefined &&
    Boolean(card.lessonCurrency);

  const hasDuration =
    card.lessonDurationMinutes !== null &&
    card.lessonDurationMinutes !== undefined;

  const bio = card.bio.trim();
  const headline = card.headline?.trim() ?? "";
  const headlineIsBio =
    Boolean(headline) &&
    Boolean(bio) &&
    (bio.startsWith(headline) || (headline.length >= 140 && bio.startsWith(headline.slice(0, 140))));
  const hasDetails = Boolean(card.publications || card.contactUrl);

  return (
    <article
      className={css.card}
      aria-labelledby={`teacher-public-name-${card.userId}`}
    >
      <div className={css.avatarColumn}>
        <UserAvatar
          user={{
            id: card.userId,
            login: card.login,
            displayName: card.displayName,
            role: card.role,
            avatarRev: card.avatarRev,
          }}
          className={css.avatar}
        />
      </div>

      <div className={css.content}>
        <div className={css.header}>
          <div className={css.identity}>
            <p className={css.subjectsLabel}>
              {card.subjects.length > 0
                ? card.subjects.join(" · ")
                : t("kicker")}
            </p>

            <p id={`teacher-public-name-${card.userId}`} className={css.name}>
              {card.displayName}
            </p>

            {card.city || card.country ? (
              <p className={css.location}>
                {[card.city, card.country].filter(Boolean).join(", ")}
              </p>
            ) : null}
          </div>

          {hasPrice || hasDuration ? (
            <div className={css.lessonMeta}>
              {hasPrice ? (
                <span className={css.price}>
                  {card.lessonPrice} {card.lessonCurrency}
                </span>
              ) : null}

              {hasPrice && hasDuration ? (
                <span className={css.metaSeparator} aria-hidden="true">
                  ·
                </span>
              ) : null}

              {hasDuration ? (
                <span className={css.duration}>
                  {card.lessonDurationMinutes} {t("minutes")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {headline && !headlineIsBio ? <p className={css.headline}>{headline}</p> : null}
        {bio ? <p className={css.bio}>{bio}</p> : null}

        <div className={css.summary}>
          {card.teachingLanguages.length > 0 ? (
            <p className={css.infoRow}>
              <span className={css.infoTitle}>{t("teachingLanguages")}:</span>
              <span>
                {card.teachingLanguages
                  .map((language) => languageLabels[language])
                  .join(", ")}
              </span>
            </p>
          ) : null}

          {card.experience ? (
            <p className={css.infoRow}>
              <span className={css.infoTitle}>{t("experience")}:</span>
              <span>{card.experience}</span>
            </p>
          ) : null}
        </div>

        {card.teachingLevels.length > 0 ? (
          <div className={css.levelsBlock}>
            <p className={css.levelsTitle}>{t("teachingLevels")}</p>

            <ul className={css.levels}>
              {card.teachingLevels.map((level) => (
                <li key={level} className={css.level}>
                  {levelLabels[level]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {extraContent}
        <div className={css.actionsRow}>
          {hasDetails ? (
            <details className={css.details}>
              <summary className={css.detailsSummary}>
                <span className={css.detailsMore}>{t("readMore")}</span>
                <span className={css.detailsLess}>{t("showLess")}</span>
              </summary>

              <div className={css.detailsContent}>
                {card.publications ? (
                  <section className={css.detailSection}>
                    <h2 className={css.detailTitle}>{t("publications")}</h2>
                    <p className={css.detailText}>{card.publications}</p>
                  </section>
                ) : null}

                {card.contactUrl ? (
                  <a
                    className={css.profileLink}
                    href={card.contactUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("professionalLink")}
                  </a>
                ) : null}
              </div>
            </details>
          ) : null}

          {showCta ? (
            <button className={css.cta} type="button" onClick={onCtaClick}>
              {ctaLabel ?? t("ctaPlaceholder")}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

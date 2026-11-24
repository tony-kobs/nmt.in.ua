"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/account/UserAvatar";
import type { PublicTeacherCard } from "@/modules/teachers";
import type { TeacherLevel, TeachingLanguage } from "@/modules/teachers/types";
import css from "./TeacherPublicCard.module.css";

type TeacherPublicCardViewProps = {
  card: PublicTeacherCard;
  showCta?: boolean;
  /** Page layout adds the landing sections and the sign-up link. */
  layout?: "card" | "page";
  /** `h1` only on the public teacher page, so lists keep a single page heading. */
  heading?: "h1" | "p";
  ctaLabel?: string;
  onCtaClick?: () => void;
  extraContent?: ReactNode;
};

export function TeacherPublicCardView({
  card,
  showCta = true,
  layout = "card",
  heading = "p",
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
        {layout === "page" && card.photoUrl ? (
          // A teacher can paste any https host. next/image would refuse it without a remote pattern.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={css.photo}
            src={card.photoUrl}
            alt={card.displayName}
            width={640}
            height={480}
          />
        ) : (
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
        )}
      </div>

      <div className={css.content}>
        <div className={css.header}>
          <div className={css.identity}>
            <p className={css.subjectsLabel}>
              {card.subjects.length > 0
                ? card.subjects.join(" · ")
                : t("kicker")}
            </p>

            {layout === "page" && heading === "h1" ? (
              <h1 id={`teacher-public-name-${card.userId}`} className={css.name}>
                {card.displayName}
              </h1>
            ) : (
              <p id={`teacher-public-name-${card.userId}`} className={css.name}>
                {card.displayName}
              </p>
            )}

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
        {layout === "page" && card.about ? (
          <section className={css.landingSection} aria-labelledby={`teacher-about-${card.userId}`}>
            <h2 id={`teacher-about-${card.userId}`} className={css.detailTitle}>{t("about")}</h2>
            <p className={css.detailText}>{card.about}</p>
          </section>
        ) : null}
        {layout === "page" && card.approach ? (
          <section className={css.landingSection} aria-labelledby={`teacher-approach-${card.userId}`}>
            <h2 id={`teacher-approach-${card.userId}`} className={css.detailTitle}>{t("approach")}</h2>
            <p className={css.detailText}>{card.approach}</p>
          </section>
        ) : null}
        {layout === "page" && card.program ? (
          <section className={css.landingSection} aria-labelledby={`teacher-program-${card.userId}`}>
            <h2 id={`teacher-program-${card.userId}`} className={css.detailTitle}>{t("program")}</h2>
            <p className={css.detailText}>{card.program}</p>
          </section>
        ) : null}
        {layout === "page" && card.reviews.length > 0 ? (
          <section className={css.landingSection} aria-labelledby={`teacher-reviews-${card.userId}`}>
            <h2 id={`teacher-reviews-${card.userId}`} className={css.detailTitle}>{t("reviews")}</h2>
            <ul className={css.reviews}>
              {card.reviews.map((review) => (
                <li key={`${review.name}-${review.text}`} className={css.review}>
                  <p className={css.detailText}>{review.text}</p>
                  <p className={css.reviewName}>{review.name}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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

          {layout === "page" && card.externalUrl ? (
            <a className={css.ownSite} href={card.externalUrl} target="_blank" rel="noopener noreferrer">
              {t("ownSite")}
            </a>
          ) : null}
          {showCta && layout === "page" ? (
            <Link className={css.cta} href={`/register?ref=${encodeURIComponent(card.slug)}`}>
              {t("signup")}
            </Link>
          ) : null}
          {showCta && layout !== "page" ? (
            <button className={css.cta} type="button" onClick={onCtaClick}>
              {ctaLabel ?? t("ctaPlaceholder")}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

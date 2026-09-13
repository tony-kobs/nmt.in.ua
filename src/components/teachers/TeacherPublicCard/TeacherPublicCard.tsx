import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/dashboard/LanguageSwitcher/LanguageSwitcher";
import { UserAvatar } from "@/components/account/UserAvatar";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/constants/seo";
import type { PublicTeacherCard } from "@/modules/teachers";
import { teacherPublicPath } from "@/modules/teachers";
import css from "./TeacherPublicCard.module.css";

type TeacherPublicCardProps = {
  card: PublicTeacherCard;
};

export async function TeacherPublicCard({ card }: TeacherPublicCardProps) {
  const t = await getTranslations("TeacherPublicCard");
  const path = teacherPublicPath(card.slug);

  const personLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: card.displayName,
    url: absoluteUrl(path),
  };
  if (card.headline) personLd.jobTitle = card.headline;
  if (card.bio) personLd.description = card.bio;
  if (card.city) {
    personLd.address = {
      "@type": "PostalAddress",
      addressLocality: card.city,
    };
  }
  if (card.contactUrl) personLd.sameAs = [card.contactUrl];

  return (
    <article className={css.card} aria-labelledby="teacher-public-name">
      <JsonLd data={personLd} />
      <div className={css.top}>
        <p className={css.kicker}>{t("kicker")}</p>
        <LanguageSwitcher />
      </div>

      <div className={css.identity}>
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
        <div className={css.identityCopy}>
          <h1 id="teacher-public-name" className={css.name}>
            {card.displayName}
          </h1>
          {card.headline ? <p className={css.headline}>{card.headline}</p> : null}
        </div>
      </div>

      {card.bio ? <p className={css.bio}>{card.bio}</p> : null}

      {card.city || card.subjects.length > 0 ? (
        <dl className={css.meta}>
          {card.city ? (
            <div>
              <dt>{t("city")}</dt>
              <dd>{card.city}</dd>
            </div>
          ) : null}
          {card.subjects.length > 0 ? (
            <div>
              <dt>{t("subjects")}</dt>
              <dd>
                <ul className={css.chips}>
                  {card.subjects.map((subject) => (
                    <li key={subject} className={css.chip}>
                      {subject}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {card.contactUrl ? (
        <a
          className={css.contact}
          href={card.contactUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("contact")}
        </a>
      ) : null}
    </article>
  );
}

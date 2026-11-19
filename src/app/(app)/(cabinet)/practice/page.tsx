
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { requireSessionUserId } from "@/modules/auth/getCurrentUser";
import css from "./page.module.css";

export default async function PracticePage() {
  await requireSessionUserId();

  const t = await getTranslations("PracticeCatalog");

  const exercises = [
    {
      href: "/practice/fractions",
      title: t("fractions.title"),
      description: t("fractions.description"),
    },
    {
      href: "/practice/interactive",
      title: t("interactive.title"),
      description: t("interactive.description"),
    },
    {
      href: "/practice/multiplication",
      title: t("multiplication.title"),
      description: t("multiplication.description"),
    },
  ];

  return (
    <PageFrame
      kicker={t("kicker")}
      title={t("title")}
      lead={t("lead")}
    >
      <PagePanel className={css.panel}>
        <div className={css.grid}>
          {exercises.map((exercise, index) => (
            <Link
              key={exercise.href}
              href={exercise.href}
              className={css.card}
            >
              <span className={css.number}>
                {String(index + 1).padStart(2, "0")}
              </span>

              <div className={css.cardContent}>
                <h2 className={css.cardTitle}>{exercise.title}</h2>
                <p className={css.cardDescription}>
                  {exercise.description}
                </p>
              </div>

              <span className={css.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      </PagePanel>
    </PageFrame>
  );
}

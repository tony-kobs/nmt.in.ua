import type { Metadata } from "next";
import Link from "next/link";
import { MaterialDocument } from "@/components/learningMaterials/MaterialDocument";
import { getTextbookBlocks } from "@/content/learningMaterials";
import { getThemes } from "@/modules/themes/getThemes";
import css from "./page.module.css";

export const metadata: Metadata = {
  title: "Підручник",
  description:
    "Загальний підручник з математики зі змістом, теорією та формулами.",
};

export default async function TextbookPage() {
  const themes = await getThemes();

  return (
    <article className={css.page}>
      <Link href="/materials" className={css.backLink}>
        ← Усі навчальні матеріали
      </Link>

      <header className={css.header}>
        <p className={css.kicker}>Навчальні матеріали</p>
        <h1 className={css.title}>Підручник</h1>
        <p className={css.lead}>
          Обирай тему у змісті, щоб перейти безпосередньо до потрібного
          розділу.
        </p>
      </header>

      <div className={css.layout}>
        <nav className={css.contents} aria-labelledby="textbook-contents-title">
          <h2 id="textbook-contents-title" className={css.contentsTitle}>
            Зміст
          </h2>

          <ol className={css.contentsList}>
            {themes.map((theme) => (
              <li key={theme.id}>
                <Link href={`#topic-${theme.code}`}>{theme.name}</Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className={css.sections}>
          {themes.map((theme) => {
            const blocks = getTextbookBlocks(theme.code);
            const titleId = `topic-title-${theme.code}`;

            return (
              <section
                key={theme.id}
                id={`topic-${theme.code}`}
                className={css.topic}
                aria-labelledby={titleId}
              >
                <h2 id={titleId} className={css.topicTitle}>
                  {theme.name}
                </h2>

                {theme.description ? (
                  <p className={css.topicDescription}>{theme.description}</p>
                ) : null}

                {blocks.length > 0 ? (
                  <div className={css.topicBody}>
                    <MaterialDocument blocks={blocks} />
                  </div>
                ) : (
                  <p className={css.emptyMessage}>Матеріал готується</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </article>
  );
}
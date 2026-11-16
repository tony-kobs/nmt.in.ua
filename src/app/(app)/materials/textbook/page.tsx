import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MaterialDocument } from "@/components/learningMaterials/MaterialDocument";
import { TextbookHashRedirect } from "@/components/learningMaterials/TextbookHashRedirect";
import { bankTaskRefsInBlocks } from "@/modules/textbook/bankTask";
import { loadBankTaskViews } from "@/modules/textbook/bankTaskStore";
import { getPublishedTextbookBlocks } from "@/modules/textbook/store";
import {
  pickTextbookTopic,
  readTextbookTopicParam,
  textbookTopicMeta,
} from "@/modules/textbook/topicPage";
import { textbookTopicHref } from "@/content/learningMaterials/textbookHref";
import { createPageMetadata } from "@/constants/seo";
import { getThemes } from "@/modules/themes/getThemes";
import css from "./page.module.css";

type TextbookPageProps = {
  searchParams: Promise<{ topic?: string | string[] }>;
};

export async function generateMetadata({ searchParams }: TextbookPageProps) {
  const query = await searchParams;
  const themes = await getThemes();
  const pick = pickTextbookTopic(themes, readTextbookTopicParam(query.topic));
  if (pick.status === "missing") notFound();
  const t = await getTranslations("Metadata.materials");
  const theme = pick.status === "ready" ? pick.active : null;
  return createPageMetadata(
    textbookTopicMeta(theme, {
      title: t("title"),
      description: t("description"),
      namedDescription: theme
        ? t("topicDescription", { topic: theme.name.trim() || theme.code })
        : t("description"),
    }),
  );
}

export default async function TextbookPage({ searchParams }: TextbookPageProps) {
  const query = await searchParams;
  const themes = await getThemes();
  const pick = pickTextbookTopic(themes, readTextbookTopicParam(query.topic));
  if (pick.status === "missing") notFound();
  const active = pick.status === "ready" ? pick.active : null;
  const activeIndex = pick.status === "ready" ? pick.index : -1;
  const prev = pick.status === "ready" ? pick.prev : null;
  const next = pick.status === "ready" ? pick.next : null;

  const blocks = active ? await getPublishedTextbookBlocks(active.code) : [];
  const bankLoad = await loadBankTaskViews(bankTaskRefsInBlocks(blocks));
  const bankTasks = bankLoad.ok ? bankLoad.tasks : {};
  const titleId = active ? `topic-title-${active.code}` : "topic-title";

  return (
    <article className={css.page}>
      <TextbookHashRedirect />

      <header className={css.header}>
        <p className={css.kicker}>Теорія за темами</p>
        <h1 className={css.title}>Підручник</h1>
        <p className={css.lead}>
          Обирай тему у змісті праворуч — завантажується лише один розділ.
        </p>
      </header>

      <div className={css.layout}>
        <div className={css.sections}>
          {active ? (
            <section
              id={`topic-${active.code}`}
              className={css.topic}
              aria-labelledby={titleId}
            >
              <h2 id={titleId} className={css.topicTitle}>
                {active.name}
              </h2>

              {active.description ? (
                <p className={css.topicDescription}>{active.description}</p>
              ) : null}

              {blocks.length > 0 ? (
                <div className={css.topicBody}>
                  <MaterialDocument blocks={blocks} bankTasks={bankTasks} bankMode="student" />
                </div>
              ) : (
                <p className={css.emptyMessage}>Матеріал готується</p>
              )}
            </section>
          ) : (
            <p className={css.emptyMessage}>Теми ще не завантажено.</p>
          )}

          {active && (prev || next) ? (
            <nav className={css.pager} aria-label="Навігація розділами">
              {prev ? (
                <Link
                  href={textbookTopicHref(prev.code)}
                  className={css.pagerLink}
                >
                  ← {prev.name}
                </Link>
              ) : (
                <span className={css.pagerPlaceholder} />
              )}
              <p className={css.pagerStatus}>
                {activeIndex + 1} / {themes.length}
              </p>
              {next ? (
                <Link
                  href={textbookTopicHref(next.code)}
                  className={`${css.pagerLink} ${css.pagerNext}`}
                >
                  {next.name} →
                </Link>
              ) : (
                <span className={css.pagerPlaceholder} />
              )}
            </nav>
          ) : null}
        </div>

        <nav className={css.contents} aria-labelledby="textbook-contents-title">
          <h2 id="textbook-contents-title" className={css.contentsTitle}>
            Зміст
          </h2>

          <ol className={css.contentsList}>
            {themes.map((theme) => {
              const isActive = theme.code === active?.code;
              return (
                <li key={theme.id}>
                  <Link
                    href={textbookTopicHref(theme.code)}
                    className={isActive ? css.contentsActive : undefined}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {theme.name}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </article>
  );
}

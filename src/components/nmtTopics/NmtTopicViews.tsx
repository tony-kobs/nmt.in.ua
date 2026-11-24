import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MathText } from "@/components/ui/MathText/MathText";
import { TaskVisualArea } from "@/components/testing/TaskVisualArea";
import { TestTaskCard } from "@/components/testing/TestTaskCard";
import { resolveTaskPresentation } from "@/modules/testing/taskPresentation";
import { topicCtaHref } from "@/modules/nmtTopics/catalog";
import type { PublicTopicCard } from "@/modules/nmtTopics/pageModel";
import type { PublicTopicPage } from "@/modules/nmtTopics/loadTopicPage";
import type { PublicSampleTask } from "@/modules/nmtTopics/samples";
import css from "./NmtTopics.module.css";

export async function NmtTopicIndexView({ topics }: { topics: readonly PublicTopicCard[] }) {
  const t = await getTranslations("NmtTopics");
  return (
    <div className={css.page}>
      <p className={css.kicker}>{t("indexKicker")}</p>
      <h1 className={css.title}>{t("indexTitle")}</h1>
      <p className={css.lead}>{t("indexLead")}</p>
      <ul className={css.grid}>
        {topics.map((topic) => (
          <li key={topic.slug}>
            <Link className={css.card} href={topic.path}>
              <h2 className={css.cardTitle}>{topic.title}</h2>
              {topic.taskCount != null ? (
                <p className={css.cardMeta}>{t("taskCount", { count: topic.taskCount })}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SampleCard({ task, title }: { task: PublicSampleTask; title: string }) {
  const presentation = resolveTaskPresentation({ taskText: task.prompt });
  return (
    <TestTaskCard
      heading="h3"
      titleId={`sample-${task.id}`}
      title={title}
      prompt={
        <>
          <TaskVisualArea visual={presentation.visual} />
          {presentation.displayText ? <MathText text={presentation.displayText} as="div" /> : null}
        </>
      }
    >
      {task.kind === "match" && task.match ? <MatchBlock task={task} /> : null}
      {task.kind === "mcq" && task.options.length > 0 ? (
        <ul className={css.options}>
          {task.options.map((option) => (
            <li key={option.letter} className={css.option}>
              <span className={css.letter}>{option.letter}</span>
              <MathText text={option.text} />
            </li>
          ))}
        </ul>
      ) : null}
    </TestTaskCard>
  );
}

function MatchBlock({ task }: { task: PublicSampleTask }) {
  const match = task.match;
  if (!match) return null;
  return (
    <div className={css.match}>
      <div>
        {match.leftTitle ? <p className={css.matchTitle}>{match.leftTitle}</p> : null}
        <ol className={css.matchList}>
          {match.left.map((text, index) =>
            text.trim() ? (
              <li key={index} className={css.option}>
                <span className={css.letter}>{index + 1}</span>
                <MathText text={text} />
              </li>
            ) : null,
          )}
        </ol>
      </div>
      <div>
        {match.rightTitle ? <p className={css.matchTitle}>{match.rightTitle}</p> : null}
        <ul className={css.matchList}>
          {match.right.map((option) =>
            option.text.trim() ? (
              <li key={option.label} className={css.option}>
                <span className={css.letter}>{option.label}</span>
                <MathText text={option.text} />
              </li>
            ) : null,
          )}
        </ul>
      </div>
    </div>
  );
}

export async function NmtTopicArticle({
  page,
  loggedIn,
}: {
  page: PublicTopicPage;
  loggedIn: boolean;
}) {
  const t = await getTranslations("NmtTopics");
  const intro = page.intro;
  return (
    <article className={css.page}>
      <p className={css.kicker}>{t("topicKicker")}</p>
      <h1 className={css.title}>{page.title}</h1>
      {intro.kind === "text" ? (
        <p className={css.intro}>
          <MathText text={intro.text} />
        </p>
      ) : intro.taskCount == null && intro.levels.length === 0 ? (
        <p className={css.intro}>{t("countLeadUnknown", { name: page.title })}</p>
      ) : (
        <>
          {intro.taskCount != null ? (
            <p className={css.intro}>{t("countLead", { name: page.title, count: intro.taskCount })}</p>
          ) : null}
          {intro.levels.length > 0 ? (
            <p className={css.levels}>{t("levels", { levels: intro.levels.join(", ") })}</p>
          ) : null}
        </>
      )}
      <section className={css.samples} aria-labelledby="nmt-samples">
        <h2 id="nmt-samples" className={css.samplesTitle}>
          {t("samplesTitle")}
        </h2>
        {page.samples.length === 0 ? <p className={css.empty}>{t("samplesEmpty")}</p> : null}
        {page.samples.map((task, index) => (
          <div key={task.id}>
            <SampleCard task={task} title={t("taskTitle", { n: index + 1 })} />
            <p className={css.source}>
              {task.sourceUrl ? (
                <a href={task.sourceUrl} rel="noopener noreferrer">
                  {t("source", { label: task.sourceLabel })}
                </a>
              ) : (
                t("source", { label: task.sourceLabel })
              )}
            </p>
            {task.kind === "open" ? <p className={css.note}>{t("openNote")}</p> : null}
          </div>
        ))}
      </section>
      <Link className={css.cta} href={topicCtaHref(page.themeId, loggedIn)}>
        {t("cta")}
      </Link>
    </article>
  );
}

import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { MathText } from "@/components/ui/MathText/MathText";
import { TestTaskCard, optionLetter } from "@/components/testing/TestTaskCard";
import cardCss from "@/components/testing/TestTaskCard/TestTaskCard.module.css";
import {
  markMaterialsAction,
  submitDayAction,
} from "@/modules/marathons/daily/actions";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
import { durationLocale, formatMarathonDuration } from "@/modules/marathons/daily/durationText";
import { loomEmbedSrc, renderSafeMarkdown, youtubeEmbedSrc } from "@/modules/marathons/daily/richText";
import type { PendingPlayTask, ReviewedPlayTask } from "@/modules/marathons/daily/playTasks";
import type { DailyMarathon, DayProgress, MarathonDay, Material } from "@/modules/marathons/daily/store";
import { SavedToast } from "./SavedToast";
import { marathonErrorText } from "./errors";
import css from "./marathon.module.css";

type MarathonDayViewProps = {
  marathon: DailyMarathon;
  day: MarathonDay;
  materials: Material[];
  tasks: PendingPlayTask[];
  review: ReviewedPlayTask[];
  progress: DayProgress | undefined;
  totalSeconds: number | null;
  lockedUntil: Date | null;
  locale: string;
  reviewIntro: string;
  rankNote: string | null;
  error?: string;
  saved?: boolean;
};

export async function MarathonDayView(props: MarathonDayViewProps) {
  const t = await getTranslations("Marathon");
  const uiLocale = durationLocale(await getLocale());
  const { marathon, day, materials, tasks, review, progress, totalSeconds, lockedUntil, locale, reviewIntro, rankNote, error, saved = false } = props;
  const dayTime = progress?.durationSeconds == null
    ? null
    : formatMarathonDuration(progress.durationSeconds, uiLocale);
  const totalTime = totalSeconds == null ? null : formatMarathonDuration(totalSeconds, uiLocale);
  const submitted = progress?.completedAt != null;
  const message = marathonErrorText(t, error);
  return (
    <div className={css.narrow}>
      <SavedToast active={saved} text={t("saved")} />
      <PageFrame
        kicker={t("dayLabel", { n: day.dayNumber })}
        title={day.topic}
        lead={day.introText ?? undefined}
      >
        <div className={css.stack}>
          {message ? <p className={css.alert} role="alert">{message}</p> : null}
          {lockedUntil ? (
            <p className={css.alert}>
              {t("opensAt", { when: formatKyivWhen(lockedUntil, locale) })}
            </p>
          ) : (
            <>
              <section className={css.stack} aria-labelledby="day-materials">
                <h2 id="day-materials">{t("materialsTitle")}</h2>
                {day.imageUrl ? (
                  <Image className={css.shot} src={day.imageUrl} alt={day.topic} width={1200} height={800} unoptimized />
                ) : null}
                {materials.map((material) => (
                  <MaterialBlock key={material.id} material={material} title={day.topic} />
                ))}
                {!progress?.materialsViewed ? (
                  <form action={markMaterialsAction}>
                    <input type="hidden" name="slug" value={marathon.slug} />
                    <input type="hidden" name="day" value={day.dayNumber} />
                    <button type="submit" className={css.button}>{t("toTasks")}</button>
                  </form>
                ) : null}
              </section>
              {progress?.materialsViewed ? (
                <section className={css.stack} aria-labelledby="day-tasks">
                  <h2 id="day-tasks">{t("tasksTitle")}</h2>
                  {submitted ? (
                    <p className={css.alert} role="status">
                      {progress.passed
                        ? t("markPassed", { score: progress.score ?? 0 })
                        : t("markFailed", { score: progress.score ?? 0 })}
                    </p>
                  ) : null}
                  {submitted ? (
                    <p className={css.meta}>
                      {dayTime ? t("dayTime", { time: dayTime }) : t("dayTimeUnknown")}
                      {" · "}
                      {totalTime ? t("totalTime", { time: totalTime }) : t("totalTimeUnknown")}
                    </p>
                  ) : null}
                  {submitted && rankNote ? (
                    <p className={css.rankNote} role="status">{rankNote}</p>
                  ) : null}
                  {submitted ? (
                    <div className={css.stack}>
                      {reviewIntro ? <p className={css.lead}>{reviewIntro}</p> : null}
                      {review.map((task, index) => (
                        <TestTaskCard
                          key={task.id}
                          heading="h3"
                          titleId={`day-review-${task.id}`}
                          title={t("taskHeading", { number: index + 1 })}
                          badge={day.topic}
                          prompt={<MathText text={task.prompt} as="div" />}
                          hint={
                            task.explanation ? (
                              <MathText text={task.explanation} as="span" />
                            ) : task.choice == null ? (
                              t("choiceMissing")
                            ) : undefined
                          }
                          result={
                            task.options[task.correct - 1] ? (
                              <MathText text={task.options[task.correct - 1]} as="span" />
                            ) : task.right ? (
                              t("taskRight")
                            ) : (
                              t("taskWrong")
                            )
                          }
                        >
                          <ol className={cardCss.answers}>
                            {task.options.map((option, optionIndex) => {
                              const number = optionIndex + 1;
                              const chosen = task.choice === number;
                              const key = task.correct === number;
                              const tone = chosen
                                ? task.right
                                  ? cardCss.optionCorrect
                                  : cardCss.optionWrong
                                : key
                                  ? cardCss.optionKey
                                  : "";
                              return (
                                <li key={`${task.id}-${optionIndex}`} className={`${cardCss.option} ${cardCss.optionFrozen} ${tone}`}>
                                  <span className={cardCss.mark}>{optionLetter(optionIndex)})</span>
                                  <span className={cardCss.optionText}>
                                    <MathText text={option} as="span" />
                                  </span>
                                  {chosen ? (
                                    <span className={css.reviewNote}>{t("yourChoice")}</span>
                                  ) : null}
                                  {key && !chosen ? (
                                    <span className={css.reviewNote}>{t("correctMark")}</span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ol>
                        </TestTaskCard>
                      ))}
                    </div>
                  ) : (
                    <form action={submitDayAction} className={css.stack}>
                      <input type="hidden" name="slug" value={marathon.slug} />
                      <input type="hidden" name="day" value={day.dayNumber} />
                      {tasks.map((task, index) => (
                        <TestTaskCard
                          key={task.id}
                          as="fieldset"
                          titleId={`day-task-${task.id}`}
                          title={t("taskHeading", { number: index + 1 })}
                          badge={day.topic}
                          prompt={<MathText text={task.prompt} as="div" />}
                        >
                          <div className={cardCss.answers}>
                            {task.options.map((option, optionIndex) => (
                              <label key={`${task.id}-${optionIndex}`} className={cardCss.option}>
                                <input
                                  className="visually-hidden"
                                  type="radio"
                                  name={`task_${task.id}`}
                                  value={optionIndex + 1}
                                  defaultChecked={progress?.answers[task.id] === optionIndex + 1}
                                  required
                                />
                                <span className={cardCss.mark}>{optionLetter(optionIndex)})</span>
                                <span className={cardCss.optionText}>
                                  <MathText text={option} as="span" />
                                </span>
                              </label>
                            ))}
                          </div>
                        </TestTaskCard>
                      ))}
                      <button type="submit" className={css.button}>{t("submit")}</button>
                    </form>
                  )}
                </section>
              ) : null}
            </>
          )}
          <Link href={`/marathon/${marathon.slug}/map`} className={css.buttonQuiet}>
            {t("backToMap")}
          </Link>
        </div>
      </PageFrame>
    </div>
  );
}

function MaterialBlock({ material, title }: { material: Material; title: string }) {
  if (material.type === "text") {
    return (
      <div
        className={`${css.card} ${css.prose}`}
        dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(material.urlOrBody) }}
      />
    );
  }
  const src = material.type === "youtube"
    ? youtubeEmbedSrc(material.urlOrBody)
    : loomEmbedSrc(material.urlOrBody);
  if (!src) return null;
  return (
    <div className={css.embed}>
      <iframe
        src={src}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

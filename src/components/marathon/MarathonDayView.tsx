import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { MathText } from "@/components/ui/MathText/MathText";
import {
  markMaterialsAction,
  submitDayAction,
} from "@/modules/marathons/daily/actions";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
import { loomEmbedSrc, renderSafeMarkdown, youtubeEmbedSrc } from "@/modules/marathons/daily/richText";
import type { PendingPlayTask, ReviewedPlayTask } from "@/modules/marathons/daily/playTasks";
import type { BoardLine } from "@/modules/marathons/daily/leaderboard";
import type { DailyMarathon, DayProgress, MarathonDay, Material } from "@/modules/marathons/daily/store";
import { MarathonBoard } from "./MarathonBoard";
import { marathonErrorText } from "./errors";
import css from "./marathon.module.css";

type MarathonDayViewProps = {
  marathon: DailyMarathon;
  day: MarathonDay;
  materials: Material[];
  tasks: PendingPlayTask[];
  review: ReviewedPlayTask[];
  progress: DayProgress | undefined;
  lockedUntil: Date | null;
  locale: string;
  reviewIntro: string;
  rankNote: string | null;
  board: BoardLine[];
  selfId: number;
  error?: string;
};

export async function MarathonDayView(props: MarathonDayViewProps) {
  const t = await getTranslations("Marathon");
  const { marathon, day, materials, tasks, review, progress, lockedUntil, locale, reviewIntro, rankNote, board, selfId, error } = props;
  const submitted = progress?.completedAt != null;
  const message = marathonErrorText(t, error);
  return (
    <div className={css.narrow}>
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
                  {submitted && rankNote ? (
                    <p className={css.rankNote} role="status">{rankNote}</p>
                  ) : null}
                  {submitted ? (
                    <div className={css.stack}>
                      {reviewIntro ? <p className={css.lead}>{reviewIntro}</p> : null}
                      {review.map((task, index) => (
                        <article key={task.id} className={css.card}>
                          <h3>
                            {index + 1}. <MathText text={task.prompt} as="span" />
                          </h3>
                          <p className={task.right ? css.reviewRight : css.reviewWrong}>
                            {task.right ? t("taskRight") : t("taskWrong")}
                          </p>
                          {task.choice == null ? (
                            <p className={css.meta}>{t("choiceMissing")}</p>
                          ) : null}
                          <ol className={css.options}>
                            {task.options.map((option, optionIndex) => {
                              const number = optionIndex + 1;
                              const chosen = task.choice === number;
                              const key = task.correct === number;
                              return (
                                <li
                                  key={`${task.id}-${optionIndex}`}
                                  className={
                                    chosen
                                      ? task.right
                                        ? css.optionRight
                                        : css.optionWrong
                                      : key
                                        ? css.optionKey
                                        : css.optionStatic
                                  }
                                >
                                  <MathText text={option} as="span" />
                                  {chosen ? (
                                    <span className={css.reviewNote}>{t("yourChoice")}</span>
                                  ) : null}
                                  {key ? (
                                    <span className={css.reviewNote}>{t("correctMark")}</span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ol>
                          {task.explanation ? (
                            <div className={css.prose}>
                              <p className={css.reviewNote}>{t("explanation")}</p>
                              <MathText text={task.explanation} as="div" />
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <form action={submitDayAction} className={css.stack}>
                      <input type="hidden" name="slug" value={marathon.slug} />
                      <input type="hidden" name="day" value={day.dayNumber} />
                      {tasks.map((task, index) => (
                        <fieldset key={task.id} className={css.card}>
                          <legend>
                            {index + 1}. <MathText text={task.prompt} as="span" />
                          </legend>
                          <div className={css.options}>
                            {task.options.map((option, optionIndex) => (
                              <label key={`${task.id}-${optionIndex}`} className={css.option}>
                                <input
                                  type="radio"
                                  name={`task_${task.id}`}
                                  value={optionIndex + 1}
                                  defaultChecked={progress?.answers[task.id] === optionIndex + 1}
                                  required
                                />
                                <MathText text={option} as="span" />
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                      <button type="submit" className={css.button}>{t("submit")}</button>
                    </form>
                  )}
                </section>
              ) : null}
            </>
          )}
          <MarathonBoard rows={board} selfId={selfId} titleId="day-board" />
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

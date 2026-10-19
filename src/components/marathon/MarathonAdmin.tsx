import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { kyivDateIso } from "@/modules/marathons/daily/calendar";
import { activationBlockers, marathonIsReady } from "@/modules/marathons/daily/readiness";
import { loadMarathonBoard, loadMarathonCopy } from "@/modules/marathons/daily/store";
import {
  deleteDayAction,
  deleteMarathonAction,
  deleteMaterialAction,
  deleteRiddleAction,
  deleteTaskAction,
  replaceTaskAction,
  reshuffleTasksAction,
  seedMarathonAction,
  setMarathonStatusAction,
} from "@/modules/marathons/daily/actions";
import type {
  DailyMarathon,
  MarathonDay,
  Material,
  ParticipantReport,
  Riddle,
} from "@/modules/marathons/daily/store";
import type { FunnelReport } from "@/modules/marathons/daily/funnel";
import type { BankTheme } from "@/modules/marathons/daily/taskBank";
import { MathText } from "@/components/ui/MathText";
import { MarathonBoard } from "./MarathonBoard";
import { AdminNotices } from "./admin/AdminNotices";
import { TelegramDayPreview } from "./admin/TelegramDayPreview";
import {
  AddDayForm,
  AddMaterialForm,
  AddRiddleForm,
  EditRiddleForm,
  AddTaskForm,
  CreateMarathonForm,
  MarathonSettingsForm,
  UpdateDayForm,
  UpdateMaterialForm,
} from "./admin/MarathonAdminForms";
import { CopyEditor } from "./admin/CopyEditor";
import { DayTaskBank } from "./admin/DayTaskBank";
import { MarathonFunnelStrip } from "./admin/MarathonFunnelStrip";
import { MarathonPublicLink } from "./admin/MarathonPublicLink";
import { marathonErrorText } from "./errors";
import { ConfirmSubmit, SubmitButton } from "./ConfirmSubmit";
import css from "./marathon.module.css";

function publicHref(slug: string): string {
  return absoluteSiteUrl(`/marathon/${encodeURIComponent(slug)}`);
}

export async function MarathonAdminList({
  marathons,
  error,
  savedToken,
}: {
  marathons: DailyMarathon[];
  error?: string;
  savedToken?: string;
}) {
  const t = await getTranslations("Marathon");
  const message = marathonErrorText(t, error);
  return (
    <PageFrame kicker={t("kicker")} title={t("adminTitle")} lead={t("adminLead")}>
      <AdminNotices
        key={savedToken ?? "fresh"}
        saved={Boolean(savedToken)}
        savedText={t("saved")}
        error={message}
      >
        <form action={seedMarathonAction}>
          <SubmitButton className={css.buttonQuiet} pendingLabel={t("working")}>
            {t("seed")}
          </SubmitButton>
        </form>
        <CreateMarathonForm today={kyivDateIso(new Date())} />
        <ul className={css.stack}>
          {marathons.map((marathon) => (
            <li key={marathon.id} className={css.listItem}>
              <Link className={css.editorLink} href={`/admin/marathons/${marathon.id}`}>
                {marathon.title} · {t(`status.${marathon.status}`)}
              </Link>
              <MarathonPublicLink
                href={publicHref(marathon.slug)}
                draft={marathon.status === "draft"}
              />
            </li>
          ))}
        </ul>
      </AdminNotices>
    </PageFrame>
  );
}

type EditorDay = MarathonDay & {
  materials: Material[];
  tasks: Array<{ id: number; order: number; prompt: string; options: string[]; questionId: number | null }>;
};

export async function MarathonAdminEditor({
  marathon,
  riddles,
  days,
  reports,
  funnel,
  themes,
  questions,
  error,
  savedToken,
}: {
  marathon: DailyMarathon;
  riddles: Riddle[];
  days: EditorDay[];
  reports: ParticipantReport[];
  funnel: FunnelReport;
  themes: BankTheme[];
  questions: Array<{ id: number; label: string }>;
  error?: string;
  savedToken?: string;
}) {
  const t = await getTranslations("Marathon");
  const message = marathonErrorText(t, error);
  const blockers = activationBlockers({
    daysCount: marathon.daysCount,
    days: days.map((day) => ({ dayNumber: day.dayNumber, taskCount: day.tasks.length })),
  });
  const notReady = !marathonIsReady(blockers);
  const [copy, board] = await Promise.all([
    loadMarathonCopy(marathon.id),
    loadMarathonBoard(marathon.id),
  ]);
  return (
    <PageFrame kicker={t("kicker")} title={marathon.title}>
      <AdminNotices
        key={savedToken ?? "fresh"}
        saved={Boolean(savedToken)}
        savedText={t("saved")}
        error={message}
      >
        <div className={css.editorTop}>
          <MarathonPublicLink
            href={publicHref(marathon.slug)}
            draft={marathon.status === "draft"}
          />
          <MarathonFunnelStrip funnel={funnel} />
        </div>
        {notReady ? (
          <div className={css.alert} role="alert">
            <p>{t("notReady")}</p>
            {blockers.missingDays.length > 0 ? (
              <p>{t("notReadyMissing", { days: blockers.missingDays.join(", ") })}</p>
            ) : null}
            {blockers.emptyDays.length > 0 ? (
              <p>{t("notReadyEmpty", { days: blockers.emptyDays.join(", ") })}</p>
            ) : null}
          </div>
        ) : null}
        <MarathonSettingsForm
          marathon={marathon}
          riddles={riddles.map((riddle) => ({ id: riddle.id, title: riddle.title }))}
          statusSlot={
            <div className={css.actions}>
              {(["draft", "active", "finished"] as const).map((status) => (
                <form key={status} action={setMarathonStatusAction}>
                  <input type="hidden" name="id" value={marathon.id} />
                  <input type="hidden" name="status" value={status} />
                  <SubmitButton
                    className={status === marathon.status ? css.button : css.buttonQuiet}
                    pendingLabel={t("saving")}
                  >
                    {t(`status.${status}`)}
                  </SubmitButton>
                </form>
              ))}
              <form action={deleteMarathonAction}>
                <input type="hidden" name="id" value={marathon.id} />
                <ConfirmSubmit
                  message={t("deleteConfirm")}
                  pendingLabel={t("deleting")}
                  className={css.buttonQuiet}
                >
                  {t("delete")}
                </ConfirmSubmit>
              </form>
            </div>
          }
        />
        <CopyEditor marathonId={marathon.id} overrides={copy} />
        <MarathonBoard rows={board} selfId={null} limit={null} titleId="admin-board" />

        <section className={css.stack} aria-labelledby="riddles">
          <h2 id="riddles" className={css.anchor}>{t("riddlesTitle")}</h2>
          <p className={css.lead}>{t("riddleBankLead")}</p>
          {riddles.map((riddle) => {
            const correctField = riddle.options.findIndex((option) => option.correct) + 1;
            return (
              <article key={riddle.id} id={`riddle-${riddle.id}`} className={`${css.listItem} ${css.anchor}`}>
                <h3>{riddle.title}</h3>
                <p className={css.meta}>
                  {riddle.shared ? t("riddleScopeShared") : t("riddleScopeMarathon")}
                  {riddle.subject ? ` · ${riddle.subject}` : ""}
                </p>
                {riddle.options.length > 0 ? (
                  <ul className={css.options}>
                    {riddle.options.map((option) => (
                      <li
                        key={option.id}
                        className={option.correct ? css.optionRight : css.optionStatic}
                      >
                        {option.label}
                        {option.correct ? <span>{t("correctChoice")}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p className={css.meta}>{t("riddleNoQuiz")}</p>
                    {riddle.legacyAnswer ? (
                      <p>
                        {t("riddleLegacy")}: {riddle.legacyAnswer}
                      </p>
                    ) : null}
                  </>
                )}
                <details className={css.riddleEdit}>
                  <summary>{t("editRiddle")}</summary>
                  <EditRiddleForm
                    marathonId={marathon.id}
                    slug={marathon.slug}
                    riddleId={riddle.id}
                    subject={riddle.subject ?? marathon.subject}
                    scope={riddle.shared ? "shared" : "marathon"}
                    title={riddle.title}
                    body={riddle.body}
                    hint={riddle.hint ?? ""}
                    options={riddle.options.map((option) => option.label)}
                    correctField={correctField > 0 ? correctField : null}
                  />
                </details>
                <form action={deleteRiddleAction}>
                  <input type="hidden" name="marathonId" value={marathon.id} />
                  <input type="hidden" name="riddleId" value={riddle.id} />
                  <input type="hidden" name="slug" value={marathon.slug} />
                  <ConfirmSubmit
                    message={t("deleteRiddleConfirm")}
                    pendingLabel={t("deleting")}
                    className={css.buttonQuiet}
                  >
                    {t("delete")}
                  </ConfirmSubmit>
                </form>
              </article>
            );
          })}
          <AddRiddleForm marathonId={marathon.id} slug={marathon.slug} subject={marathon.subject} />
        </section>

        <section className={css.stack} aria-labelledby="days-admin">
          <h2 id="days-admin">{t("daysTitle")}</h2>
          <AddDayForm marathonId={marathon.id} />
          {days.map((day) => (
            <article key={day.id} className={css.card}>
              <p className={css.meta}>{t("dayLabel", { n: day.dayNumber })}</p>
              <UpdateDayForm
                marathonId={marathon.id}
                dayId={day.id}
                topic={day.topic}
                introText={day.introText ?? ""}
              />
              <form action={deleteDayAction}>
                <input type="hidden" name="marathonId" value={marathon.id} />
                <input type="hidden" name="dayId" value={day.id} />
                <ConfirmSubmit
                  message={t("deleteConfirm")}
                  pendingLabel={t("deleting")}
                  className={css.buttonQuiet}
                >
                  {t("delete")}
                </ConfirmSubmit>
              </form>
              <div className={css.stack}>
                {day.materials.map((material) => (
                  <div key={material.id}>
                    <UpdateMaterialForm
                      marathonId={marathon.id}
                      dayId={day.id}
                      materialId={material.id}
                      order={material.order}
                      type={material.type}
                      urlOrBody={material.urlOrBody}
                    />
                    <form action={deleteMaterialAction}>
                      <input type="hidden" name="marathonId" value={marathon.id} />
                      <input type="hidden" name="dayId" value={day.id} />
                      <input type="hidden" name="materialId" value={material.id} />
                      <SubmitButton className={css.buttonQuiet} pendingLabel={t("deleting")}>
                        {t("delete")}
                      </SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
              <AddMaterialForm
                marathonId={marathon.id}
                dayId={day.id}
                nextOrder={day.materials.length + 1}
              />
              <h3 className={css.dayTasksTitle}>{t("dayTasksTitle")}</h3>
              {day.tasks.length > 1 ? (
                <form action={reshuffleTasksAction}>
                  <input type="hidden" name="marathonId" value={marathon.id} />
                  <input type="hidden" name="dayId" value={day.id} />
                  <SubmitButton className={css.buttonQuiet} pendingLabel={t("working")}>
                    {t("reshuffleOrder")}
                  </SubmitButton>
                </form>
              ) : null}
              <ul className={css.taskList}>
                {day.tasks.map((task) => (
                  <li key={task.id} className={css.taskRow}>
                    <p className={css.meta}>
                      {t("fields.order")} {task.order}
                      {task.questionId ? ` · ${t("taskBankTag")} #${task.questionId}` : ""}
                    </p>
                    <MathText text={task.prompt} as="div" />
                    {task.options.length > 0 ? (
                      <ol className={css.taskOptions}>
                        {task.options.map((option, index) => (
                          <li key={`${task.id}-${index}`}>
                            <MathText text={option} as="span" />
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    <div className={css.actions}>
                      {task.questionId ? (
                        <form action={replaceTaskAction}>
                          <input type="hidden" name="marathonId" value={marathon.id} />
                          <input type="hidden" name="dayId" value={day.id} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <SubmitButton className={css.buttonQuiet} pendingLabel={t("working")}>
                            {t("replaceQuestion")}
                          </SubmitButton>
                        </form>
                      ) : null}
                      <form action={deleteTaskAction}>
                        <input type="hidden" name="marathonId" value={marathon.id} />
                        <input type="hidden" name="dayId" value={day.id} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <SubmitButton className={css.buttonQuiet} pendingLabel={t("deleting")}>
                          {t("delete")}
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
              <DayTaskBank
                marathonId={marathon.id}
                dayId={day.id}
                themes={themes}
                savedQuestionIds={day.tasks.flatMap((task) =>
                  task.questionId ? [task.questionId] : [],
                )}
              />
              <details className={css.manualTask} {...(questions.length > 0 ? { open: true } : {})}>
                <summary className={css.manualSummary}>{t("manualTask")}</summary>
                <form className={css.actions} method="get">
                  <input className={css.input} name="q" placeholder={t("questionSearch")} />
                  <button type="submit" className={css.buttonQuiet}>
                    {t("search")}
                  </button>
                </form>
                <AddTaskForm
                  marathonId={marathon.id}
                  dayId={day.id}
                  nextOrder={day.tasks.length + 1}
                  questions={questions}
                />
              </details>
              <TelegramDayPreview day={day} />
            </article>
          ))}
        </section>

        <section className={css.card} aria-labelledby="people">
          <h2 id="people">{t("participants")}</h2>
          <a className={css.buttonQuiet} href={`/api/admin/marathons/${marathon.id}/export`}>
            CSV
          </a>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>{t("name")}</th>
                  <th>{t("streakLabel")}</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((person) => (
                  <tr key={person.userId}>
                    <td>
                      {person.displayName}
                      <div className={css.meta}>{person.login}</div>
                    </td>
                    <td>{person.streak}</td>
                    <td>
                      {person.days
                        .filter((day) => day.completed)
                        .map((day) => `${day.dayNumber}:${day.score ?? "—"}`)
                        .join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </AdminNotices>
    </PageFrame>
  );
}

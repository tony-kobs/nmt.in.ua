import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { kyivDateIso } from "@/modules/marathons/daily/calendar";
import { loadMarathonBoard, loadMarathonCopy } from "@/modules/marathons/daily/store";
import {
  deleteDayAction,
  deleteMarathonAction,
  deleteMaterialAction,
  deleteRiddleAction,
  deleteTaskAction,
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
import { MarathonBoard } from "./MarathonBoard";
import { AdminNotices } from "./admin/AdminNotices";
import { TelegramDayPreview } from "./admin/TelegramDayPreview";
import {
  AddDayForm,
  AddMaterialForm,
  AddRiddleForm,
  AddTaskForm,
  CreateMarathonForm,
  MarathonSettingsForm,
  UpdateDayForm,
  UpdateMaterialForm,
} from "./admin/MarathonAdminForms";
import { CopyEditor } from "./admin/CopyEditor";
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
  questions,
  error,
  savedToken,
}: {
  marathon: DailyMarathon;
  riddles: Riddle[];
  days: EditorDay[];
  reports: ParticipantReport[];
  funnel: FunnelReport;
  questions: Array<{ id: number; label: string }>;
  error?: string;
  savedToken?: string;
}) {
  const t = await getTranslations("Marathon");
  const message = marathonErrorText(t, error);
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
        <MarathonPublicLink
          href={publicHref(marathon.slug)}
          draft={marathon.status === "draft"}
          prominent
        />
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
        <MarathonSettingsForm marathon={marathon} />
        <CopyEditor marathonId={marathon.id} overrides={copy} />
        <MarathonBoard rows={board} selfId={null} limit={null} titleId="admin-board" />

        <section className={css.card} aria-labelledby="riddles">
          <h2 id="riddles">{t("riddlesTitle")}</h2>
          {riddles.map((riddle) => (
            <form key={riddle.id} action={deleteRiddleAction} className={css.actions}>
              <input type="hidden" name="marathonId" value={marathon.id} />
              <input type="hidden" name="riddleId" value={riddle.id} />
              <span>
                {riddle.order}. {riddle.title}
              </span>
              <SubmitButton className={css.buttonQuiet} pendingLabel={t("deleting")}>
                {t("delete")}
              </SubmitButton>
            </form>
          ))}
          <AddRiddleForm marathonId={marathon.id} />
        </section>

        <section className={css.stack} aria-labelledby="days-admin">
          <h2 id="days-admin">{t("daysTitle")}</h2>
          <form className={css.actions} method="get">
            <input className={css.input} name="q" placeholder={t("questionSearch")} />
            <button type="submit" className={css.buttonQuiet}>
              {t("search")}
            </button>
          </form>
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
              <ul>
                {day.tasks.map((task) => (
                  <li key={task.id}>
                    {task.questionId ? `#${task.questionId}` : task.prompt.slice(0, 80)}
                    <form action={deleteTaskAction}>
                      <input type="hidden" name="marathonId" value={marathon.id} />
                      <input type="hidden" name="dayId" value={day.id} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <SubmitButton className={css.buttonQuiet} pendingLabel={t("deleting")}>
                        {t("delete")}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <AddTaskForm
                marathonId={marathon.id}
                dayId={day.id}
                nextOrder={day.tasks.length + 1}
                questions={questions}
              />
              <TelegramDayPreview day={day} />
            </article>
          ))}
        </section>

        <section className={css.card} aria-labelledby="funnel">
          <h2 id="funnel">{t("funnelTitle")}</h2>
          <p>
            {t("funnelLine", {
              registered: funnel.totals.registered,
              verified: funnel.totals.emailVerified,
              final: funnel.totals.final,
              converted: funnel.totals.converted,
            })}
          </p>
          <p>
            {funnel.totals.days
              .map((count, index) => `${t("dayLabel", { n: index + 1 })}: ${count}`)
              .join(" · ")}
          </p>
          <ul>
            {funnel.bySource.map((row) => (
              <li key={row.source}>
                {row.source}: {row.counts.registered} / {row.counts.emailVerified} /{" "}
                {row.counts.converted}
              </li>
            ))}
          </ul>
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

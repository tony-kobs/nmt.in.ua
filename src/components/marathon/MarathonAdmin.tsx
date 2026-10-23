import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import type { CardStats } from "@/modules/marathons/daily/cardStats";
import type { CronHealth } from "@/modules/marathons/daily/cronHeartbeat";
import type { DailyFunnel } from "@/modules/marathons/daily/dailyStats";
import { durationLocale, formatMarathonDurationOrDash } from "@/modules/marathons/daily/durationText";
import type { SurveySummary } from "@/modules/marathons/daily/survey";
import { formatKyivWhen, kyivDateIso } from "@/modules/marathons/daily/calendar";
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
import { MessageTimeline } from "./admin/MessageTimeline";
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

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8A1.7 1.7 0 0 0 3.2 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
      />
    </svg>
  );
}

function StatusConfirm({
  id,
  status,
  label,
  confirm,
  pending,
  className,
}: {
  id: number;
  status: DailyMarathon["status"];
  label: string;
  confirm: string;
  pending: string;
  className: string;
}) {
  return (
    <form action={setMarathonStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <ConfirmSubmit message={confirm} pendingLabel={pending} className={className}>
        {label}
      </ConfirmSubmit>
    </form>
  );
}

function kyivDayLabel(locale: string, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "Europe/Kyiv",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

function clipImprove(value: string): string {
  const chars = Array.from(value.trim());
  return chars.length > 180 ? `${chars.slice(0, 180).join("")}…` : chars.join("");
}

async function MarathonAdminCard({
  marathon,
  stats,
  funnel,
  survey,
}: {
  marathon: DailyMarathon;
  stats: CardStats | null;
  funnel: DailyFunnel | null;
  survey: SurveySummary | null;
}) {
  const t = await getTranslations("Marathon");
  const locale = await getLocale();
  const uiLocale = durationLocale(locale);
  const hidden = marathon.status === "draft" || marathon.status === "archived";
  const focusLabel = !stats
    ? ""
    : stats.focus === "today"
      ? t("cardStatToday")
      : stats.focus === "last"
        ? t("cardStatLastDay")
        : t("cardStatDay", { day: stats.focusDay ?? "—" });
  return (
    <li className={css.listItem}>
      <div className={css.cardHead}>
        <Link className={css.editorLink} href={`/admin/marathons/${marathon.id}`}>
          {marathon.title}
        </Link>
        <Link
          className={css.gear}
          href={`/admin/marathons/${marathon.id}#marathon-settings`}
          aria-label={t("settings")}
          title={t("settings")}
        >
          <GearIcon />
        </Link>
      </div>
      <p className={css.statusBadge} data-status={marathon.status}>
        {t(`status.${marathon.status}`)}
      </p>
      <MarathonPublicLink href={publicHref(marathon.slug)} draft={hidden} />
      {stats ? (
        <dl className={css.cardStats}>
          <div>
            <dt>{t("cardStatParticipants")}</dt>
            <dd>{stats.registered}</dd>
          </div>
          <div>
            <dt>{t("cardStatTelegram")}</dt>
            <dd>{stats.telegram}</dd>
          </div>
          <div>
            <dt>{focusLabel}</dt>
            <dd>{stats.focusSubmitted}</dd>
          </div>
          <div>
            <dt>{t("cardStatFinished")}</dt>
            <dd>{stats.finished}</dd>
          </div>
          <div>
            <dt>{t("cardStatAverage")}</dt>
            <dd>{stats.avgScore == null ? t("cardStatEmpty") : t("cardStatPercent", { value: stats.avgScore })}</dd>
          </div>
          <div>
            <dt>{t("cardStatCompletion")}</dt>
            <dd>
              {stats.completionPercent == null
                ? t("cardStatEmpty")
                : t("cardStatPercent", { value: stats.completionPercent })}
            </dd>
          </div>
          <div>
            <dt>{stats.progress.kind === "start" ? t("cardStatStart") : t("cardStatProgress")}</dt>
            <dd>
              {stats.progress.kind === "start"
                ? kyivDayLabel(locale, stats.progress.date)
                : t("cardStatDayOf", { current: stats.progress.current, total: stats.progress.total })}
            </dd>
          </div>
          {stats.nextSendAt ? (
            <div>
              <dt>{t("cardStatNext")}</dt>
              <dd>{formatKyivWhen(stats.nextSendAt, locale)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {funnel ? (
        <section className={css.cardFunnel} aria-labelledby={`funnel-${marathon.id}`}>
          <h3 id={`funnel-${marathon.id}`} className={css.cardFunnelTitle}>{t("cardFunnelTitle")}</h3>
          <dl className={css.cardStats}>
            <div>
              <dt>{t("cardFunnelTickets")}</dt>
              <dd>{funnel.ticketsOpen}</dd>
            </div>
            <div>
              <dt>{t("cardFunnelErrors")}</dt>
              <dd>{funnel.deliveryErrors24h}</dd>
            </div>
          </dl>
          {funnel.days.length > 0 ? (
            <ul className={css.cardFunnelDays}>
              {funnel.days.map((day) => (
                <li key={day.day}>
                  <span>{t("cardStatDay", { day: day.day })}</span>
                  <span>{t("cardFunnelOpened", { count: day.opened })}</span>
                  <span>{t("cardFunnelCompleted", { count: day.completed })}</span>
                  <span>
                    {day.avgScore == null
                      ? t("cardFunnelAverageEmpty")
                      : t("cardFunnelAverage", { value: day.avgScore })}
                  </span>
                  <span>
                    {day.avgTimeSec == null || day.medianTimeSec == null
                      ? t("cardFunnelTimeEmpty")
                      : t("cardFunnelTime", {
                        avg: formatMarathonDurationOrDash(day.avgTimeSec, uiLocale),
                        median: formatMarathonDurationOrDash(day.medianTimeSec, uiLocale),
                      })}
                  </span>
                  <span>{t("cardFunnelDropoff", { count: day.dropoff })}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {survey && (survey.count > 0 || survey.answers.length > 0) ? (
        <section className={css.cardSurvey} aria-labelledby={`survey-${marathon.id}`}>
          <h3 id={`survey-${marathon.id}`} className={css.cardSurveyTitle}>{t("cardSurveyTitle")}</h3>
          <dl className={css.cardStats}>
            <div>
              <dt>{t("cardSurveyAverage")}</dt>
              <dd>{survey.average == null ? t("cardStatEmpty") : survey.average}</dd>
            </div>
            <div>
              <dt>{t("cardSurveyRecommend")}</dt>
              <dd>
                {survey.recommendAnswered === 0
                  ? t("cardStatEmpty")
                  : t("cardSurveyRecommendValue", { yes: survey.recommendYes, total: survey.recommendAnswered })}
              </dd>
            </div>
          </dl>
          {survey.answers.length > 0 ? (
            <ul className={css.cardSurveyList}>
              {survey.answers.map((answer, index) => (
                <li key={`${answer.name}-${index}`}>
                  <p className={css.cardSurveyMeta}>
                    <span>{answer.name}</span>
                    <span>
                      {answer.rating == null
                        ? answer.status === "skipped" ? t("cardSurveySkipped") : t("cardStatEmpty")
                        : answer.rating}
                    </span>
                    {answer.recommend == null ? null : (
                      <span>{answer.recommend ? t("cardSurveyYes") : t("cardSurveyNo")}</span>
                    )}
                  </p>
                  {answer.improve ? <p className={css.cardSurveyText}>{clipImprove(answer.improve)}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {survey.hidden > 0 ? <p className={css.cardSurveyMore}>{t("cardSurveyMore", { count: survey.hidden })}</p> : null}
        </section>
      ) : null}

      <div className={css.actions}>
        {marathon.status === "draft" ? (
          <StatusConfirm
            id={marathon.id}
            status="active"
            label={t("activate")}
            confirm={t("activateConfirm")}
            pending={t("saving")}
            className={css.button}
          />
        ) : null}
        {marathon.status === "active" ? (
          <StatusConfirm
            id={marathon.id}
            status="draft"
            label={t("deactivate")}
            confirm={t("deactivateConfirm")}
            pending={t("saving")}
            className={css.buttonQuiet}
          />
        ) : null}
        {marathon.status === "archived" ? (
          <StatusConfirm
            id={marathon.id}
            status="draft"
            label={t("restore")}
            confirm={t("restoreConfirm")}
            pending={t("saving")}
            className={css.button}
          />
        ) : (
          <StatusConfirm
            id={marathon.id}
            status="archived"
            label={t("archive")}
            confirm={t("archiveConfirm")}
            pending={t("saving")}
            className={css.buttonQuiet}
          />
        )}
      </div>
    </li>
  );
}

function cronBadge(t: Awaited<ReturnType<typeof getTranslations<"Marathon">>>, cron: CronHealth | null) {
  if (!cron) {
    return <p className={css.badgeStale} role="status">{t("cronUnknown")}</p>;
  }
  if (cron.lastRunAt == null || cron.ageMinutes == null) {
    return <p className={css.badgeStale} role="status">{t("cronNever")}</p>;
  }
  if (cron.ok) {
    return (
      <p className={css.badgeOn} role="status">
        {t("cronOk", { minutes: cron.ageMinutes })}
      </p>
    );
  }
  return (
    <p className={css.badgeStale} role="status">
      {t("cronStale", { minutes: cron.ageMinutes })}
    </p>
  );
}

export async function MarathonAdminList({
  marathons,
  stats,
  funnels,
  surveys,
  error,
  savedToken,
  cron = null,
}: {
  marathons: DailyMarathon[];
  stats: Map<number, CardStats>;
  funnels?: Map<number, DailyFunnel>;
  surveys?: Map<number, SurveySummary>;
  error?: string;
  savedToken?: string;
  cron?: CronHealth | null;
}) {
  const t = await getTranslations("Marathon");
  const message = marathonErrorText(t, error);
  const current = marathons.filter((marathon) => marathon.status !== "archived");
  const archived = marathons.filter((marathon) => marathon.status === "archived");
  const cards = (items: DailyMarathon[]) => (
    <ul className={css.stack}>
      {items.map((marathon) => (
        <MarathonAdminCard
          key={marathon.id}
          marathon={marathon}
          stats={stats.get(marathon.id) ?? null}
          funnel={funnels?.get(marathon.id) ?? null}
          survey={surveys?.get(marathon.id) ?? null}
        />
      ))}
    </ul>
  );
  return (
    <PageFrame kicker={t("kicker")} title={t("adminTitle")} lead={t("adminLead")}>
      <AdminNotices
        key={savedToken ?? "fresh"}
        saved={Boolean(savedToken)}
        savedText={t("saved")}
        error={message}
      >
        {cronBadge(t, cron)}
        <form action={seedMarathonAction}>
          <SubmitButton className={css.buttonQuiet} pendingLabel={t("working")}>
            {t("seed")}
          </SubmitButton>
        </form>
        <CreateMarathonForm today={kyivDateIso(new Date())} />
        {archived.length > 0 ? (
          <nav className={css.filterRow} aria-label={t("adminTitle")}>
            <a className={css.filterChip} href="#marathon-current">{t("currentSection")}</a>
            <a className={css.filterChip} href="#marathon-archive">
              {t("archiveSection")} · {archived.length}
            </a>
          </nav>
        ) : null}
        <section className={css.stack} id="marathon-current" aria-labelledby="marathon-current-title">
          {archived.length > 0 ? (
            <h2 id="marathon-current-title" className={`${css.sectionHeading} ${css.anchor}`}>
              {t("currentSection")}
            </h2>
          ) : (
            <h2 id="marathon-current-title" className={css.srOnly}>{t("currentSection")}</h2>
          )}
          {current.length === 0 ? <p className={css.meta}>{t("currentEmpty")}</p> : cards(current)}
        </section>
        {archived.length > 0 ? (
          <section className={css.stack} id="marathon-archive" aria-labelledby="marathon-archive-title">
            <h2 id="marathon-archive-title" className={`${css.sectionHeading} ${css.anchor}`}>
              {t("archiveSection")}
            </h2>
            <p className={css.lead}>{t("archiveLead")}</p>
            {cards(archived)}
          </section>
        ) : null}
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
  introImageUrl,
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
  introImageUrl?: string | null;
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
    <PageFrame
      kicker={t("kicker")}
      title={
        <span className={css.titleRow}>
          <span>{marathon.title}</span>
          <Link
            className={css.gear}
            href="#marathon-settings"
            aria-label={t("settings")}
            title={t("settings")}
          >
            <GearIcon />
          </Link>
        </span>
      }
    >
      <AdminNotices
        key={savedToken ?? "fresh"}
        saved={Boolean(savedToken)}
        savedText={t("saved")}
        error={message}
      >
        <div className={css.editorTop}>
          <MarathonPublicLink
            href={publicHref(marathon.slug)}
            draft={marathon.status === "draft" || marathon.status === "archived"}
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
        <div id="marathon-settings" className={css.anchor}>
        <MarathonSettingsForm
          marathon={marathon}
          introImageUrl={introImageUrl}
          riddles={riddles.map((riddle) => ({ id: riddle.id, title: riddle.title }))}
          statusSlot={
            <div className={css.actions}>
              {marathon.status === "archived" ? (
                <StatusConfirm
                  id={marathon.id}
                  status="draft"
                  label={t("restore")}
                  confirm={t("restoreConfirm")}
                  pending={t("saving")}
                  className={css.button}
                />
              ) : (
                <>
                  {(["draft", "active", "finished"] as const).map((status) => (
                    <form key={status} action={setMarathonStatusAction}>
                      <input type="hidden" name="id" value={marathon.id} />
                      <input type="hidden" name="status" value={status} />
                      {status === "active" && marathon.status !== "active" ? (
                        <ConfirmSubmit
                          message={t("activateConfirm")}
                          pendingLabel={t("saving")}
                          className={css.buttonQuiet}
                        >
                          {t(`status.${status}`)}
                        </ConfirmSubmit>
                      ) : status === "draft" && marathon.status === "active" ? (
                        <ConfirmSubmit
                          message={t("deactivateConfirm")}
                          pendingLabel={t("saving")}
                          className={css.buttonQuiet}
                        >
                          {t(`status.${status}`)}
                        </ConfirmSubmit>
                      ) : (
                        <SubmitButton
                          className={status === marathon.status ? css.button : css.buttonQuiet}
                          pendingLabel={t("saving")}
                        >
                          {t(`status.${status}`)}
                        </SubmitButton>
                      )}
                    </form>
                  ))}
                  <StatusConfirm
                    id={marathon.id}
                    status="archived"
                    label={t("archive")}
                    confirm={t("archiveConfirm")}
                    pending={t("saving")}
                    className={css.buttonQuiet}
                  />
                </>
              )}
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
        </div>
        <CopyEditor marathonId={marathon.id} overrides={copy} />
        <MarathonBoard rows={board} selfId={null} limit={null} titleId="admin-board" />
        <MessageTimeline marathon={marathon} days={days} />

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
                imageUrl={day.imageUrl}
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

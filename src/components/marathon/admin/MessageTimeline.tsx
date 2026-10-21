import {
  cancelTimelineAction,
  editTimelineAction,
  postponeTimelineAction,
} from "@/modules/marathons/daily/actions";
import { buildMessageTimeline, type TimelineDay, type TimelineItem } from "@/modules/marathons/daily/messageTimeline";
import { loadTimelineSnapshot } from "@/modules/marathons/daily/messageOverrides";
import type { DailyMarathon, MarathonDay } from "@/modules/marathons/daily/store";
import { ConfirmSubmit, SubmitButton } from "../ConfirmSubmit";
import css from "../marathon.module.css";

const KIND_LABEL: Record<string, string> = {
  day_open: "Відкриття дня",
  reminder: "Нагадування",
  nudge: "Нагадування про пропуск",
  tomorrow: "Анонс наступного дня",
  final: "Фінал",
  rank: "Зміна місця",
};

const STATUS_LABEL: Record<TimelineItem["status"], string> = {
  planned: "Заплановано",
  queued: "У черзі",
  sent: "Надіслано",
  failed: "Помилка",
  cancelled: "Скасовано",
};

function dayHeading(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function TimelineForms({ marathonId, item }: { marathonId: number; item: TimelineItem }) {
  return (
    <div className={css.stack}>
      <form action={postponeTimelineAction} className={css.form}>
        <input type="hidden" name="marathonId" value={marathonId} />
        <input type="hidden" name="key" value={item.key} />
        <div className={css.timelineWhen}>
          <label className={css.field}>
            <span>Дата</span>
            <input className={css.input} type="date" name="sendDate" required />
          </label>
          <label className={css.field}>
            <span>Час, Київ</span>
            <input className={css.input} type="time" name="sendTime" required />
          </label>
        </div>
        <SubmitButton className={css.buttonQuiet} pendingLabel="Зберігаємо…">
          Відкласти
        </SubmitButton>
      </form>
      <form action={editTimelineAction} className={css.form}>
        <input type="hidden" name="marathonId" value={marathonId} />
        <input type="hidden" name="key" value={item.key} />
        <label className={css.field}>
          <span>Текст</span>
          <textarea className={css.textarea} name="body" required maxLength={4000} defaultValue={item.template} />
        </label>
        <div className={css.timelineWhen}>
          <label className={css.field}>
            <span>Дата</span>
            <input className={css.input} type="date" name="sendDate" />
          </label>
          <label className={css.field}>
            <span>Час, Київ</span>
            <input className={css.input} type="time" name="sendTime" />
          </label>
        </div>
        <p className={css.hint}>Порожні дата й час лишають поточний момент. Для розкладу текст — шаблон з {"{name}"} і {"{day}"}.</p>
        <SubmitButton className={css.button} pendingLabel="Зберігаємо…">
          Змінити
        </SubmitButton>
      </form>
      <form action={cancelTimelineAction}>
        <input type="hidden" name="marathonId" value={marathonId} />
        <input type="hidden" name="key" value={item.key} />
        <ConfirmSubmit
          message="Скасувати це повідомлення? Воно не буде надіслане."
          pendingLabel="Скасовуємо…"
          className={css.buttonQuiet}
        >
          Видалити / скасувати
        </ConfirmSubmit>
      </form>
    </div>
  );
}

function TimelineCard({ marathonId, item }: { marathonId: number; item: TimelineItem }) {
  const preview = item.preview.length > 600 ? `${item.preview.slice(0, 600)}…` : item.preview;
  return (
    <article className={css.card}>
      <p className={css.kicker}>{STATUS_LABEL[item.status]}</p>
      <p className={css.timelineTitle}>
        {KIND_LABEL[item.kind] ?? "Повідомлення"}
        {" · "}
        {item.channel === "email" ? "Лист" : "Telegram"}
      </p>
      <p className={css.meta}>
        {clock(item.effectiveAt)}
        {" · "}
        отримувачів {item.audience}
        {item.sentCount > 0 ? ` · надіслано ${item.sentCount}` : ""}
      </p>
      <pre className={css.preview}>{preview}</pre>
      {item.editable ? (
        <TimelineForms marathonId={marathonId} item={item} />
      ) : (
        <p className={css.hint}>
          {item.status === "sent" ? "Уже надіслано — лише перегляд." : "Скасовано — лише перегляд."}
        </p>
      )}
    </article>
  );
}

export async function MessageTimeline({
  marathon,
  days,
}: {
  marathon: Pick<DailyMarathon, "id" | "slug" | "status" | "startDate" | "unlockHour" | "reminderHour" | "nudgeFrom" | "nudgeUntil">;
  days: Array<Pick<MarathonDay, "dayNumber" | "topic"> & { tasks: unknown[] }>;
}) {
  const content = days
    .filter((day) => day.tasks.length > 0)
    .map((day) => ({ dayNumber: day.dayNumber, topic: day.topic }));
  let groups: TimelineDay[] = [];
  let failed = false;
  try {
    const snapshot = await loadTimelineSnapshot(marathon.id);
    groups = buildMessageTimeline({
      schedule: {
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        reminderHour: marathon.reminderHour,
        nudgeFrom: marathon.nudgeFrom,
        nudgeUntil: marathon.nudgeUntil,
        days: content,
      },
      linkBase: `/marathon/${marathon.slug}`,
      hold: marathon.status === "archived",
      ...snapshot,
    });
  } catch (error) {
    console.error("message timeline", error);
    failed = true;
  }
  const empty = content.length === 0 && groups.every((group) => group.items.length === 0);
  return (
    <details className={css.timeline} id="message-timeline">
      <summary>Хронологія повідомлень</summary>
      <div className={css.timelineBody}>
        <p className={css.lead}>
          Усе, що марафон планує надіслати: розклад днів, черга Telegram і відкладені повідомлення. Час — за Києвом.
        </p>
        {marathon.status === "archived" ? (
          <p className={css.lead}>
            Курс в архіві: заплановані повідомлення скасовані і не підуть, доки його знову не активують.
          </p>
        ) : null}
        {failed ? <p className={css.fieldError}>Не вдалося прочитати чергу. Оновіть сторінку.</p> : null}
        {empty ? <p className={css.hint}>Немає днів із завданнями — розсилки ще не заплановані.</p> : null}
        {groups.map((group) => (
          <section key={group.date} className={css.stack} aria-labelledby={`timeline-${group.date}`}>
            <h3 id={`timeline-${group.date}`}>{dayHeading(group.date)}</h3>
            {group.items.map((item) => (
              <TimelineCard key={item.key} marathonId={marathon.id} item={item} />
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}

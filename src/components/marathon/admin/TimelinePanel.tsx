"use client";

import { useMemo, useState } from "react";
import type { TimelineDay, TimelineItem, TimelineStatus } from "@/modules/marathons/daily/messageTimeline";
import {
  cancelTimelineAction,
  editTimelineAction,
  postponeTimelineAction,
} from "@/modules/marathons/daily/actions";
import { AccordionSection } from "./SettingsAccordion";
import { ConfirmSubmit, SubmitButton } from "../ConfirmSubmit";
import css from "../marathon.module.css";

const KIND_LABEL: Record<string, string> = {
  day_open: "Відкриття дня",
  reminder: "Нагадування",
  nudge: "Нагадування про пропуск",
  tomorrow: "Анонс наступного дня",
  final: "Фінал",
  rank: "Зміна місця",
  broadcast: "Розсилка команди",
};

const STATUS_LABEL: Record<TimelineStatus, string> = {
  planned: "Заплановано",
  queued: "Очікує надсилання",
  postponed: "Відкладено",
  quiet: "Затримано тихими годинами",
  sent: "Надіслано",
  partial: "Частково надіслано",
  failed: "Помилка",
  skipped: "Пропущено",
  cancelled: "Скасовано",
};

const STATUS_ORDER: TimelineStatus[] = [
  "planned",
  "queued",
  "postponed",
  "quiet",
  "sent",
  "partial",
  "failed",
  "skipped",
  "cancelled",
];

const STATUS_CLASS: Record<TimelineStatus, string> = {
  planned: css.statusPlanned,
  queued: css.statusQueued,
  postponed: css.statusPostponed,
  quiet: css.statusQuiet,
  sent: css.statusSent,
  partial: css.statusPartial,
  failed: css.statusFailed,
  skipped: css.statusSkipped,
  cancelled: css.statusCancelled,
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

function ratio(item: TimelineItem): string {
  const total = Math.max(item.audience, item.sentCount + item.failedCount);
  return `${item.sentCount}/${total}`;
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

function TimelineCard({
  marathonId,
  item,
  storageKey,
}: {
  marathonId: number;
  item: TimelineItem;
  storageKey: string;
}) {
  const preview = item.preview.length > 600 ? `${item.preview.slice(0, 600)}…` : item.preview;
  const showRatio = item.status === "sent" || item.status === "partial";
  return (
    <article className={css.card}>
      <p className={`${css.statusBadge} ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</p>
      <p className={css.timelineTitle}>
        {KIND_LABEL[item.kind] ?? "Повідомлення"}
        {" · "}
        {item.channel === "email" ? "Лист" : "Telegram"}
      </p>
      <p className={css.meta}>
        {clock(item.effectiveAt)}
        {" · "}
        отримувачів {item.audience}
        {showRatio ? ` · ${ratio(item)}` : ""}
      </p>
      {item.status === "postponed" ? (
        <p className={css.hint}>Новий час: {clock(item.effectiveAt)}</p>
      ) : null}
      {item.status === "quiet" ? (
        <p className={css.hint}>Піде о {clock(item.effectiveAt)}</p>
      ) : null}
      {item.status === "sent" && item.sentAt ? (
        <p className={css.hint}>Надіслано о {clock(item.sentAt)} · {ratio(item)}</p>
      ) : null}
      {item.reason ? <p className={css.hint}>{item.reason}</p> : null}
      {item.failures.length > 0 && (item.status === "partial" || item.status === "failed") ? (
        <AccordionSection
          id={`fail-${item.key.replace(/[^a-z0-9]+/gi, "-")}`}
          title="Не дійшло"
          summary={String(item.failures.length)}
          keepSummary
          headingLevel="h3"
          storageKey={storageKey}
        >
          <ul className={css.failureList}>
            {item.failures.map((failure, index) => (
              <li key={`${failure.who}-${index}`}>
                <span>{failure.who}</span>
                <span className={css.meta}>{failure.reason}</span>
              </li>
            ))}
          </ul>
        </AccordionSection>
      ) : null}
      <pre className={css.preview}>{preview}</pre>
      {item.editable ? (
        <TimelineForms marathonId={marathonId} item={item} />
      ) : (
        <p className={css.hint}>
          {item.status === "sent"
            ? "Уже надіслано — лише перегляд."
            : item.status === "partial"
              ? "Частина вже пішла — лише перегляд."
              : item.status === "skipped"
                ? "Пропущено — лише перегляд."
                : "Скасовано — лише перегляд."}
        </p>
      )}
    </article>
  );
}

export function TimelinePanel({
  marathonId,
  archived,
  failed,
  empty,
  groups,
  storageKey,
}: {
  marathonId: number;
  archived: boolean;
  failed: boolean;
  empty: boolean;
  groups: TimelineDay[];
  storageKey: string;
}) {
  const [filter, setFilter] = useState<TimelineStatus | "all">("all");
  const present = useMemo(() => {
    const found = new Set<TimelineStatus>();
    for (const group of groups) {
      for (const item of group.items) found.add(item.status);
    }
    return STATUS_ORDER.filter((status) => found.has(status));
  }, [groups]);
  const visible = groups
    .map((group) => ({
      ...group,
      items: filter === "all" ? group.items : group.items.filter((item) => item.status === filter),
    }))
    .filter((group) => group.items.length > 0);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <AccordionSection
      id="message-timeline"
      title="Хронологія повідомлень"
      summary={total > 0 ? `повідомлень: ${total}` : undefined}
      keepSummary
      storageKey={storageKey}
    >
      <p className={css.lead}>
        Усе, що марафон планує надіслати: розклад днів, черга Telegram і відкладені повідомлення. Час — за Києвом.
      </p>
      {archived ? (
        <p className={css.lead}>
          Курс в архіві: ще не надіслане позначене як пропущене і не піде, доки курс знову не активують.
        </p>
      ) : null}
      {failed ? <p className={css.fieldError}>Не вдалося прочитати чергу. Оновіть сторінку.</p> : null}
      {empty ? <p className={css.hint}>Немає днів із завданнями — розсилки ще не заплановані.</p> : null}
      {present.length > 0 ? (
        <div className={css.statusFilters} role="group" aria-label="Фільтр статусу">
          <button
            type="button"
            className={css.filterChip}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Усі
          </button>
          {present.map((status) => (
            <button
              key={status}
              type="button"
              className={css.filterChip}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      ) : null}
      {filter !== "all" && visible.length === 0 ? (
        <p className={css.hint}>Немає повідомлень із цим статусом.</p>
      ) : null}
      {visible.map((group) => (
        <AccordionSection
          key={group.date}
          id={`timeline-${group.date}`}
          title={dayHeading(group.date)}
          summary={`повідомлень: ${group.items.length}`}
          keepSummary
          forceOpen={filter !== "all"}
          headingLevel="h3"
          storageKey={storageKey}
        >
          {group.items.map((item) => (
            <TimelineCard key={item.key} marathonId={marathonId} item={item} storageKey={storageKey} />
          ))}
        </AccordionSection>
      ))}
    </AccordionSection>
  );
}

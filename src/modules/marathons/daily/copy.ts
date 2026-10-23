/**
 * Participant-facing marathon copy.
 * Missing rows fall back to the Ukrainian defaults. Placeholders:
 * `{name}`, `{day}`, `{topic}`, `{unlock_time}`, `{link}`,
 * `{place}`, `{prev_place}`, `{delta}`, `{total}`,
 * `{title}`, `{start_date}`.
 */

export const COPY_PLACEHOLDERS = [
  "name",
  "day",
  "topic",
  "unlock_time",
  "link",
  "place",
  "prev_place",
  "delta",
  "total",
  "title",
  "start_date",
] as const;

export type CopyPlaceholder = (typeof COPY_PLACEHOLDERS)[number];

export const COPY_KEYS = [
  "intro_rules",
  "bot_help_chat",
  "review_intro",
  "final_summary",
  "notify_day_open",
  "notify_reminder",
  "notify_tomorrow",
  "notify_final",
  "rank_up",
  "rank_down",
  "rank_same",
  "rank_first",
  "rank_nudge",
  "rank_board",
  "channel_prompt",
  "bot_start",
  "bot_menu",
  "bot_btn_today",
  "bot_btn_top",
  "bot_btn_overall",
  "bot_btn_map",
  "bot_btn_channel",
  "bot_btn_stop",
  "bot_pause_ask",
  "bot_pause_yes",
  "bot_pause_done",
  "bot_resume_ask",
  "bot_resume_yes",
  "bot_resume_done",
  "bot_btn_site",
  "bot_btn_telegram",
  "bot_locked",
  "bot_link_ok",
  "bot_registered",
  "bot_open_site",
  "bot_to_tasks",
  "bot_btn_begin",
  "bot_btn_support",
  "bot_support_ask",
  "bot_support_thanks",
  "bot_day_done",
  "bot_finished",
  "bot_archived",
  "rank_course",
  "rank_overall",
  "survey_rating",
  "survey_improve",
  "survey_recommend",
  "survey_thanks",
  "survey_skipped",
  "survey_skip",
  "survey_yes",
  "survey_no",
] as const;

export type CopyKey = (typeof COPY_KEYS)[number];

export const COPY_GROUPS: Array<{
  id: "register" | "intro" | "day" | "remind" | "rank" | "final" | "bot";
  keys: CopyKey[];
}> = [
  { id: "register", keys: ["bot_registered"] },
  { id: "intro", keys: ["intro_rules", "bot_help_chat", "channel_prompt"] },
  {
    id: "day",
    keys: ["notify_day_open", "review_intro", "bot_locked", "bot_to_tasks", "bot_open_site", "bot_day_done"],
  },
  { id: "remind", keys: ["notify_reminder", "notify_tomorrow", "rank_nudge"] },
  {
    id: "rank",
    keys: ["rank_up", "rank_down", "rank_same", "rank_first", "rank_board", "rank_course", "rank_overall", "bot_btn_top"],
  },
  {
    id: "final",
    keys: [
      "final_summary",
      "notify_final",
      "bot_finished",
      "survey_rating",
      "survey_improve",
      "survey_recommend",
      "survey_thanks",
      "survey_skipped",
      "survey_skip",
      "survey_yes",
      "survey_no",
    ],
  },
  {
    id: "bot",
    keys: [
      "bot_start",
      "bot_menu",
      "bot_btn_today",
      "bot_btn_overall",
      "bot_btn_map",
      "bot_btn_channel",
      "bot_btn_stop",
      "bot_pause_ask",
      "bot_pause_yes",
      "bot_pause_done",
      "bot_resume_ask",
      "bot_resume_yes",
      "bot_resume_done",
      "bot_btn_site",
      "bot_btn_telegram",
      "bot_link_ok",
      "bot_btn_begin",
      "bot_btn_support",
      "bot_support_ask",
      "bot_support_thanks",
      "bot_archived",
    ],
  },
];

export function copyFieldMatches(query: string, parts: readonly string[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((part) => part.toLowerCase().includes(needle));
}

export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const TELEGRAM_BUTTON_LIMIT = 64;

const BUTTON_KEYS = new Set<CopyKey>([
  "bot_btn_today",
  "bot_btn_top",
  "bot_btn_overall",
  "bot_btn_map",
  "bot_btn_channel",
  "bot_btn_stop",
  "bot_pause_yes",
  "bot_resume_yes",
  "bot_btn_site",
  "bot_btn_telegram",
  "bot_open_site",
  "bot_to_tasks",
  "bot_btn_begin",
  "bot_btn_support",
  "survey_skip",
  "survey_yes",
  "survey_no",
]);

export const COPY_DEFAULTS: Record<CopyKey, string> = {
  intro_rules:
    "Вітаємо, {name}!\n\nОдин день — одна тема. День відкривається для всіх одночасно. Пройти його можна на сайті або в Telegram: завдання й результат спільні. Пропущений день можна здати пізніше — серія тоді почнеться спочатку. Після здачі буде розбір: ваш вибір, правильна відповідь і пояснення.",
  bot_help_chat: "Чат учасників: {link}",
  review_intro: "Розбір дня {day}: {topic}. Нижче — ваш вибір, правильна відповідь і пояснення.",
  final_summary:
    "{name}, марафон завершено. Нижче — дні, серія і теми, які варто повторити.",
  notify_day_open: "Відкрито день {day}: {topic}\n{link}",
  notify_reminder: "Нагадування: день {day} ({topic}) ще не завершено.\n{link}",
  notify_tomorrow: "Далі день {day}: {topic}. Відкриється {unlock_time}.\n{link}",
  notify_final: "{name}, це був останній день. Підсумок марафону:\n{link}",
  rank_up:
    "Молодець, {name}! Нове місце — {place} (було {prev_place}). День {day} здано. Усього {total} балів.",
  rank_down:
    "{name}, місце тепер {place} (було {prev_place}). День {day} здано. Усього {total} балів.",
  rank_same: "{name}, день {day} здано. Місце те саме — {place}. Усього {total} балів.",
  rank_first: "Молодець, {name}! Перше місце. День {day} здано, усього {total} балів.",
  rank_nudge:
    "Зараз місце {place}. Пропущений день ще можна здати.\n{link}",
  rank_board: "Таблиця марафону",
  rank_course: "Цей марафон: {title}",
  rank_overall: "Загальні — усі денні марафони",
  channel_prompt:
    "{name}, лист і Telegram вмикаються окремо. Повідомлення в Telegram ідуть, коли бот підключено.",
  bot_start:
    "Бот марафону nmt.in.ua. Щоб отримувати дні сюди, відкрийте марафон на сайті і натисніть «Прив’язати Telegram».",
  bot_menu: "Меню марафону. Оберіть дію.",
  bot_btn_today: "Сьогодні",
  bot_btn_top: "Таблиця",
  bot_btn_overall: "Загальні",
  bot_btn_map: "Карта на сайті",
  bot_btn_channel: "Змінити канал",
  bot_btn_stop: "Зупинити сповіщення",
  bot_pause_ask:
    "Поставити сповіщення марафону «{title}» на паузу? Лист і Telegram цього курсу зупиняться. Інші курси не зміняться. Дні в боті лишаються.",
  bot_pause_yes: "Так, на паузу",
  bot_pause_done: "Сповіщення «{title}» на паузі. Увімкнути знову можна в «Сповіщення».",
  bot_resume_ask: "Знову надсилати сповіщення марафону «{title}»?",
  bot_resume_yes: "Увімкнути",
  bot_resume_done: "Сповіщення «{title}» знову увімкнені.",
  bot_btn_site: "На сайті",
  bot_btn_telegram: "В Telegram",
  bot_locked: "День {day} ({topic}) ще закритий. Відкриється {unlock_time}.\n{link}",
  bot_link_ok: "Бот підключено. Нагадування і дні марафону приходитимуть сюди.",
  bot_registered:
    "Ви зареєструвалися на марафон «{title}». Старт: {start_date}. Завдання приходитимуть сюди.",
  bot_open_site: "Відкрити на сайті",
  bot_to_tasks: "До завдань",
  bot_btn_begin: "Почати",
  bot_btn_support: "Написати команді",
  bot_support_ask:
    "Напишіть команді одним повідомленням: текст або підпис до фото. Наступне повідомлення стане зверненням.",
  bot_support_thanks: "Дякуємо. Звернення передано команді.",
  bot_day_done: "День {day} ({topic}) вже зданий.\n{link}",
  bot_finished: "{name}, марафон «{title}» завершено. Таблиця і карта лишаються.\n{link}",
  bot_archived: "Марафон «{title}» в архіві. Нові дні не надходять.",
  survey_rating: "Оцініть марафон від 1 до 5.",
  survey_improve: "Що варто покращити?",
  survey_recommend: "Порадили б марафон знайомим?",
  survey_thanks: "Дякуємо за відповіді.",
  survey_skipped: "Добре, опитування пропущено.",
  survey_skip: "Пропустити",
  survey_yes: "Так",
  survey_no: "Ні",
};

export type CopyVars = Partial<Record<CopyPlaceholder, string | number | null>>;

export const COPY_PREVIEW_SAMPLE: Record<CopyPlaceholder, string> = {
  name: "Марія",
  day: "2",
  topic: "Дроби",
  unlock_time: "10 жовтня, 09:00",
  link: "https://nmt.in.ua/marathon/math-5/day/2",
  place: "2",
  prev_place: "4",
  delta: "2",
  total: "7",
  title: "П'ять днів",
  start_date: "8 жовтня 2026",
};

const PLACEHOLDER_RE = /\{([A-Za-z0-9_]+)\}/g;

export function isCopyKey(value: string): value is CopyKey {
  return (COPY_KEYS as readonly string[]).includes(value);
}

export function telegramLimit(key: CopyKey): number {
  return BUTTON_KEYS.has(key) ? TELEGRAM_BUTTON_LIMIT : TELEGRAM_MESSAGE_LIMIT;
}

export function isButtonCopy(key: CopyKey): boolean {
  return BUTTON_KEYS.has(key);
}

export function unknownPlaceholders(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const token = match[1] ?? "";
    if (!(COPY_PLACEHOLDERS as readonly string[]).includes(token) && !found.includes(token)) {
      found.push(token);
    }
  }
  return found;
}

export function renderCopy(template: string, vars: CopyVars = {}): string {
  return template.replace(PLACEHOLDER_RE, (whole, token: string) => {
    if (!(COPY_PLACEHOLDERS as readonly string[]).includes(token)) return whole;
    const value = vars[token as CopyPlaceholder];
    return value == null ? "" : String(value);
  });
}

export function resolveCopy(
  key: CopyKey,
  overrides: Partial<Record<CopyKey, string>> | null | undefined,
): string {
  const custom = overrides?.[key];
  if (typeof custom === "string" && custom.trim()) return custom;
  return COPY_DEFAULTS[key];
}

export function renderResolved(
  key: CopyKey,
  overrides: Partial<Record<CopyKey, string>> | null | undefined,
  vars: CopyVars = {},
): string {
  return renderCopy(resolveCopy(key, overrides), vars);
}

/** First non-empty line, trimmed, for an email subject. */
export function copySubject(rendered: string, fallback: string): string {
  const line = rendered
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  const subject = (line || fallback).slice(0, 180);
  return subject;
}

export type CopyLengthWarning = "message" | "button" | null;

export function copyLengthWarning(key: CopyKey, body: string): CopyLengthWarning {
  const rendered = renderCopy(body, COPY_PREVIEW_SAMPLE);
  const limit = telegramLimit(key);
  if (Math.max(body.length, rendered.length) > limit) {
    return isButtonCopy(key) ? "button" : "message";
  }
  return null;
}

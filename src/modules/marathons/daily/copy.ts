/**
 * Participant-facing marathon copy.
 * Missing rows fall back to the Ukrainian defaults. `{name}`, `{day}`,
 * `{topic}`, `{unlock_time}` and `{link}` are the only placeholders.
 */

export const COPY_PLACEHOLDERS = [
  "name",
  "day",
  "topic",
  "unlock_time",
  "link",
] as const;

export type CopyPlaceholder = (typeof COPY_PLACEHOLDERS)[number];

export const COPY_KEYS = [
  "intro_rules",
  "review_intro",
  "final_summary",
  "notify_day_open",
  "notify_reminder",
  "notify_tomorrow",
  "notify_final",
  "channel_prompt",
  "bot_start",
  "bot_menu",
  "bot_btn_today",
  "bot_btn_map",
  "bot_btn_channel",
  "bot_btn_stop",
  "bot_btn_site",
  "bot_btn_telegram",
  "bot_locked",
  "bot_link_ok",
  "bot_open_site",
  "bot_to_tasks",
] as const;

export type CopyKey = (typeof COPY_KEYS)[number];

export const COPY_GROUPS: Array<{ id: "intro" | "day" | "final" | "notify" | "channel" | "bot"; keys: CopyKey[] }> = [
  { id: "intro", keys: ["intro_rules"] },
  { id: "day", keys: ["review_intro"] },
  { id: "final", keys: ["final_summary"] },
  {
    id: "notify",
    keys: ["notify_day_open", "notify_reminder", "notify_tomorrow", "notify_final"],
  },
  { id: "channel", keys: ["channel_prompt", "bot_btn_site", "bot_btn_telegram"] },
  {
    id: "bot",
    keys: [
      "bot_start",
      "bot_menu",
      "bot_btn_today",
      "bot_btn_map",
      "bot_btn_channel",
      "bot_btn_stop",
      "bot_locked",
      "bot_link_ok",
      "bot_open_site",
      "bot_to_tasks",
    ],
  },
];

export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const TELEGRAM_BUTTON_LIMIT = 64;

const BUTTON_KEYS = new Set<CopyKey>([
  "bot_btn_today",
  "bot_btn_map",
  "bot_btn_channel",
  "bot_btn_stop",
  "bot_btn_site",
  "bot_btn_telegram",
  "bot_open_site",
  "bot_to_tasks",
]);

export const COPY_DEFAULTS: Record<CopyKey, string> = {
  intro_rules:
    "Вітаємо, {name}!\n\nОдин день марафону відкривається для всіх одночасно. Пропущений день можна пройти пізніше — серія тоді почнеться спочатку. Після завдань буде розбір: ваш вибір, правильна відповідь і пояснення.",
  review_intro: "Розбір дня {day}: {topic}. Нижче — ваш вибір, правильна відповідь і пояснення.",
  final_summary:
    "{name}, марафон завершено. Нижче — дні, серія і теми, які варто повторити.",
  notify_day_open: "Відкрито день {day}: {topic}\n\nНова тема — {topic}.\n{link}",
  notify_reminder: "Нагадування: день {day} ({topic}) ще не завершено.\n{link}",
  notify_tomorrow: "Далі день {day}: {topic}. Відкриється {unlock_time}.\n{link}",
  notify_final: "{name}, це був останній день. Підсумок марафону:\n{link}",
  channel_prompt:
    "{name}, як зручніше проходити марафон? На сайті — у кабінеті. У Telegram — матеріали, завдання й розбір у боті. Якщо бот ще не прив’язаний, листи йдуть на пошту, доки не з’явиться зв’язок.",
  bot_start:
    "Бот марафону nmt.in.ua. Щоб отримувати дні сюди, відкрийте карту на сайті і натисніть «Прив’язати Telegram».",
  bot_menu: "Меню марафону. Оберіть дію.",
  bot_btn_today: "Сьогодні",
  bot_btn_map: "Карта на сайті",
  bot_btn_channel: "Змінити канал",
  bot_btn_stop: "Зупинити сповіщення",
  bot_btn_site: "На сайті",
  bot_btn_telegram: "В Telegram",
  bot_locked: "День {day} ({topic}) ще закритий. Відкриється {unlock_time}.\n{link}",
  bot_link_ok: "Бот підключено. Нагадування і дні марафону приходитимуть сюди.",
  bot_open_site: "Відкрити на сайті",
  bot_to_tasks: "До завдань",
};

export type CopyVars = Partial<Record<CopyPlaceholder, string | number | null>>;

export const COPY_PREVIEW_SAMPLE: Record<CopyPlaceholder, string> = {
  name: "Марія",
  day: "2",
  topic: "Дроби",
  unlock_time: "10 жовтня, 09:00",
  link: "https://nmt.in.ua/marathon/math-5/day/2",
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

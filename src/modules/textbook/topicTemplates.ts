export const TOPIC_TEMPLATE_KINDS = ["algebra", "geometry"] as const;

export type TopicTemplateKind = (typeof TOPIC_TEMPLATE_KINDS)[number];

export const TOPIC_TEMPLATE_SECTIONS = [
  "Теорія",
  "Формули",
  "Приклад",
  "Типові помилки",
  "Задачі НМТ",
] as const;

const PLACEHOLDER_START = "Замініть цей абзац";

const ALGEBRA = [
  "# Теорія",
  "",
  "Замініть цей абзац коротким правилом теми. Далі — кроки, які учень робить по черзі.",
  "",
  "- перший крок",
  "- другий крок",
  "- перевірка відповіді",
  "",
  "# Формули",
  "",
  "Запишіть головну формулу окремим рядком.",
  "",
  "\\[a + b = b + a\\]",
  "",
  "# Приклад",
  "",
  "Обчисліть \\(2 + 3\\).",
  "",
  "\\[2 + 3 = 5\\]",
  "",
  "**Відповідь.** \\(5\\)",
  "",
  "# Типові помилки",
  "",
  "**Примітка.** Не плутайте додавання з множенням: \\(2 + 3\\) це не \\(6\\).",
  "",
  "# Задачі НМТ",
  "",
  "## Задача",
  "",
  "Обчисліть \\(7 - 4\\).",
  "",
  "- А) \\(1\\)",
  "- Б) \\(3\\)",
  "- В) \\(11\\)",
  "- Г) \\(28\\)",
  "- Д) \\(4\\)",
  "",
  "**Відповідь.** Б",
].join("\n");

const GEOMETRY = [
  "# Теорія",
  "",
  "Замініть цей абзац означенням або ознакою. На сітці нижче можна накидати фігуру.",
  "",
  "- що дано",
  "- що знайти",
  "- який крок перший",
  "",
  ":::paper 12 12 284",
  "",
  "# Формули",
  "",
  "Площа прямокутника зі сторонами \\(a\\) і \\(b\\).",
  "",
  "\\[S = a \\cdot b\\]",
  "",
  "# Приклад",
  "",
  "Знайдіть площу прямокутника зі сторонами \\(3\\) і \\(4\\).",
  "",
  "\\[S = 3 \\cdot 4 = 12\\]",
  "",
  "**Відповідь.** \\(12\\)",
  "",
  "# Типові помилки",
  "",
  "**Примітка.** Площа — це добуток сторін, не сума: для \\(3\\) і \\(4\\) виходить \\(12\\), а не \\(7\\).",
  "",
  "# Задачі НМТ",
  "",
  "## Задача",
  "",
  "Знайдіть площу прямокутника зі сторонами \\(5\\) і \\(2\\).",
  "",
  "- А) \\(7\\)",
  "- Б) \\(10\\)",
  "- В) \\(14\\)",
  "- Г) \\(20\\)",
  "- Д) \\(25\\)",
  "",
  "**Відповідь.** Б",
].join("\n");

/** Geometry themes use the grid skeleton. Everything else starts from algebra. */
export function topicTemplateKindForCode(themeCode: string): TopicTemplateKind {
  return /^GEO(?:-|$)/i.test(themeCode.trim()) ? "geometry" : "algebra";
}

export function topicTemplateMarkup(kind: TopicTemplateKind): string {
  return kind === "geometry" ? GEOMETRY : ALGEBRA;
}

/** Whole-section skeleton. The first placeholder sentence is selected. */
export function buildTopicTemplate(kind: TopicTemplateKind): {
  markup: string;
  selectStart: number;
  selectEnd: number;
} {
  const markup = topicTemplateMarkup(kind);
  const selectStart = Math.max(0, markup.indexOf(PLACEHOLDER_START));
  const period = markup.indexOf(".", selectStart);
  const selectEnd = period === -1 ? selectStart : period + 1;
  return { markup, selectStart, selectEnd };
}

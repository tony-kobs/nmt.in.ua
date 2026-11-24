import { textbookIntro, type PublicNmtTopic } from "./catalog";

export type TopicIntro =
  | { kind: "text"; text: string }
  | { kind: "counts"; taskCount: number | null; levels: string[] };

export function topicIntro(input: {
  code: string;
  description: string | null;
  taskCount: number | null;
  levels: readonly string[];
}): TopicIntro {
  const fromBook = textbookIntro(input.code);
  if (fromBook) return { kind: "text", text: fromBook };
  const description = input.description?.replace(/\s+/g, " ").trim() ?? "";
  if (description.length >= 80) return { kind: "text", text: description };
  const levels = input.levels.map((name) => name.trim()).filter(Boolean);
  return {
    kind: "counts",
    taskCount: input.taskCount,
    levels,
  };
}

export type PublicTopicCard = PublicNmtTopic & {
  /** Live `themes.name` when the database answered. */
  title: string;
  themeId: number | null;
  taskCount: number | null;
};

export function mergeTopicTitles(
  topics: readonly PublicNmtTopic[],
  live: readonly { code: string; id: number; name: string; taskCount: number }[],
): PublicTopicCard[] {
  const byCode = new Map(live.map((row) => [row.code, row]));
  return topics.map((topic) => {
    const row = byCode.get(topic.code);
    const title = row?.name.trim() || topic.name;
    return {
      ...topic,
      title,
      themeId: row?.id ?? null,
      taskCount: row?.taskCount ?? null,
    };
  });
}

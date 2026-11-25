import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { cachedCatalogQuery } from "@/lib/cache/catalogCache";
import { isDatabaseUnavailable } from "@/lib/db/unavailable";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import {
  publicNmtTopicBySlug,
  publicNmtTopics,
  type PublicNmtTopic,
} from "./catalog";
import { mergeTopicTitles, topicIntro, type PublicTopicCard, type TopicIntro } from "./pageModel";
import { pickSampleRows, presentSampleTask, type PublicSampleTask, type SampleTaskRow } from "./samples";

export type PublicTopicPage = {
  topic: PublicNmtTopic;
  title: string;
  themeId: number | null;
  intro: TopicIntro;
  samples: PublicSampleTask[];
};

type LoadDeps = {
  getConnection: () => Promise<SqlConnection>;
};

const SQL_LIVE = `
  SELECT t.id, t.code, t.name, COUNT(q.id) AS task_count
  FROM themes t
  LEFT JOIN quiz_tasks q ON q.theme_id = t.id AND ${publishedQuizTaskSql("q")}
  WHERE t.code <> 'MATH-05-ELEM-OPS'
  GROUP BY t.id, t.code, t.name
`;

const SQL_LEVELS = `
  SELECT name
  FROM theme_levels
  WHERE theme_id = ?
  ORDER BY sort ASC, id ASC
`;

const SQL_DESCRIPTION = `
  SELECT description
  FROM themes
  WHERE id = ?
  LIMIT 1
`;

const SQL_SAMPLES = `
  SELECT
    q.id,
    q.name,
    q.task_text,
    q.answer_1,
    q.answer_2,
    q.answer_3,
    q.answer_4,
    q.answer_5,
    q.task_kind,
    q.source_url,
    v.year,
    v.label,
    v.source_note
  FROM nmt_quiz_tasks q
  INNER JOIN nmt_variant_tasks vt ON vt.task_id = q.id
  INNER JOIN nmt_variants v ON v.id = vt.variant_id AND v.is_published = 1
  WHERE q.theme_id = ?
  ORDER BY v.year DESC, v.id DESC, vt.ord ASC
  LIMIT 24
`;

async function defaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function readLive(connection: SqlConnection): Promise<
  { code: string; id: number; name: string; taskCount: number }[]
> {
  const rows = await connection.query<{
    id: number;
    code: string;
    name: string;
    task_count: number;
  }>(SQL_LIVE);
  return rows.map((row) => ({
    id: row.id,
    code: row.code.trim(),
    name: row.name.trim(),
    taskCount: Number(row.task_count) || 0,
  }));
}

export async function loadPublicTopicCards(deps?: LoadDeps): Promise<PublicTopicCard[]> {
  const topics = publicNmtTopics();
  const run = async () => {
    const connection = await (deps?.getConnection ?? defaultConnection)();
    try {
      return mergeTopicTitles(topics, await readLive(connection));
    } finally {
      connection.release();
    }
  };
  try {
    if (deps) return await run();
    return await cachedCatalogQuery("nmt-topic-index", run);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return mergeTopicTitles(topics, []);
  }
}

async function loadOne(slug: string, deps?: LoadDeps): Promise<PublicTopicPage | null> {
  const topic = publicNmtTopicBySlug(slug);
  if (!topic) return null;
  const empty: PublicTopicPage = {
    topic,
    title: topic.name,
    themeId: null,
    intro: topicIntro({ code: topic.code, description: null, taskCount: null, levels: [] }),
    samples: [],
  };
  const connection = await (deps?.getConnection ?? defaultConnection)();
  try {
    const live = await readLive(connection);
    const row = live.find((item) => item.code === topic.code);
    if (!row) {
      return { ...empty, intro: topicIntro({ code: topic.code, description: null, taskCount: null, levels: [] }) };
    }
    const [descriptionRows, levelRows, sampleRows] = await Promise.all([
      connection.query<{ description: string | null }>(SQL_DESCRIPTION, [row.id]),
      connection.query<{ name: string }>(SQL_LEVELS, [row.id]),
      connection.query<SampleTaskRow>(SQL_SAMPLES, [row.id]),
    ]);
    const samples = pickSampleRows(sampleRows).map(presentSampleTask);
    return {
      topic,
      title: row.name || topic.name,
      themeId: row.id,
      intro: topicIntro({
        code: topic.code,
        description: descriptionRows[0]?.description ?? null,
        taskCount: row.taskCount,
        levels: levelRows.map((level) => level.name),
      }),
      samples,
    };
  } finally {
    connection.release();
  }
}

export async function loadPublicTopicPage(
  slug: string,
  deps?: LoadDeps,
): Promise<PublicTopicPage | null> {
  const topic = publicNmtTopicBySlug(slug);
  if (!topic) return null;
  try {
    if (deps) return await loadOne(slug, deps);
    return await cachedCatalogQuery(`nmt-topic:${topic.slug}`, () => loadOne(slug));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return {
      topic,
      title: topic.name,
      themeId: null,
      intro: topicIntro({ code: topic.code, description: null, taskCount: null, levels: [] }),
      samples: [],
    };
  }
}

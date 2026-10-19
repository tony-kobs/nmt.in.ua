import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { ensureMarathonSchema } from "../schema";
import type { RiddleInput } from "./forms";
import {
  buildLandingPayload,
  type PublicRiddle,
  type RiddleSessionState,
  type StoredOption,
  type StoredRiddle,
} from "./riddleQuiz";

type Conn = () => Promise<SqlConnection>;

type RiddleRow = {
  id: number;
  title: string;
  body: string;
  hint: string | null;
  legacy_answer: string | null;
  subject: string | null;
  visibility: string;
};

type OptionRow = {
  id: number;
  riddle_id: number;
  sort_order: number;
  label: string;
  is_correct: number | boolean | string;
};

const POOL_SQL = `
  SELECT b.id, b.title, b.body, b.hint, b.legacy_answer, b.subject, b.visibility
  FROM riddle_bank b
  WHERE EXISTS (
    SELECT 1 FROM riddle_marathon_tags t
    WHERE t.riddle_id = b.id AND t.marathon_id = ?
  )
  OR (
    b.visibility = 'shared'
    AND (b.subject IS NULL OR b.subject = ?)
  )
  ORDER BY b.id
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withConn<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

function correctFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function clean(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

async function optionsFor(
  connection: SqlConnection,
  ids: number[],
): Promise<Map<number, StoredOption[]>> {
  const grouped = new Map<number, StoredOption[]>();
  if (ids.length === 0) return grouped;
  const marks = ids.map(() => "?").join(", ");
  const rows = await connection.query<OptionRow>(
    `SELECT id, riddle_id, sort_order, label, is_correct
     FROM riddle_options
     WHERE riddle_id IN (${marks})
     ORDER BY sort_order, id`,
    ids,
  );
  for (const row of rows) {
    const list = grouped.get(row.riddle_id) ?? [];
    list.push({
      id: Number(row.id),
      label: row.label,
      correct: correctFlag(row.is_correct),
    });
    grouped.set(row.riddle_id, list);
  }
  return grouped;
}

function toStored(row: RiddleRow, options: StoredOption[]): StoredRiddle {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    hint: clean(row.hint),
    legacyAnswer: clean(row.legacy_answer),
    subject: clean(row.subject),
    shared: row.visibility === "shared",
    options,
  };
}

async function loadPool(
  connection: SqlConnection,
  marathonId: number,
  subject: string,
): Promise<StoredRiddle[]> {
  const rows = await connection.query<RiddleRow>(POOL_SQL, [marathonId, subject]);
  const options = await optionsFor(connection, rows.map((row) => Number(row.id)));
  return rows.map((row) => toStored(row, options.get(Number(row.id)) ?? []));
}

export async function listRiddles(
  marathonId: number,
  subject: string,
  getConnection?: Conn,
): Promise<StoredRiddle[]> {
  return withConn((connection) => loadPool(connection, marathonId, subject), getConnection);
}

export async function getRiddleById(
  riddleId: number,
  getConnection?: Conn,
): Promise<StoredRiddle | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<RiddleRow>(
      `SELECT id, title, body, hint, legacy_answer, subject, visibility
       FROM riddle_bank WHERE id = ? LIMIT 1`,
      [riddleId],
    );
    const row = rows[0];
    if (!row) return null;
    const options = await optionsFor(connection, [Number(row.id)]);
    return toStored(row, options.get(Number(row.id)) ?? []);
  }, getConnection);
}

export async function loadLandingRiddles(input: {
  marathonId: number;
  subject: string;
  count: number;
  session: RiddleSessionState | null;
  nowMs?: number;
  random?: () => number;
  getConnection?: Conn;
}): Promise<PublicRiddle[]> {
  const pool = await listRiddles(input.marathonId, input.subject, input.getConnection);
  return buildLandingPayload(
    pool,
    input.count,
    input.session,
    input.nowMs ?? Date.now(),
    input.random,
  );
}

async function replaceOptions(
  connection: SqlConnection,
  riddleId: number,
  options: string[],
  correct: number,
): Promise<void> {
  await connection.execute(`DELETE FROM riddle_options WHERE riddle_id = ?`, [riddleId]);
  for (let index = 0; index < options.length; index += 1) {
    await connection.execute(
      `INSERT INTO riddle_options (riddle_id, sort_order, label, is_correct)
       VALUES (?, ?, ?, ?)`,
      [riddleId, index + 1, options[index], index + 1 === correct ? 1 : 0],
    );
  }
}

async function replaceTag(
  connection: SqlConnection,
  riddleId: number,
  marathonId: number,
  shared: boolean,
): Promise<void> {
  await connection.execute(`DELETE FROM riddle_marathon_tags WHERE riddle_id = ?`, [riddleId]);
  if (!shared) {
    await connection.execute(
      `INSERT INTO riddle_marathon_tags (riddle_id, marathon_id) VALUES (?, ?)`,
      [riddleId, marathonId],
    );
  }
}

export async function insertRiddle(
  marathonId: number,
  input: RiddleInput,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const result = await connection.execute(
        `INSERT INTO riddle_bank (subject, visibility, title, body, hint)
         VALUES (?, ?, ?, ?, ?)`,
        [
          input.subject,
          input.scope === "shared" ? "shared" : "tagged",
          input.title,
          input.body,
          input.hint,
        ],
      );
      await replaceOptions(connection, result.insertId, input.options, input.correct);
      await replaceTag(connection, result.insertId, marathonId, input.scope === "shared");
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }, getConnection);
}

export async function updateRiddle(
  marathonId: number,
  subject: string,
  riddleId: number,
  input: RiddleInput,
  getConnection?: Conn,
): Promise<boolean> {
  return withConn(async (connection) => {
    const pool = await loadPool(connection, marathonId, subject);
    if (!pool.some((riddle) => riddle.id === riddleId)) return false;
    await connection.beginTransaction();
    try {
      await connection.execute(
        `UPDATE riddle_bank
         SET subject = ?, visibility = ?, title = ?, body = ?, hint = ?
         WHERE id = ?`,
        [
          input.subject,
          input.scope === "shared" ? "shared" : "tagged",
          input.title,
          input.body,
          input.hint,
          riddleId,
        ],
      );
      await replaceOptions(connection, riddleId, input.options, input.correct);
      await replaceTag(connection, riddleId, marathonId, input.scope === "shared");
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    return true;
  }, getConnection);
}

export async function deleteRiddle(
  marathonId: number,
  subject: string,
  riddleId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    const pool = await loadPool(connection, marathonId, subject);
    if (!pool.some((riddle) => riddle.id === riddleId)) return;
    await connection.execute(`DELETE FROM riddle_bank WHERE id = ?`, [riddleId]);
  }, getConnection);
}

/** Tagged riddles whose marathon is gone must not fall into the shared pool. */
export async function deleteOrphanTaggedRiddles(connection: SqlConnection): Promise<void> {
  await connection.execute(
    `DELETE b FROM riddle_bank b
     LEFT JOIN riddle_marathon_tags t ON t.riddle_id = b.id
     WHERE b.visibility = 'tagged' AND t.riddle_id IS NULL`,
    [],
  );
}

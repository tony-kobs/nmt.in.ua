import type { SqlConnection } from "@/lib/db/mysql";
import { pickRandomId } from "@/lib/sampleRandomIds";

const SQL_SELECT_CANDIDATES = `
  SELECT id, difficulty FROM quiz_tasks WHERE theme_id = ?
`;

export type FollowUpCandidate = { id: number; difficulty: number };

/**
 * Pure "prefer harder, fall back to any" pick over an already-loaded
 * candidate pool — split out from the DB call so the rule is unit-testable
 * without a connection. Never returns an already-used task; never *requires*
 * a harder task to exist (a small theme bank must still offer something).
 */
export function selectFollowUpCandidate(
  candidates: readonly FollowUpCandidate[],
  excludeTaskIds: readonly number[],
  preferredDifficulty: number | null,
): number | null {
  const excluded = new Set(excludeTaskIds);
  const pool = candidates.filter((candidate) => !excluded.has(candidate.id));
  if (pool.length === 0) return null;

  if (preferredDifficulty != null) {
    const harderPool = pool.filter(
      (candidate) => candidate.difficulty >= preferredDifficulty,
    );
    if (harderPool.length > 0) {
      return pickRandomId(harderPool.map((candidate) => candidate.id));
    }
  }

  return pickRandomId(pool.map((candidate) => candidate.id));
}

export type PickPracticeFollowUpTaskInput = {
  themeId: number;
  excludeTaskIds: readonly number[];
  preferredDifficulty: number | null;
};

type Deps = { getConnection: () => Promise<SqlConnection> };

/** Same-theme candidate lookup + pick, on its own connection. `deps` is
 * required (no default loader) — every caller already holds a connection
 * for its own transaction and should pass it through instead of opening a
 * second one; see `addSimilarPracticeTask.ts`. */
export async function pickPracticeFollowUpTaskId(
  input: PickPracticeFollowUpTaskInput,
  deps: Deps,
): Promise<number | null> {
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<FollowUpCandidate>(
      SQL_SELECT_CANDIDATES,
      [input.themeId],
    );
    return selectFollowUpCandidate(
      rows,
      input.excludeTaskIds,
      input.preferredDifficulty,
    );
  } finally {
    connection.release();
  }
}

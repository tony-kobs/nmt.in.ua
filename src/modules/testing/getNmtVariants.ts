import type { SqlConnection } from "@/lib/db/mysql";
import { cachedCatalogQuery } from "@/lib/cache/catalogCache";

export type NmtVariantListItem = {
  id: number;
  year: number;
  label: string;
  tasksNumber: number;
  sourceNote: string | null;
  /** Best completed attempt for the current user, if any. */
  bestAttempt: {
    sessionId: number;
    percent: number;
    timeSec: number;
  } | null;
};

type PublishedVariantRow = {
  id: number;
  year: number;
  label: string;
  tasks_number: number;
  source_note: string | null;
};

type BestAttemptRow = {
  nmt_variant_id: number;
  session_id: number;
  right_number: number;
  tasks_number: number;
  time_sec: number;
};

const SQL_PUBLISHED_VARIANTS = `
  SELECT id, year, label, tasks_number, source_note
  FROM nmt_variants
  WHERE is_published = 1
  ORDER BY year DESC, id DESC
`;

/**
 * One scan of the user's NMT sessions + window to pick the best attempt
 * per variant — avoids a correlated subquery per published variant.
 */
const SQL_BEST_ATTEMPTS = `
  SELECT
    nmt_variant_id,
    session_id,
    right_number,
    tasks_number,
    time_sec
  FROM (
    SELECT
      ts.nmt_variant_id AS nmt_variant_id,
      ts.id AS session_id,
      ts.right_number AS right_number,
      ts.tasks_number AS tasks_number,
      ts.time AS time_sec,
      ROW_NUMBER() OVER (
        PARTITION BY ts.nmt_variant_id
        ORDER BY
          (ts.right_number / NULLIF(ts.tasks_number, 0)) DESC,
          ts.id DESC
      ) AS rn
    FROM task_sessions ts
    WHERE ts.user_id = ?
      AND ts.session_type = 4
      AND ts.session_status = 1
      AND ts.nmt_variant_id IS NOT NULL
  ) ranked
  WHERE rn = 1
`;

type GetNmtVariantsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function percentOf(right: number | null, total: number | null): number {
  if (!total || total <= 0 || right == null) return 0;
  return Math.round((100 * right) / total);
}

function mergeVariants(
  variants: PublishedVariantRow[],
  bestRows: BestAttemptRow[],
): NmtVariantListItem[] {
  const bestByVariant = new Map<number, BestAttemptRow>();
  for (const row of bestRows) {
    bestByVariant.set(row.nmt_variant_id, row);
  }

  return variants.map((row) => {
    const best = bestByVariant.get(row.id);
    return {
      id: row.id,
      year: row.year,
      label: row.label.trim(),
      tasksNumber: row.tasks_number,
      sourceNote: row.source_note,
      bestAttempt: best
        ? {
            sessionId: best.session_id,
            percent: percentOf(best.right_number, best.tasks_number),
            timeSec: best.time_sec ?? 0,
          }
        : null,
    };
  });
}

async function loadPublishedVariants(
  getConnection: () => Promise<SqlConnection>,
): Promise<PublishedVariantRow[]> {
  const connection = await getConnection();
  try {
    return await connection.query<PublishedVariantRow>(SQL_PUBLISHED_VARIANTS);
  } finally {
    connection.release();
  }
}

function getCachedPublishedVariants(): Promise<PublishedVariantRow[]> {
  return cachedCatalogQuery("nmt-variants-published", () =>
    loadPublishedVariants(loadDefaultConnection),
  );
}

export async function getNmtVariantsForUser(
  userId: number,
  deps?: GetNmtVariantsDeps,
): Promise<NmtVariantListItem[]> {
  // Injected connection (tests): both queries on one checkout.
  if (deps) {
    const connection = await deps.getConnection();
    try {
      const variants = await connection.query<PublishedVariantRow>(
        SQL_PUBLISHED_VARIANTS,
      );
      const bestRows = await connection.query<BestAttemptRow>(
        SQL_BEST_ATTEMPTS,
        [userId],
      );
      return mergeVariants(variants, bestRows);
    } finally {
      connection.release();
    }
  }

  const connection = await loadDefaultConnection();
  try {
    const [variants, bestRows] = await Promise.all([
      getCachedPublishedVariants(),
      connection.query<BestAttemptRow>(SQL_BEST_ATTEMPTS, [userId]),
    ]);
    return mergeVariants(variants, bestRows);
  } finally {
    connection.release();
  }
}

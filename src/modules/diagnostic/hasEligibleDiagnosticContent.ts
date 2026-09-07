import type { SqlConnection } from "@/lib/db/mysql";
import { SQL_ELIGIBLE_THEMES } from "./startDiagnosticTest";

type HasEligibleDiagnosticContentDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Read-only availability check for the diagnostic entry page: is there at
 * least one theme with enough tasks for a real attempt right now? Lets the
 * page disable the start button and explain instead of letting the user
 * pick a self-score, submit, and only then discover there's nothing to
 * test — `startDiagnosticTest` would refuse with `insufficient_tasks`
 * anyway, but never creates a session for an ineligible attempt.
 */
export async function hasEligibleDiagnosticContent(
  deps: HasEligibleDiagnosticContentDeps = { getConnection: loadDefaultConnection },
): Promise<boolean> {
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{ theme_id: number }>(SQL_ELIGIBLE_THEMES);
    return rows.length > 0;
  } finally {
    connection.release();
  }
}

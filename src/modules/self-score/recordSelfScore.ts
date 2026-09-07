import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSelfScoreSchema, loadSelfScoreConnection } from "./schema";
import {
  isSelfScoreSource,
  isValidSelfScore,
  type SelfScoreSource,
} from "./types";

export type RecordSelfScoreInput = {
  userId: number | null;
  guestToken: string | null;
  themeId: number | null;
  score: number;
  source: SelfScoreSource;
};

export type RecordSelfScoreErrorCode = "invalid_input" | "db_error";

export class RecordSelfScoreError extends Error {
  constructor(
    message: string,
    public readonly code: RecordSelfScoreErrorCode,
  ) {
    super(message);
    this.name = "RecordSelfScoreError";
  }
}

const SQL_INSERT = `
  INSERT INTO user_self_scores (user_id, guest_token, theme_id, score, source)
  VALUES (?, ?, ?, ?, ?)
`;

type RecordSelfScoreDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Exactly one of userId / guestToken must be set — ownership must never be
 * ambiguous. themeId is null for the general (`diagnostic_overall`) score
 * and required for `pre_topic`.
 */
export function validateRecordSelfScoreInput(
  raw: unknown,
): RecordSelfScoreInput {
  if (typeof raw !== "object" || raw === null) {
    throw new RecordSelfScoreError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }

  const { userId, guestToken, themeId, score, source } = raw as Record<
    string,
    unknown
  >;

  if (!isValidSelfScore(score) || !isSelfScoreSource(source)) {
    throw new RecordSelfScoreError(
      "score must be an integer 1-10 and source must be diagnostic_overall or pre_topic.",
      "invalid_input",
    );
  }

  const hasUserId = userId !== null && userId !== undefined;
  const hasGuestToken = guestToken !== null && guestToken !== undefined;

  if (hasUserId === hasGuestToken) {
    throw new RecordSelfScoreError(
      "Exactly one of userId or guestToken must be provided.",
      "invalid_input",
    );
  }

  if (hasUserId && !isPositiveInt(userId)) {
    throw new RecordSelfScoreError(
      "userId must be a positive integer.",
      "invalid_input",
    );
  }

  if (hasGuestToken && !isNonEmptyString(guestToken)) {
    throw new RecordSelfScoreError(
      "guestToken must be a non-empty string.",
      "invalid_input",
    );
  }

  if (
    themeId !== null &&
    themeId !== undefined &&
    !isPositiveInt(themeId)
  ) {
    throw new RecordSelfScoreError(
      "themeId must be a positive integer or null.",
      "invalid_input",
    );
  }

  if (source === "pre_topic" && (themeId === null || themeId === undefined)) {
    throw new RecordSelfScoreError(
      "themeId is required for a pre_topic score.",
      "invalid_input",
    );
  }

  return {
    userId: hasUserId ? (userId as number) : null,
    guestToken: hasGuestToken ? (guestToken as string) : null,
    themeId: isPositiveInt(themeId) ? themeId : null,
    score,
    source,
  };
}

/**
 * Inserts one `user_self_scores` row. Never overwrites — every call is a
 * new history row, which is what lets `/results` pick the *latest* score.
 */
export async function recordSelfScore(
  rawInput: unknown,
  deps: RecordSelfScoreDeps = { getConnection: loadSelfScoreConnection },
): Promise<{ id: number }> {
  const input = validateRecordSelfScoreInput(rawInput);
  await ensureSelfScoreSchema(deps.getConnection);

  try {
    const connection = await deps.getConnection();
    try {
      const result = await connection.execute(SQL_INSERT, [
        input.userId,
        input.guestToken,
        input.themeId,
        input.score,
        input.source,
      ]);
      if (result.affectedRows !== 1) {
        throw new RecordSelfScoreError(
          "Failed to store the self-score.",
          "db_error",
        );
      }
      return { id: result.insertId };
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof RecordSelfScoreError) {
      throw error;
    }
    console.error("recordSelfScore: unexpected database error", error);
    throw new RecordSelfScoreError("Database operation failed.", "db_error");
  }
}

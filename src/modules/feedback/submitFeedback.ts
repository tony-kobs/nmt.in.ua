import type { SqlConnection } from "@/lib/db/mysql";
import { ensureFeedbackSchema, loadFeedbackConnection } from "./schema";
import {
  EMAIL_MAX_LEN,
  MESSAGE_MAX_LEN,
  isFeedbackCommentRequired,
  isFeedbackScore,
  isFeedbackSource,
  type FeedbackScore,
  type FeedbackSource,
} from "./types";

export type SubmitFeedbackInput = {
  userId: number | null;
  sessionId: number | null;
  score: FeedbackScore;
  message: string | null;
  email: string | null;
  source: FeedbackSource;
};

export type SubmitFeedbackErrorCode =
  | "invalid_input"
  | "message_required"
  | "invalid_email"
  | "db_error";

export class SubmitFeedbackError extends Error {
  constructor(
    message: string,
    public readonly code: SubmitFeedbackErrorCode,
  ) {
    super(message);
    this.name = "SubmitFeedbackError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SQL_INSERT = `
  INSERT INTO site_feedback (user_id, session_id, score, message, email, source)
  VALUES (?, ?, ?, ?, ?, ?)
`;

type SubmitFeedbackDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function validateSubmitFeedbackInput(
  raw: unknown,
): SubmitFeedbackInput {
  if (typeof raw !== "object" || raw === null) {
    throw new SubmitFeedbackError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }

  const { userId, sessionId, score, message, email, source } = raw as Record<
    string,
    unknown
  >;

  if (!isFeedbackScore(score) || !isFeedbackSource(source)) {
    throw new SubmitFeedbackError(
      "score must be 1–10 and source must be footer or post_test.",
      "invalid_input",
    );
  }

  if (userId !== null && userId !== undefined && !isPositiveInt(userId)) {
    throw new SubmitFeedbackError(
      "userId must be a positive integer or null.",
      "invalid_input",
    );
  }

  if (
    sessionId !== null &&
    sessionId !== undefined &&
    !isPositiveInt(sessionId)
  ) {
    throw new SubmitFeedbackError(
      "sessionId must be a positive integer or null.",
      "invalid_input",
    );
  }

  const normalizedMessage = normalizeMessage(message);
  if (normalizedMessage && normalizedMessage.length > MESSAGE_MAX_LEN) {
    throw new SubmitFeedbackError(
      "message is too long.",
      "invalid_input",
    );
  }

  if (isFeedbackCommentRequired(score) && !normalizedMessage) {
    throw new SubmitFeedbackError(
      "A suggestion is required for scores below 5.",
      "message_required",
    );
  }

  const resolvedUserId = isPositiveInt(userId) ? userId : null;
  let normalizedEmail = normalizeEmail(email);

  if (resolvedUserId !== null) {
    normalizedEmail = null;
  } else if (normalizedEmail) {
    if (
      normalizedEmail.length > EMAIL_MAX_LEN ||
      !EMAIL_PATTERN.test(normalizedEmail)
    ) {
      throw new SubmitFeedbackError(
        "email is not a valid address.",
        "invalid_email",
      );
    }
  }

  return {
    userId: resolvedUserId,
    sessionId: isPositiveInt(sessionId) ? sessionId : null,
    score,
    message: normalizedMessage,
    email: normalizedEmail,
    source,
  };
}

/**
 * Inserts one `site_feedback` row. `userId` must come from the trusted
 * session, never from the client.
 */
export async function submitFeedback(
  rawInput: unknown,
  deps: SubmitFeedbackDeps = { getConnection: loadFeedbackConnection },
): Promise<{ id: number }> {
  const input = validateSubmitFeedbackInput(rawInput);
  await ensureFeedbackSchema(deps.getConnection);

  try {
    const connection = await deps.getConnection();
    try {
      const result = await connection.execute(SQL_INSERT, [
        input.userId,
        input.sessionId,
        input.score,
        input.message,
        input.email,
        input.source,
      ]);
      if (result.affectedRows !== 1) {
        throw new SubmitFeedbackError(
          "Failed to store the feedback.",
          "db_error",
        );
      }
      return { id: result.insertId };
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof SubmitFeedbackError) {
      throw error;
    }
    console.error("submitFeedback: unexpected database error", error);
    throw new SubmitFeedbackError("Database operation failed.", "db_error");
  }
}

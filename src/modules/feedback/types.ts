export const FEEDBACK_SOURCES = ["footer", "post_test"] as const;

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_SCORE_MIN = 1;
export const FEEDBACK_SCORE_MAX = 10;
/** Comment is shown and required only when the score is strictly below this. */
export const FEEDBACK_COMMENT_BELOW_SCORE = 5;

export type FeedbackScore =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10;

export type SiteFeedback = {
  id: number;
  userId: number | null;
  sessionId: number | null;
  score: FeedbackScore;
  message: string | null;
  email: string | null;
  source: FeedbackSource;
  createdAt: Date;
  userDisplayName: string | null;
  userLogin: string | null;
};

export const MESSAGE_MAX_LEN = 2000;
export const EMAIL_MAX_LEN = 254;
export const FEEDBACK_LIST_LIMIT = 100;

export function isFeedbackSource(value: unknown): value is FeedbackSource {
  return value === "footer" || value === "post_test";
}

export function isFeedbackScore(value: unknown): value is FeedbackScore {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= FEEDBACK_SCORE_MIN &&
    value <= FEEDBACK_SCORE_MAX
  );
}

export function isFeedbackCommentRequired(score: number): boolean {
  return score < FEEDBACK_COMMENT_BELOW_SCORE;
}

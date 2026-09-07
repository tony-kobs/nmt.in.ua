export {
  SELF_SCORE_SOURCES,
  SELF_SCORE_MIN,
  SELF_SCORE_MAX,
  isSelfScoreSource,
  isValidSelfScore,
  reduceLatestSelfScores,
  resolveDisplaySelfScore,
} from "./types";
export type {
  SelfScoreSource,
  SelfScoreRow,
  LatestSelfScores,
} from "./types";
export { ensureSelfScoreSchema, loadSelfScoreConnection } from "./schema";
export {
  recordSelfScore,
  validateRecordSelfScoreInput,
  RecordSelfScoreError,
} from "./recordSelfScore";
export type {
  RecordSelfScoreInput,
  RecordSelfScoreErrorCode,
} from "./recordSelfScore";
export { getLatestSelfScoresForResults } from "./getLatestSelfScoresForResults";

/** Simulator length. The real exam pairs maths with Ukrainian in one 120-minute block. */
export const NMT_DURATION_SEC = 60 * 60;

/**
 * Seconds left from a server start time. A missing start has not begun,
 * so the full duration remains.
 */
export function remainingExamSeconds(
  startUnix: number,
  nowUnix: number,
  durationSec: number,
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  const duration = Math.floor(durationSec);
  if (!Number.isFinite(startUnix) || startUnix <= 0 || !Number.isFinite(nowUnix)) {
    return duration;
  }
  const elapsed = Math.floor(nowUnix) - Math.floor(startUnix);
  return Math.max(0, duration - Math.max(0, elapsed));
}

/** Unix seconds for session `start_time` / `time` columns. */
export function nowUnixSec(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Duration stored at finish. Server clock minus `start_time`; at least 1s so
 * completed rows satisfy `time > 0` even if start and finish share a second.
 * Missing start (still 0) is recorded as "started now" with 1s elapsed.
 */
export function resolveSessionElapsedSec(
  startTime: number,
  nowSec: number,
): { timeSec: number; startTime: number } {
  if (!Number.isFinite(startTime) || startTime <= 0) {
    return { timeSec: 1, startTime: nowSec };
  }
  return {
    timeSec: Math.max(1, nowSec - startTime),
    startTime,
  };
}

/** Trainer header clock: `MM:SS` (minutes are unbounded). */
export function formatElapsedClock(totalSec: number): string {
  const safe =
    Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

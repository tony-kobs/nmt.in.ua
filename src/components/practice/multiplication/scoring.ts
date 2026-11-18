export type TimerTone = "green" | "yellow" | "orange" | "red";
export type FeedbackKey = "excellent" | "good" | "ok" | "tryAgain";

export function getPoints(seconds: number): number {
  if (seconds < 10) return 10;
  if (seconds < 15) return 9;
  if (seconds < 20) return 8;
  return 7;
}

export function getTimerTone(seconds: number): TimerTone {
  if (seconds < 10) return "green";
  if (seconds < 15) return "yellow";
  if (seconds < 20) return "orange";
  return "red";
}

export function getFeedbackKey(score: number): FeedbackKey {
  if (score >= 100) return "excellent";
  if (score >= 70) return "good";
  if (score >= 40) return "ok";
  return "tryAgain";
}

export function generateMultipliers(
  count: number,
  random: () => number = Math.random,
): number[] {
  return Array.from({ length: count }, () => Math.floor(random() * 10) + 1);
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

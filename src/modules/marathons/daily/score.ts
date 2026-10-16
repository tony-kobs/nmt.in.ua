export function scorePercent(correct: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeCorrect = Math.max(0, Math.min(correct, total));
  return Math.round((safeCorrect / total) * 100);
}

export function isDayPassed(score: number, passThreshold: number, total = 1): boolean {
  if (!Number.isFinite(total) || total <= 0) return false;
  return score >= passThreshold;
}

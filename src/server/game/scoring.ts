/**
 * Pure scoring — brief §12. No DB, no I/O; see grading.ts for the same rule.
 */

export type ScoringMode = "speed" | "flat";

export interface ScoringInput {
  isCorrect: boolean;
  msTaken: number;
  timeLimitMs: number;
  pointsBase: number;
  /** Consecutive correct answers *including this one* — 0 resets the bonus. */
  streak: number;
  scoringMode: ScoringMode;
}

export interface ScoringResult {
  points: number;
  /** 0–1, informational — drives the "rapidité +N" breakdown line. */
  speedRatio: number;
  /** 1–1.5, informational — drives the "série ×N" breakdown line. */
  streakMultiplier: number;
}

const STREAK_CAP = 5;
const STREAK_BONUS_PER_STEP = 0.1;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function computePoints(input: ScoringInput): ScoringResult {
  if (!input.isCorrect) {
    return { points: 0, speedRatio: 0, streakMultiplier: 1 };
  }

  const speedRatio =
    input.scoringMode === "flat" ? 1 : clamp01(1 - input.msTaken / input.timeLimitMs);

  const basePoints =
    input.scoringMode === "flat" ? input.pointsBase : input.pointsBase * (0.5 + 0.5 * speedRatio);

  const streakMultiplier = 1 + Math.min(input.streak, STREAK_CAP) * STREAK_BONUS_PER_STEP;
  const points = Math.round(basePoints * streakMultiplier);

  return { points, speedRatio, streakMultiplier };
}

// ---------------------------------------------------------------------------
// Progression — brief §12: "XP = total points / 10. Level = floor(sqrt(xp / 50)) + 1"
// ---------------------------------------------------------------------------

export function xpFromPoints(totalPoints: number): number {
  return Math.floor(totalPoints / 10);
}

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

/** 0–1 progress toward the next level, for the avatar's level ring. */
export function levelProgress(xp: number): number {
  const level = levelFromXp(xp);
  const currentLevelXp = 50 * (level - 1) ** 2;
  const nextLevelXp = 50 * level ** 2;
  const span = nextLevelXp - currentLevelXp;
  if (span <= 0) return 0;
  return clamp01((xp - currentLevelXp) / span);
}

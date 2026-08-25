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

/**
 * Points scale with difficulty: a tier-5 question is worth five times a tier-1,
 * two and a half times a tier-2, and so on — difficulty IS the multiplier.
 *
 * Calibrated on 200 rather than 1000 so tier 5 lands on the existing 1000-point
 * ceiling instead of pushing it to 5000. Inflating the ceiling would inflate
 * total points, and XP/level are derived from totals (xpFromPoints / levelFromXp),
 * so every level already earned would silently rescale by about 2.24x.
 *
 * Derived at read time rather than stored: questions.points_base holds 1000 for
 * every existing row, and computing here means retuning the curve later needs no
 * migration and no backfill.
 */
const POINTS_PER_DIFFICULTY = 200;

export function pointsForDifficulty(difficulty: number): number {
  const tier = Math.max(1, Math.min(5, Math.round(difficulty)));
  return tier * POINTS_PER_DIFFICULTY;
}

/**
 * What a question is worth at full marks: its difficulty tier, so tier 3 is worth
 * 3 points. This is the scale the correction phase shows the room and the upper
 * bound of the host's slider — deliberately the small, legible 1-5 number rather
 * than the internal base points, which the speed and streak multipliers push into
 * the hundreds.
 */
export function maxPointsFor(difficulty: number): number {
  return Math.max(1, Math.min(5, Math.round(difficulty)));
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

/** XP required to *reach* a given level (the inverse of levelFromXp). */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) ** 2;
}

/** 0–1 progress toward the next level, for the avatar's level ring. */
export function levelProgress(xp: number): number {
  const level = levelFromXp(xp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = nextLevelXp - currentLevelXp;
  if (span <= 0) return 0;
  return clamp01((xp - currentLevelXp) / span);
}

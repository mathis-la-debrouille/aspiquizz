/**
 * Pure scoring. No DB, no I/O; see grading.ts for the same rule.
 */

/**
 * What a question is worth at full marks: its difficulty tier. Tier 3 is worth 3 points, and
 * that number IS the score — there is no separate internal scale any more.
 *
 * The previous model multiplied a 200-1000 point base by a speed ratio and a streak bonus, so a
 * correct answer was worth somewhere between 100 and 1500 depending on how fast you typed and
 * what you'd got right before. Played once, it turned out nobody could tell why they had 4794
 * and someone else 4996 — and speed rewards the wrong thing in a format where the room reads
 * the answers out loud afterwards anyway. So: a question is worth its tier, the host awards
 * 0..tier, and the score is the sum. +1, +2, +3.
 */
export function maxPointsFor(difficulty: number): number {
  return Math.max(1, Math.min(5, Math.round(difficulty)));
}

/**
 * Competition ranking: equal scores share a rank, and the next distinct score skips the ranks
 * the tie consumed — 13, 13, 12 is 1st, 1st, 3rd, not 1st, 2nd, 3rd.
 *
 * Ranking by array index called one of two players on 13 points the winner and the other the
 * runner-up, on nothing but map iteration order. A tie is a real result; the podium shows it
 * as one.
 *
 * Input need not be sorted — this sorts a copy and returns it in ranked order.
 */
export function assignRanks<T extends { score: number }>(rows: readonly T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  let rank = 0;
  let lastScore: number | null = null;
  return sorted.map((row, index) => {
    if (lastScore === null || row.score !== lastScore) {
      rank = index + 1;
      lastScore = row.score;
    }
    return { ...row, rank };
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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

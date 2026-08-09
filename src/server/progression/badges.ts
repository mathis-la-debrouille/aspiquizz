/**
 * Badge rules — brief §12. The static catalog (id/name/description/tier) is seeded by
 * scripts/seed-badges.ts and is the single source of truth for badge *content*; this module
 * only decides *when* one is newly earned. Pure — no DB, no I/O (award.ts gathers the
 * aggregates and passes them in) so the rules are unit-testable on their own.
 */

export interface GameOutcome {
  isWinner: boolean;
  correctCount: number;
  totalQuestions: number;
  bestStreakThisGame: number;
}

/** Cumulative totals, already including the game just played. */
export interface CumulativeStats {
  gamesPlayed: number;
  questionsAnswered: number;
  bestStreakEver: number;
  wins: number;
  /** Correct answers in the "Géographie" category, all-time. */
  geoCorrect: number;
  /** Correct answers given in under 3s, all-time. */
  fastCorrectAnswers: number;
  /** Questions authored (any status), all-time. */
  questionsCreated: number;
}

type BadgeRule = (game: GameOutcome, cumulative: CumulativeStats) => boolean;

// Keys must match badges.id from scripts/seed-badges.ts exactly.
export const BADGE_RULES: Record<string, BadgeRule> = {
  "premier-sang": (game, s) => game.isWinner && s.wins === 1,
  "sans-faute": (game) => game.totalQuestions > 0 && game.correctCount === game.totalQuestions,
  eclair: (_game, s) => s.fastCorrectAnswers >= 5,
  "globe-trotteur": (_game, s) => s.geoCorrect >= 50,
  erudit: (_game, s) => s.questionsAnswered >= 500,
  artisan: (_game, s) => s.questionsCreated >= 10,
  "serie-noire": (_game, s) => s.bestStreakEver >= 10,
  fidele: (_game, s) => s.gamesPlayed >= 10,
  cartographe: (_game, s) => s.geoCorrect >= 100,
  doyen: (_game, s) => s.gamesPlayed >= 20,
};

/** Ids of badges newly satisfied by this game, excluding ones the user already owns. */
export function evaluateNewBadges(
  game: GameOutcome,
  cumulative: CumulativeStats,
  alreadyOwned: ReadonlySet<string>,
): string[] {
  const earned: string[] = [];
  for (const [badgeId, rule] of Object.entries(BADGE_RULES)) {
    if (alreadyOwned.has(badgeId)) continue;
    if (rule(game, cumulative)) earned.push(badgeId);
  }
  return earned;
}

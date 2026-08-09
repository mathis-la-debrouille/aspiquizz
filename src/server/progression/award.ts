/**
 * Cross-game progression — called once per finished game (engine.ts's finishGame), after
 * per-question answers/room_players/user_category_stats rows are already durable. Owns
 * user_stats (games/xp/level/wins/…) and user_badges. See DECISIONS.md for the XP/level
 * formula (brief §12, already implemented in game/scoring.ts) and the badge design.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  userStats,
  userBadges,
  badges,
  userCategoryStats,
  answers,
  questions,
  categories,
} from "@/server/db/schema";
import { xpFromPoints, levelFromXp } from "@/server/game/scoring";
import { evaluateNewBadges, type GameOutcome, type CumulativeStats } from "@/server/progression/badges";

const GEOGRAPHY_CATEGORY_SLUG = "geographie";

export interface ProgressionHighlight {
  userId: string;
  label: string;
}

export interface GamePlayerResult {
  userId: string;
  score: number;
  correctCount: number;
  /** Questions this player was present (non-spectator) for, not the room's total. */
  totalQuestions: number;
  bestStreakThisGame: number;
  isWinner: boolean;
}

export async function awardProgression(
  results: GamePlayerResult[],
): Promise<ProgressionHighlight[]> {
  if (results.length === 0) return [];

  const geoCategoryRows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, GEOGRAPHY_CATEGORY_SLUG))
    .limit(1);
  const geoCategoryId = geoCategoryRows[0]?.id;

  const highlights: ProgressionHighlight[] = [];
  // Sequential, not Promise.all — each player does several read-then-write steps against the
  // same tables, and this only runs once per finished game (not on the hot per-question path),
  // so there's no real cost to keeping it simple and avoiding interleaved upserts.
  for (const result of results) {
    highlights.push(...(await awardForPlayer(result, geoCategoryId)));
  }
  return highlights;
}

async function awardForPlayer(
  result: GamePlayerResult,
  geoCategoryId: string | undefined,
): Promise<ProgressionHighlight[]> {
  const highlights: ProgressionHighlight[] = [];

  const existingRows = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, result.userId))
    .limit(1);
  const existing = existingRows[0];
  const prevLevel = existing?.level ?? 1;

  const gamesPlayed = (existing?.gamesPlayed ?? 0) + 1;
  const questionsAnswered = (existing?.questionsAnswered ?? 0) + result.totalQuestions;
  const correctAnswers = (existing?.correctAnswers ?? 0) + result.correctCount;
  const totalPoints = (existing?.totalPoints ?? 0) + result.score;
  const bestStreak = Math.max(existing?.bestStreak ?? 0, result.bestStreakThisGame);
  const wins = (existing?.wins ?? 0) + (result.isWinner ? 1 : 0);
  const xp = xpFromPoints(totalPoints);
  const level = levelFromXp(xp);

  await db
    .insert(userStats)
    .values({
      userId: result.userId,
      gamesPlayed,
      questionsAnswered,
      correctAnswers,
      totalPoints,
      bestStreak,
      xp,
      level,
      wins,
    })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: {
        gamesPlayed,
        questionsAnswered,
        correctAnswers,
        totalPoints,
        bestStreak,
        xp,
        level,
        wins,
        updatedAt: new Date(),
      },
    });

  if (level > prevLevel) {
    highlights.push({ userId: result.userId, label: `Niveau ${level} !` });
  }

  const [ownedRows, geoRows, fastRows, createdRows] = await Promise.all([
    db.select({ badgeId: userBadges.badgeId }).from(userBadges).where(eq(userBadges.userId, result.userId)),
    geoCategoryId
      ? db
          .select({ correct: userCategoryStats.correct })
          .from(userCategoryStats)
          .where(
            and(
              eq(userCategoryStats.userId, result.userId),
              eq(userCategoryStats.categoryId, geoCategoryId),
            ),
          )
          .limit(1)
      : Promise.resolve([] as { correct: number }[]),
    db
      .select({ count: sql<number>`count(*)` })
      .from(answers)
      .where(
        and(
          eq(answers.userId, result.userId),
          eq(answers.isCorrect, true),
          sql`${answers.msTaken} < 3000`,
        ),
      ),
    db.select({ count: sql<number>`count(*)` }).from(questions).where(eq(questions.authorId, result.userId)),
  ]);

  const cumulative: CumulativeStats = {
    gamesPlayed,
    questionsAnswered,
    bestStreakEver: bestStreak,
    wins,
    geoCorrect: geoRows[0]?.correct ?? 0,
    fastCorrectAnswers: Number(fastRows[0]?.count ?? 0),
    questionsCreated: Number(createdRows[0]?.count ?? 0),
  };

  const game: GameOutcome = {
    isWinner: result.isWinner,
    correctCount: result.correctCount,
    totalQuestions: result.totalQuestions,
    bestStreakThisGame: result.bestStreakThisGame,
  };

  const alreadyOwned = new Set(ownedRows.map((r) => r.badgeId));
  const newBadgeIds = evaluateNewBadges(game, cumulative, alreadyOwned);

  if (newBadgeIds.length > 0) {
    const badgeDefs = await db.select().from(badges).where(inArray(badges.id, newBadgeIds));
    await db
      .insert(userBadges)
      .values(newBadgeIds.map((badgeId) => ({ userId: result.userId, badgeId })));
    for (const def of badgeDefs) {
      highlights.push({ userId: result.userId, label: `Nouveau badge : ${def.nameFr}` });
    }
  }

  return highlights;
}

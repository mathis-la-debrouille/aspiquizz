import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  users,
  userStats,
  userBadges,
  badges,
  userCategoryStats,
  categories,
  roomPlayers,
  rooms,
  type BadgeTier,
} from "@/server/db/schema";

export interface ProfileStats {
  gamesPlayed: number;
  questionsAnswered: number;
  correctAnswers: number;
  totalPoints: number;
  bestStreak: number;
  xp: number;
  level: number;
  wins: number;
}

const EMPTY_STATS: ProfileStats = {
  gamesPlayed: 0,
  questionsAnswered: 0,
  correctAnswers: 0,
  totalPoints: 0,
  bestStreak: 0,
  xp: 0,
  level: 1,
  wins: 0,
};

export interface ProfileBadge {
  id: string;
  nameFr: string;
  descriptionFr: string;
  iconKey: string;
  tier: BadgeTier;
  earnedAt: Date | null;
}

export interface ProfileCategoryStat {
  categoryId: string;
  name: string;
  colorToken: "moss" | "gold" | "clay" | "plum";
  answered: number;
  correct: number;
}

export interface ProfileRecentGame {
  roomId: string;
  roomName: string;
  score: number;
  finalRank: number | null;
  playerCount: number;
  endedAt: Date | null;
}

export interface ProfileData {
  userId: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  bio: string | null;
  createdAt: Date;
  stats: ProfileStats;
  badges: ProfileBadge[];
  categories: ProfileCategoryStat[];
  recentGames: ProfileRecentGame[];
}

export async function getProfileByUsername(username: string): Promise<ProfileData | null> {
  const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const user = userRows[0];
  if (!user) return null;

  const [statsRows, ownedBadgeRows, allBadges, categoryRows, recentRoomRows] = await Promise.all([
    db.select().from(userStats).where(eq(userStats.userId, user.id)).limit(1),
    db.select().from(userBadges).where(eq(userBadges.userId, user.id)),
    db.select().from(badges),
    db
      .select({
        categoryId: userCategoryStats.categoryId,
        name: categories.name,
        colorToken: categories.colorToken,
        answered: userCategoryStats.answered,
        correct: userCategoryStats.correct,
      })
      .from(userCategoryStats)
      .innerJoin(categories, eq(userCategoryStats.categoryId, categories.id))
      .where(eq(userCategoryStats.userId, user.id)),
    db
      .select({
        roomId: rooms.id,
        roomName: rooms.name,
        score: roomPlayers.score,
        finalRank: roomPlayers.finalRank,
        endedAt: rooms.endedAt,
      })
      .from(roomPlayers)
      .innerJoin(rooms, eq(roomPlayers.roomId, rooms.id))
      .where(eq(roomPlayers.userId, user.id))
      .orderBy(desc(rooms.endedAt))
      .limit(10),
  ]);

  const earnedAtByBadgeId = new Map(ownedBadgeRows.map((r) => [r.badgeId, r.earnedAt]));
  const profileBadges: ProfileBadge[] = allBadges
    .map((def) => ({
      id: def.id,
      nameFr: def.nameFr,
      descriptionFr: def.descriptionFr,
      iconKey: def.iconKey,
      tier: def.tier,
      earnedAt: earnedAtByBadgeId.get(def.id) ?? null,
    }))
    .sort((a, b) => {
      if (!!a.earnedAt !== !!b.earnedAt) return a.earnedAt ? -1 : 1;
      return a.nameFr.localeCompare(b.nameFr, "fr");
    });

  // Player counts for the recent-games strip, one query rather than N — small (<=10) rooms.
  const playerCounts = await Promise.all(
    recentRoomRows.map((r) =>
      db.select().from(roomPlayers).where(eq(roomPlayers.roomId, r.roomId)),
    ),
  );

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarSeed: user.avatarSeed,
    bio: user.bio,
    createdAt: user.createdAt,
    stats: statsRows[0] ?? EMPTY_STATS,
    badges: profileBadges,
    categories: categoryRows,
    recentGames: recentRoomRows.map((r, i) => ({
      roomId: r.roomId,
      roomName: r.roomName,
      score: r.score,
      finalRank: r.finalRank,
      playerCount: playerCounts[i]?.length ?? 0,
      endedAt: r.endedAt,
    })),
  };
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  xp: number;
  level: number;
  wins: number;
  gamesPlayed: number;
  rank: number;
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: userStats.userId,
      username: users.username,
      displayName: users.displayName,
      avatarSeed: users.avatarSeed,
      xp: userStats.xp,
      level: userStats.level,
      wins: userStats.wins,
      gamesPlayed: userStats.gamesPlayed,
    })
    .from(userStats)
    .innerJoin(users, eq(userStats.userId, users.id))
    .orderBy(desc(userStats.xp))
    .limit(limit);

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

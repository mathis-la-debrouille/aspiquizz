import { describe, expect, it } from "vitest";
import {
  evaluateNewBadges,
  BADGE_RULES,
  type GameOutcome,
  type CumulativeStats,
} from "@/server/progression/badges";

const game: GameOutcome = {
  isWinner: false,
  correctCount: 0,
  totalQuestions: 10,
  bestStreakThisGame: 0,
};

const cumulative: CumulativeStats = {
  gamesPlayed: 1,
  questionsAnswered: 10,
  bestStreakEver: 0,
  wins: 0,
  geoCorrect: 0,
  fastCorrectAnswers: 0,
  questionsCreated: 0,
};

describe("evaluateNewBadges", () => {
  it("awards nothing when no threshold is met", () => {
    expect(evaluateNewBadges(game, cumulative, new Set())).toEqual([]);
  });

  it("premier-sang: only on a win, and only the game that makes wins === 1", () => {
    expect(
      evaluateNewBadges({ ...game, isWinner: true }, { ...cumulative, wins: 1 }, new Set()),
    ).toContain("premier-sang");
    // A later win (wins already > 1 before this game) shouldn't re-trigger it — the caller
    // wouldn't pass it again anyway since alreadyOwned would include it, but the rule itself
    // is also strict about wins === 1 so a second win never satisfies it from scratch.
    expect(
      evaluateNewBadges({ ...game, isWinner: true }, { ...cumulative, wins: 2 }, new Set()),
    ).not.toContain("premier-sang");
  });

  it("sans-faute: every question answered correctly, at least one question", () => {
    expect(
      evaluateNewBadges(
        { ...game, correctCount: 10, totalQuestions: 10 },
        cumulative,
        new Set(),
      ),
    ).toContain("sans-faute");
    expect(
      evaluateNewBadges({ ...game, correctCount: 0, totalQuestions: 0 }, cumulative, new Set()),
    ).not.toContain("sans-faute");
    expect(
      evaluateNewBadges(
        { ...game, correctCount: 9, totalQuestions: 10 },
        cumulative,
        new Set(),
      ),
    ).not.toContain("sans-faute");
  });

  it("threshold badges fire exactly at their threshold, not one below", () => {
    expect(
      evaluateNewBadges(game, { ...cumulative, fastCorrectAnswers: 4 }, new Set()),
    ).not.toContain("eclair");
    expect(
      evaluateNewBadges(game, { ...cumulative, fastCorrectAnswers: 5 }, new Set()),
    ).toContain("eclair");

    expect(evaluateNewBadges(game, { ...cumulative, geoCorrect: 49 }, new Set())).not.toContain(
      "globe-trotteur",
    );
    expect(evaluateNewBadges(game, { ...cumulative, geoCorrect: 50 }, new Set())).toContain(
      "globe-trotteur",
    );
    expect(evaluateNewBadges(game, { ...cumulative, geoCorrect: 99 }, new Set())).not.toContain(
      "cartographe",
    );
    expect(evaluateNewBadges(game, { ...cumulative, geoCorrect: 100 }, new Set())).toContain(
      "cartographe",
    );

    expect(
      evaluateNewBadges(game, { ...cumulative, bestStreakEver: 9 }, new Set()),
    ).not.toContain("serie-noire");
    expect(evaluateNewBadges(game, { ...cumulative, bestStreakEver: 10 }, new Set())).toContain(
      "serie-noire",
    );

    expect(evaluateNewBadges(game, { ...cumulative, gamesPlayed: 9 }, new Set())).not.toContain(
      "fidele",
    );
    expect(evaluateNewBadges(game, { ...cumulative, gamesPlayed: 10 }, new Set())).toContain(
      "fidele",
    );
    expect(evaluateNewBadges(game, { ...cumulative, gamesPlayed: 19 }, new Set())).not.toContain(
      "doyen",
    );
    expect(evaluateNewBadges(game, { ...cumulative, gamesPlayed: 20 }, new Set())).toContain(
      "doyen",
    );

    expect(
      evaluateNewBadges(game, { ...cumulative, questionsAnswered: 499 }, new Set()),
    ).not.toContain("erudit");
    expect(
      evaluateNewBadges(game, { ...cumulative, questionsAnswered: 500 }, new Set()),
    ).toContain("erudit");

    expect(
      evaluateNewBadges(game, { ...cumulative, questionsCreated: 9 }, new Set()),
    ).not.toContain("artisan");
    expect(
      evaluateNewBadges(game, { ...cumulative, questionsCreated: 10 }, new Set()),
    ).toContain("artisan");
  });

  it("never re-awards a badge already in alreadyOwned, even if the rule still matches", () => {
    const stats = { ...cumulative, gamesPlayed: 20 };
    expect(evaluateNewBadges(game, stats, new Set(["fidele", "doyen"]))).toEqual([]);
  });

  it("every rule key matches a real seed id (scripts/seed-badges.ts)", () => {
    const seededIds = [
      "premier-sang",
      "sans-faute",
      "eclair",
      "globe-trotteur",
      "erudit",
      "artisan",
      "serie-noire",
      "fidele",
      "cartographe",
      "doyen",
    ];
    expect(Object.keys(BADGE_RULES).sort()).toEqual([...seededIds].sort());
  });
});

import { describe, expect, it } from "vitest";
import {
  computePoints,
  pointsForDifficulty,
  maxPointsFor,
  levelFromXp,
  levelProgress,
  xpFromPoints,
  type ScoringInput,
} from "@/server/game/scoring";

const base: ScoringInput = {
  isCorrect: true,
  msTaken: 0,
  timeLimitMs: 20_000,
  pointsBase: 1000,
  streak: 1,
  scoringMode: "speed",
};

describe("computePoints — wrong/unanswered", () => {
  it("awards 0 points for an incorrect answer regardless of mode", () => {
    expect(computePoints({ ...base, isCorrect: false }).points).toBe(0);
    expect(computePoints({ ...base, isCorrect: false, scoringMode: "flat" }).points).toBe(0);
  });

  it("awards 0 points even with a high streak, if wrong", () => {
    expect(computePoints({ ...base, isCorrect: false, streak: 5 }).points).toBe(0);
  });
});

describe("computePoints — flat mode", () => {
  it("always awards pointsBase, ignoring time taken", () => {
    expect(computePoints({ ...base, scoringMode: "flat", msTaken: 0, streak: 0 }).points).toBe(
      1000,
    );
    expect(computePoints({ ...base, scoringMode: "flat", msTaken: 19_999, streak: 0 }).points).toBe(
      1000,
    );
  });

  it("still applies the streak multiplier in flat mode", () => {
    // streak 5 -> +50%
    expect(computePoints({ ...base, scoringMode: "flat", streak: 5 }).points).toBe(1500);
  });
});

describe("computePoints — speed mode boundaries", () => {
  it("awards 100% of base at msTaken=0 (instant answer)", () => {
    const result = computePoints({ ...base, msTaken: 0, streak: 0 });
    expect(result.points).toBe(1000);
    expect(result.speedRatio).toBe(1);
  });

  it("awards 50% of base at msTaken=timeLimitMs (last possible instant)", () => {
    const result = computePoints({ ...base, msTaken: 20_000, streak: 0 });
    expect(result.points).toBe(500);
    expect(result.speedRatio).toBe(0);
  });

  it("awards ~75% of base at the midpoint", () => {
    const result = computePoints({ ...base, msTaken: 10_000, streak: 0 });
    expect(result.points).toBe(750);
    expect(result.speedRatio).toBeCloseTo(0.5);
  });

  it("clamps speed ratio to 0 when msTaken exceeds the time limit (network grace)", () => {
    const result = computePoints({ ...base, msTaken: 20_300, streak: 0 });
    expect(result.points).toBe(500);
    expect(result.speedRatio).toBe(0);
  });
});

describe("computePoints — streak bonus", () => {
  it("applies no bonus at streak 0", () => {
    const result = computePoints({ ...base, msTaken: 0, streak: 0 });
    expect(result.streakMultiplier).toBe(1);
    expect(result.points).toBe(1000);
  });

  it("applies +10% per consecutive correct answer", () => {
    expect(computePoints({ ...base, msTaken: 0, streak: 1 }).points).toBe(1100);
    expect(computePoints({ ...base, msTaken: 0, streak: 2 }).points).toBe(1200);
    expect(computePoints({ ...base, msTaken: 0, streak: 3 }).points).toBe(1300);
  });

  it("caps the bonus at +50% (streak 5)", () => {
    expect(computePoints({ ...base, msTaken: 0, streak: 5 }).points).toBe(1500);
  });

  it("does not exceed the cap beyond streak 5", () => {
    const at5 = computePoints({ ...base, msTaken: 0, streak: 5 }).points;
    const at10 = computePoints({ ...base, msTaken: 0, streak: 10 }).points;
    expect(at10).toBe(at5);
    expect(at10).toBe(1500);
  });

  it("matches the worked example from brief §12 (780 pts, rapidite +140, serie x1.3)", () => {
    // 780 / 1.3 ≈ 600 base-after-speed → base(1000) * (0.5+0.5*speed) = 600 → speed = 0.2
    const result = computePoints({
      pointsBase: 1000,
      isCorrect: true,
      msTaken: 16_000,
      timeLimitMs: 20_000,
      streak: 3,
      scoringMode: "speed",
    });
    expect(result.streakMultiplier).toBeCloseTo(1.3);
    expect(result.points).toBe(780);
  });
});

describe("xpFromPoints / levelFromXp — brief §12", () => {
  it("computes xp as totalPoints / 10, floored", () => {
    expect(xpFromPoints(1000)).toBe(100);
    expect(xpFromPoints(1005)).toBe(100);
    expect(xpFromPoints(0)).toBe(0);
  });

  it("computes level as floor(sqrt(xp/50)) + 1", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(49)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(200)).toBe(3);
    expect(levelFromXp(450)).toBe(4);
  });

  it("level never goes below 1", () => {
    expect(levelFromXp(0)).toBeGreaterThanOrEqual(1);
  });
});

describe("levelProgress", () => {
  it("is 0 right at a level boundary", () => {
    expect(levelProgress(50)).toBeCloseTo(0);
  });

  it("is close to 1 just before the next level boundary", () => {
    expect(levelProgress(199)).toBeGreaterThan(0.9);
  });

  it("stays within [0, 1]", () => {
    for (const xp of [0, 10, 50, 123, 1000, 5000]) {
      const p = levelProgress(xp);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("pointsForDifficulty", () => {
  it("makes difficulty the multiplier: tier 5 is worth 5x tier 1", () => {
    expect(pointsForDifficulty(5)).toBe(5 * pointsForDifficulty(1));
    expect(pointsForDifficulty(5) / pointsForDifficulty(2)).toBe(2.5);
    expect(pointsForDifficulty(4) / pointsForDifficulty(2)).toBe(2);
  });

  it("keeps tier 5 on the existing 1000-point ceiling, so XP/levels don't rescale", () => {
    expect(pointsForDifficulty(5)).toBe(1000);
    expect(pointsForDifficulty(1)).toBe(200);
  });

  it("clamps out-of-range difficulties instead of returning 0 or a huge value", () => {
    expect(pointsForDifficulty(0)).toBe(pointsForDifficulty(1));
    expect(pointsForDifficulty(9)).toBe(pointsForDifficulty(5));
    expect(pointsForDifficulty(-3)).toBe(pointsForDifficulty(1));
  });
});

describe("maxPointsFor", () => {
  it("makes a question worth its difficulty tier at full marks", () => {
    expect(maxPointsFor(1)).toBe(1);
    expect(maxPointsFor(3)).toBe(3);
    expect(maxPointsFor(5)).toBe(5);
  });

  it("clamps out-of-range tiers rather than returning 0 or something huge", () => {
    expect(maxPointsFor(0)).toBe(1);
    expect(maxPointsFor(9)).toBe(5);
    expect(maxPointsFor(-2)).toBe(1);
  });

  it("keeps partial marks proportional to the tier's base points", () => {
    // What the engine does when the host awards a fraction: 2 of 5 on a tier-5
    // question is two fifths of that tier's base, not two fifths of the ceiling
    // of some other tier.
    const base = (tier: number, awarded: number) =>
      Math.round(pointsForDifficulty(tier) * (awarded / maxPointsFor(tier)));
    expect(base(5, 5)).toBe(pointsForDifficulty(5));
    expect(base(5, 0)).toBe(0);
    expect(base(5, 2)).toBe(400);
    expect(base(3, 1)).toBe(200);
    // A full mark on a low tier is still worth less than a partial on a high one
    // only when the fraction says so — tier 1 full (200) equals tier 5 at 1 of 5.
    expect(base(1, 1)).toBe(base(5, 1));
  });
});

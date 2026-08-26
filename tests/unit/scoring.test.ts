import { describe, expect, it } from "vitest";
import {
  maxPointsFor,
  xpFromPoints,
  levelFromXp,
  xpForLevel,
  levelProgress,
} from "@/server/game/scoring";

describe("maxPointsFor", () => {
  it("is the difficulty tier itself", () => {
    expect(maxPointsFor(1)).toBe(1);
    expect(maxPointsFor(2)).toBe(2);
    expect(maxPointsFor(3)).toBe(3);
    expect(maxPointsFor(4)).toBe(4);
    expect(maxPointsFor(5)).toBe(5);
  });

  it("clamps outside 1-5 rather than trusting the column", () => {
    expect(maxPointsFor(0)).toBe(1);
    expect(maxPointsFor(-3)).toBe(1);
    expect(maxPointsFor(9)).toBe(5);
  });

  it("rounds a non-integer difficulty", () => {
    expect(maxPointsFor(2.4)).toBe(2);
    expect(maxPointsFor(2.6)).toBe(3);
  });
});

describe("progression", () => {
  it("derives xp from total points", () => {
    expect(xpFromPoints(0)).toBe(0);
    expect(xpFromPoints(95)).toBe(9);
    expect(xpFromPoints(1000)).toBe(100);
  });

  it("levels from xp, and xpForLevel is its inverse", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(200)).toBe(3);
    for (const level of [1, 2, 5, 9]) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
    }
  });

  it("reports progress toward the next level within 0..1", () => {
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress(xpForLevel(3))).toBe(0);
    const mid = levelProgress(xpForLevel(3) + (xpForLevel(4) - xpForLevel(3)) / 2);
    expect(mid).toBeCloseTo(0.5);
    expect(levelProgress(10 ** 9)).toBeLessThanOrEqual(1);
  });
});

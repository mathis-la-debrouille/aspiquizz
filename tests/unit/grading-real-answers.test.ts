import { describe, expect, it } from "vitest";
import { expandTypedVariants, matchesAnyVariant } from "@/server/game/grading";

/**
 * Answers actually typed in one game, with the verdict a human gave them.
 *
 * Regression tests in the strictest sense: every "true" line here was marked WRONG by the
 * grader, and every "false" line that involves a number was marked RIGHT. Nine of the eleven
 * misgraded answers in that game came from two causes — determiners the normaliser did not
 * strip, and edit distance applied to years.
 */
const CASES: [string, string, boolean][] = [
  ["Du Mexique", "Mexique", true],
  ["Un synonyme", "Synonyme", true],
  ["Le théorème de Pythagore", "Pythagore", true],
  ["La bataille de Verdun", "Verdun", true],
  ["Fiodor Dostoïevski", "Dostoïevski", true],
  ["Le foie", "Son foie", true],
  ["La ligne 3bis", "3bis", true],
  ["Antoine de Saint-Exupéry", "Maupassant", false],
  ["1999", "1997", false],
  ["1024", "1025", false],
  ["16", "15", false],
  ["L'Amérique du Sud", "Sud", false],
  ["L'Amérique du Sud", "Amérique du Sud", true],
  ["Roger Federer", "Nadal", false],
  ["La ligne 3bis", "3", false],
];

describe("real answers from a real game", () => {
  for (const [label, typed, expected] of CASES) {
    it(`« ${typed} » for « ${label} » -> ${expected ? "accepté" : "refusé"}`, () => {
      const got = matchesAnyVariant(typed, expandTypedVariants([label]), false).isCorrect;
      if (got !== expected) console.log(`  MISMATCH: « ${typed} » / « ${label} » -> ${got}`);
      expect(got).toBe(expected);
    });
  }
});

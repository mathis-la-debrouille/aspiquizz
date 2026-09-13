import { describe, expect, it } from "vitest";
import { FLAG_REASON_MAX, FLAG_TAGS, composeFlagReason } from "@/lib/flags";
import { flagQuestionInputSchema, flagResolutionSchema } from "@/lib/schemas/flags";

describe("composeFlagReason", () => {
  it("returns null when there is nothing to say, so a bare report stays bare", () => {
    expect(composeFlagReason([], "")).toBeNull();
    expect(composeFlagReason([], "   \n  ")).toBeNull();
  });

  it("joins tag labels, then the comment", () => {
    expect(composeFlagReason(["wrong_answer", "outdated"], "c'est le PSG depuis 2025")).toBe(
      "Réponse fausse · Plus à jour — c'est le PSG depuis 2025",
    );
  });

  it("works with tags only or comment only", () => {
    expect(composeFlagReason(["typo"], "")).toBe("Faute ou coquille");
    expect(composeFlagReason([], "  deux réponses possibles ")).toBe("deux réponses possibles");
  });

  it("drops unknown tag ids and collapses duplicates", () => {
    expect(composeFlagReason(["nope", "typo", "typo"], "")).toBe("Faute ou coquille");
  });

  it("collapses whitespace in the comment", () => {
    expect(composeFlagReason([], "ligne un\n\n  ligne   deux")).toBe("ligne un ligne deux");
  });

  it("never exceeds the length the server accepts", () => {
    const all = FLAG_TAGS.map((t) => t.id);
    const reason = composeFlagReason(all, "x".repeat(FLAG_REASON_MAX * 2));
    expect(reason).not.toBeNull();
    expect(reason!.length).toBeLessThanOrEqual(FLAG_REASON_MAX);
    expect(flagQuestionInputSchema.safeParse({ questionId: "q1", reason }).success).toBe(true);
  });
});

describe("flag schemas", () => {
  it("accepts a bare report and a report with room code and reason", () => {
    expect(flagQuestionInputSchema.safeParse({ questionId: "q1" }).success).toBe(true);
    expect(
      flagQuestionInputSchema.safeParse({ questionId: "q1", roomCode: "ABC123", reason: "x" })
        .success,
    ).toBe(true);
    expect(
      flagQuestionInputSchema.safeParse({ questionId: "q1", roomCode: null, reason: null }).success,
    ).toBe(true);
  });

  it("rejects a missing question id and an over-long reason", () => {
    expect(flagQuestionInputSchema.safeParse({ questionId: "" }).success).toBe(false);
    expect(
      flagQuestionInputSchema.safeParse({
        questionId: "q1",
        reason: "x".repeat(FLAG_REASON_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("only accepts the three resolutions the admin panel offers", () => {
    for (const r of ["fixed", "removed", "kept"]) {
      expect(flagResolutionSchema.safeParse(r).success).toBe(true);
    }
    expect(flagResolutionSchema.safeParse("deleted").success).toBe(false);
  });
});

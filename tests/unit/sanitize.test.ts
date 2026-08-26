import { describe, expect, it } from "vitest";
import { toSanitisedQuestion, type QuestionForSanitizing } from "@/server/game/sanitize";

const baseFields = {
  id: "q1",
  prompt: "Prompt",
  hint: null,
  categoryName: "Géographie",
  categoryColorToken: "moss" as const,
  difficulty: 3,
  timeLimitS: 20,
  pointsBase: 1000,
  authorUsername: "auteur",
  authorDisplayName: "Auteur",
  authorAvatarSeed: "seed",
};

const SECRET_ANSWER = "REPONSE-SECRETE-JAMAIS-VISIBLE";
const SECRET_ISO3 = "SEC";

describe("toSanitisedQuestion — no answer leakage, per type (brief §14)", () => {
  it("open: never includes acceptedAnswers", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "open",
      acceptedAnswers: [SECRET_ANSWER],
    };
    const sanitised = toSanitisedQuestion(input);
    const json = JSON.stringify(sanitised);
    expect(json).not.toContain(SECRET_ANSWER);
    expect(sanitised).not.toHaveProperty("acceptedAnswers");
  });

  it("mcq: choices are forwarded without isCorrect, only the aggregate multiSelect fact", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "mcq",
      choices: [
        { id: "a", label: "Paris", isCorrect: true },
        { id: "b", label: "Lyon", isCorrect: false },
      ],
    };
    const sanitised = toSanitisedQuestion(input);
    const json = JSON.stringify(sanitised);
    expect(json).not.toContain("isCorrect");
    expect(sanitised.choices).toEqual([
      { id: "a", label: "Paris" },
      { id: "b", label: "Lyon" },
    ]);
    expect(sanitised.multiSelect).toBe(false);
  });

  it("mcq: multiSelect is true when more than one choice is correct, without naming which", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "mcq",
      choices: [
        { id: "a", label: "Paris", isCorrect: true },
        { id: "b", label: "Lyon", isCorrect: true },
        { id: "c", label: "Nice", isCorrect: false },
      ],
    };
    const sanitised = toSanitisedQuestion(input);
    expect(sanitised.multiSelect).toBe(true);
    expect(sanitised.choices).toEqual([
      { id: "a", label: "Paris" },
      { id: "b", label: "Lyon" },
      { id: "c", label: "Nice" },
    ]);
  });

  it("image (mcq mode): choices forwarded without isCorrect", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "image",
      mediaId: "media1",
      answerMode: "mcq",
      choices: [
        { id: "a", label: "Tour Eiffel", isCorrect: true },
        { id: "b", label: "Arc de Triomphe", isCorrect: false },
      ],
    };
    const sanitised = toSanitisedQuestion(input);
    const json = JSON.stringify(sanitised);
    expect(json).not.toContain("isCorrect");
    expect(sanitised.mediaId).toBe("media1");
  });

  it("image (open mode): never includes acceptedAnswers", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "image",
      mediaId: "media1",
      answerMode: "open",
      acceptedAnswers: [SECRET_ANSWER],
    };
    const sanitised = toSanitisedQuestion(input);
    const json = JSON.stringify(sanitised);
    expect(json).not.toContain(SECRET_ANSWER);
    expect(sanitised).not.toHaveProperty("acceptedAnswers");
    expect(sanitised).not.toHaveProperty("choices");
  });

  it.each(["locate_country", "capital_of"] as const)(
    "geo (%s — click-to-answer): never includes targetIso3 or acceptedAnswers",
    (mode) => {
      const input: QuestionForSanitizing = {
        ...baseFields,
        type: "geo",
        acceptedAnswers: [SECRET_ANSWER],
        geo: { mode, targetIso3: SECRET_ISO3, showLabels: false, showNeighbours: true },
      };
      const sanitised = toSanitisedQuestion(input);
      const json = JSON.stringify(sanitised);
      expect(json).not.toContain(SECRET_ISO3);
      expect(json).not.toContain(SECRET_ANSWER);
      expect(sanitised).not.toHaveProperty("targetIso3");
      expect(sanitised).not.toHaveProperty("acceptedAnswers");
      expect(sanitised.revealIso3).toBeUndefined();
      expect(sanitised.geoMode).toBe(mode);
    },
  );

  it.each(["name_country", "find_capital", "name_from_shape"] as const)(
    "geo (%s — visual identification): reveals the target iso3 (the map must show it), still hides acceptedAnswers",
    (mode) => {
      const input: QuestionForSanitizing = {
        ...baseFields,
        type: "geo",
        acceptedAnswers: [SECRET_ANSWER],
        geo: { mode, targetIso3: "PRT", showLabels: false, showNeighbours: true },
      };
      const sanitised = toSanitisedQuestion(input);
      const json = JSON.stringify(sanitised);
      expect(sanitised.revealIso3).toBe("PRT");
      expect(json).not.toContain(SECRET_ANSWER);
      expect(sanitised).not.toHaveProperty("acceptedAnswers");
    },
  );

  it("sort: items are forwarded (labels are the puzzle, not a secret) but never in stored order", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "sort",
      sortItems: [
        { id: "a", label: "Le Parrain", mediaId: null },
        { id: "b", label: "Titanic", mediaId: null },
        { id: "c", label: "Avatar", mediaId: null },
        { id: "d", label: "Avengers: Endgame", mediaId: null },
      ],
    };
    const sanitised = toSanitisedQuestion(input);
    // Same set of items, id-for-id — nothing dropped, nothing invented.
    expect(sanitised.sortItems).toHaveLength(4);
    expect(new Set(sanitised.sortItems?.map((i) => i.id))).toEqual(new Set(["a", "b", "c", "d"]));
    // No field on a sanitised item could tell a client where it belongs — the only place that
    // information exists is question-detail.ts's array order, which is exactly what got shuffled.
    for (const item of sanitised.sortItems ?? []) {
      expect(item).not.toHaveProperty("position");
      expect(item).not.toHaveProperty("correctPosition");
    }
  });

  it("estimation: unit is forwarded, correctValue/tolerance never are", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "estimation",
      estimation: { unit: "bananes" },
    };
    const sanitised = toSanitisedQuestion(input);
    expect(sanitised.estimationUnit).toBe("bananes");
    expect(sanitised).not.toHaveProperty("correctValue");
    expect(sanitised).not.toHaveProperty("toleranceType");
    expect(sanitised).not.toHaveProperty("toleranceValue");
  });

  it("estimation: works with no unit set at all", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "estimation",
      estimation: { unit: null },
    };
    const sanitised = toSanitisedQuestion(input);
    expect(sanitised.estimationUnit).toBeNull();
  });

  it("preserves author credit and shared metadata for every type", () => {
    for (const type of ["open", "mcq", "image", "geo", "sort", "estimation"] as const) {
      const input: QuestionForSanitizing = {
        ...baseFields,
        type,
        mediaId: type === "image" ? "m" : undefined,
        answerMode: type === "image" ? "open" : undefined,
        geo:
          type === "geo"
            ? { mode: "name_country", targetIso3: "XXX", showLabels: true, showNeighbours: true }
            : undefined,
        sortItems: type === "sort" ? [{ id: "a", label: "Un", mediaId: null }] : undefined,
        estimation: type === "estimation" ? { unit: "km" } : undefined,
      };
      const sanitised = toSanitisedQuestion(input);
      expect(sanitised.authorUsername).toBe("auteur");
      expect(sanitised.authorDisplayName).toBe("Auteur");
      expect(sanitised.prompt).toBe("Prompt");
    }
  });
});

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

  it("mcq: choices are forwarded without isCorrect", () => {
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
    expect(json).not.toContain("true");
    expect(sanitised.choices).toEqual([
      { id: "a", label: "Paris" },
      { id: "b", label: "Lyon" },
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

  it("geo: never includes targetIso3 or acceptedAnswers", () => {
    const input: QuestionForSanitizing = {
      ...baseFields,
      type: "geo",
      acceptedAnswers: [SECRET_ANSWER],
      geo: {
        mode: "locate_country",
        targetIso3: SECRET_ISO3,
        showLabels: false,
        showNeighbours: true,
      },
    };
    const sanitised = toSanitisedQuestion(input);
    const json = JSON.stringify(sanitised);
    expect(json).not.toContain(SECRET_ISO3);
    expect(json).not.toContain(SECRET_ANSWER);
    expect(sanitised).not.toHaveProperty("targetIso3");
    expect(sanitised).not.toHaveProperty("acceptedAnswers");
    expect(sanitised.geoMode).toBe("locate_country");
  });

  it("preserves author credit and shared metadata for every type", () => {
    for (const type of ["open", "mcq", "image", "geo"] as const) {
      const input: QuestionForSanitizing = {
        ...baseFields,
        type,
        mediaId: type === "image" ? "m" : undefined,
        answerMode: type === "image" ? "open" : undefined,
        geo:
          type === "geo"
            ? { mode: "name_country", targetIso3: "XXX", showLabels: true, showNeighbours: true }
            : undefined,
      };
      const sanitised = toSanitisedQuestion(input);
      expect(sanitised.authorUsername).toBe("auteur");
      expect(sanitised.authorDisplayName).toBe("Auteur");
      expect(sanitised.prompt).toBe("Prompt");
    }
  });
});

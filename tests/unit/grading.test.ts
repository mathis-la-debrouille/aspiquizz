import { describe, expect, it } from "vitest";
import {
  damerauLevenshtein,
  gradeAnswer,
  matchesAnyVariant,
  normalizeAnswer,
  type GradableGeoQuestion,
  type GradableImageQuestion,
  type GradableMcqQuestion,
  type GradableOpenQuestion,
  type GradableSortQuestion,
  type GradableEstimationQuestion,
} from "@/server/game/grading";

// ---------------------------------------------------------------------------
// normalizeAnswer — accents, hyphens, articles, casing, punctuation
// ---------------------------------------------------------------------------

describe("normalizeAnswer", () => {
  it("strips accents via NFD + combining mark removal", () => {
    expect(normalizeAnswer("café")).toBe("cafe");
    expect(normalizeAnswer("Éléphant")).toBe("elephant");
    expect(normalizeAnswer("côte d'ivoire")).toBe("cote d ivoire");
  });

  it("lowercases and trims", () => {
    expect(normalizeAnswer("  FRANCE  ")).toBe("france");
    expect(normalizeAnswer("Kenya")).toBe("kenya");
  });

  it("strips leading French articles", () => {
    expect(normalizeAnswer("le Portugal")).toBe("portugal");
    expect(normalizeAnswer("la Chine")).toBe("chine");
    expect(normalizeAnswer("les Pays-Bas")).toBe("pays bas");
    expect(normalizeAnswer("l'Autriche")).toBe("autriche");
    expect(normalizeAnswer("l’Autriche")).toBe("autriche"); // curly apostrophe
    expect(normalizeAnswer("the Bahamas")).toBe("bahamas");
  });

  it("replaces hyphens/apostrophes/periods with spaces and collapses whitespace", () => {
    expect(normalizeAnswer("Porto-Novo")).toBe("porto novo");
    expect(normalizeAnswer("Saint-Pierre-et-Miquelon")).toBe("saint pierre et miquelon");
    expect(normalizeAnswer("U.S.A.")).toBe("u s a");
    expect(normalizeAnswer("Abidjan   ")).toBe("abidjan");
  });

  it("removes trailing punctuation", () => {
    expect(normalizeAnswer("France?")).toBe("france");
    expect(normalizeAnswer("Kenya!")).toBe("kenya");
    expect(normalizeAnswer("Chili,")).toBe("chili");
  });

  it("handles empty and whitespace-only input", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer("   ")).toBe("");
    expect(normalizeAnswer("\t\n")).toBe("");
  });

  it("applies article-stripping before punctuation replacement (pipeline order)", () => {
    // "l'" must be recognised as an article using the *raw* apostrophe, before step 4
    // turns every apostrophe into a space.
    expect(normalizeAnswer("l'Union européenne")).toBe("union europeenne");
  });
});

// ---------------------------------------------------------------------------
// damerauLevenshtein — sanity checks on the raw distance function
// ---------------------------------------------------------------------------

describe("damerauLevenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(damerauLevenshtein("bresil", "bresil")).toBe(0);
  });

  it("counts a single substitution as distance 1", () => {
    expect(damerauLevenshtein("chili", "chile")).toBe(1);
  });

  it("counts a single insertion/deletion as distance 1", () => {
    expect(damerauLevenshtein("perou", "perous")).toBe(1);
    expect(damerauLevenshtein("perous", "perou")).toBe(1);
  });

  it("counts an adjacent transposition as distance 1", () => {
    expect(damerauLevenshtein("niger", "nigre")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(damerauLevenshtein("", "")).toBe(0);
    expect(damerauLevenshtein("abc", "")).toBe(3);
    expect(damerauLevenshtein("", "abc")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// matchesAnyVariant — the fuzzy-threshold ladder, brief §7
// ---------------------------------------------------------------------------

describe("matchesAnyVariant — exact matches", () => {
  it("matches an exact normalised match", () => {
    expect(matchesAnyVariant("France", ["France"], false).isCorrect).toBe(true);
  });

  it("matches case- and accent-insensitively", () => {
    expect(matchesAnyVariant("FRANCE", ["france"], false).isCorrect).toBe(true);
    expect(matchesAnyVariant("cote divoire", ["Côte d'Ivoire"], false).isCorrect).toBe(true);
  });

  it("reports which variant matched", () => {
    const result = matchesAnyVariant("kenya", ["Kenya", "République du Kenya"], false);
    expect(result.matchedOn).toBe("Kenya");
  });
});

describe("matchesAnyVariant — under 4 chars requires exact match", () => {
  it("accepts an exact 3-char match", () => {
    expect(matchesAnyVariant("Fidji", ["Fidji"], false).isCorrect).toBe(true);
  });

  it("rejects any typo under 4 chars even with fuzzy matching enabled", () => {
    // "Mali" is 4 chars (falls in the 4-7 bucket); use a genuinely <4-char accepted answer.
    expect(matchesAnyVariant("uk", ["UE"], false).isCorrect).toBe(false);
    expect(matchesAnyVariant("uez", ["UE"], false).isCorrect).toBe(false);
  });
});

describe("matchesAnyVariant — 4-7 chars: threshold 1", () => {
  const accepted = ["Kenya"]; // 5 chars

  it("accepts a 1-typo answer (substitution)", () => {
    expect(matchesAnyVariant("Kenja", accepted, false).isCorrect).toBe(true);
  });

  it("accepts a 1-typo answer (transposition)", () => {
    expect(matchesAnyVariant("Kenay", accepted, false).isCorrect).toBe(true);
  });

  it("rejects a 2-typo answer", () => {
    expect(matchesAnyVariant("Kenjs", accepted, false).isCorrect).toBe(false);
  });
});

describe("matchesAnyVariant — 8-12 chars: threshold 2", () => {
  const accepted = ["Cambodge"]; // 8 chars

  it("accepts a 2-typo answer", () => {
    expect(matchesAnyVariant("Camdodgi", accepted, false).isCorrect).toBe(true);
  });

  it("rejects a 3-typo answer", () => {
    expect(matchesAnyVariant("Camdodgix", accepted, false).isCorrect).toBe(false);
  });
});

describe("matchesAnyVariant — 13+ chars: threshold 3", () => {
  const accepted = ["Turkmenistan"]; // 12 chars — bump to 13+ via a longer one
  const longAccepted = ["Republique tcheque"]; // normalised: "republique tcheque" (18 chars)

  it("uses threshold 2 at exactly 12 chars", () => {
    expect(accepted[0]!.length).toBe(12);
    expect(matchesAnyVariant("Turkmenistcn", accepted, false).isCorrect).toBe(true); // 1 typo, within 2
  });

  it("accepts a 3-typo answer at 13+ chars", () => {
    expect(matchesAnyVariant("Rxpubliqux tchequx", longAccepted, false).isCorrect).toBe(true); // distance 3
  });

  it("rejects a 4-typo answer at 13+ chars", () => {
    expect(matchesAnyVariant("Rxpubliqux tchxqux", longAccepted, false).isCorrect).toBe(false); // distance 4
  });
});

describe("matchesAnyVariant — near-miss false positives that must fail", () => {
  it("Autriche must not match Australie (brief §7 — verified, distance 4 > threshold 2)", () => {
    expect(matchesAnyVariant("Australie", ["Autriche"], false).isCorrect).toBe(false);
    expect(matchesAnyVariant("Autriche", ["Australie"], false).isCorrect).toBe(false);
  });

  it("Chili must not match Chine", () => {
    expect(matchesAnyVariant("Chili", ["Chine"], false).isCorrect).toBe(false);
  });

  it("Bolivie must not match Colombie", () => {
    expect(matchesAnyVariant("Bolivie", ["Colombie"], false).isCorrect).toBe(false);
  });

  it("Niger must not match Nigeria", () => {
    expect(matchesAnyVariant("Niger", ["Nigeria"], false).isCorrect).toBe(false);
  });
});

describe("matchesAnyVariant — strict mode disables fuzzy matching", () => {
  it("rejects a 1-typo answer when strict", () => {
    expect(matchesAnyVariant("Kenja", ["Kenya"], true).isCorrect).toBe(false);
  });

  it("still accepts an exact match when strict", () => {
    expect(matchesAnyVariant("Kenya", ["Kenya"], true).isCorrect).toBe(true);
  });
});

describe("matchesAnyVariant — empty / whitespace input", () => {
  it("rejects empty input", () => {
    expect(matchesAnyVariant("", ["France"], false).isCorrect).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    expect(matchesAnyVariant("   ", ["France"], false).isCorrect).toBe(false);
  });

  it("does not crash on an empty accepted-variant list", () => {
    expect(matchesAnyVariant("France", [], false).isCorrect).toBe(false);
  });
});

describe("matchesAnyVariant — multiple accepted variants", () => {
  const accepted = ["Etats-Unis", "USA", "Etats-Unis d'Amerique"];

  it("matches the primary answer", () => {
    expect(matchesAnyVariant("Etats-Unis", accepted, false).isCorrect).toBe(true);
  });

  it("matches an accepted short variant", () => {
    expect(matchesAnyVariant("usa", accepted, false).isCorrect).toBe(true);
  });

  it("matches a typo against the closest variant", () => {
    expect(matchesAnyVariant("Etats-Unes", accepted, false).isCorrect).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gradeAnswer — per question type
// ---------------------------------------------------------------------------

describe("gradeAnswer — open", () => {
  const question: GradableOpenQuestion = {
    type: "open",
    strict: false,
    acceptedAnswers: ["Yamoussoukro"],
  };

  it("grades a correct open answer", () => {
    expect(gradeAnswer(question, { text: "Yamoussoukro" }).isCorrect).toBe(true);
  });

  it("grades an incorrect open answer", () => {
    expect(gradeAnswer(question, { text: "Abidjan" }).isCorrect).toBe(false);
  });

  it("grades a strict open question exactly", () => {
    const strictQuestion: GradableOpenQuestion = { ...question, strict: true };
    expect(gradeAnswer(strictQuestion, { text: "Yamoussoukro" }).isCorrect).toBe(true);
    expect(gradeAnswer(strictQuestion, { text: "Yamoussokro" }).isCorrect).toBe(false);
  });
});

describe("gradeAnswer — mcq", () => {
  const singleCorrect: GradableMcqQuestion = { type: "mcq", correctChoiceIds: ["b"] };
  const multiCorrect: GradableMcqQuestion = { type: "mcq", correctChoiceIds: ["a", "c"] };

  it("grades a correct single-select answer", () => {
    expect(gradeAnswer(singleCorrect, { choiceIds: ["b"] }).isCorrect).toBe(true);
  });

  it("grades an incorrect single-select answer", () => {
    expect(gradeAnswer(singleCorrect, { choiceIds: ["a"] }).isCorrect).toBe(false);
  });

  it("grades a correct multi-select answer (exact set match)", () => {
    expect(gradeAnswer(multiCorrect, { choiceIds: ["a", "c"] }).isCorrect).toBe(true);
    expect(gradeAnswer(multiCorrect, { choiceIds: ["c", "a"] }).isCorrect).toBe(true); // order-independent
  });

  it("is all-or-nothing for multi-select (partial credit rejected)", () => {
    expect(gradeAnswer(multiCorrect, { choiceIds: ["a"] }).isCorrect).toBe(false);
    expect(gradeAnswer(multiCorrect, { choiceIds: ["a", "b", "c"] }).isCorrect).toBe(false);
  });

  it("rejects an empty selection", () => {
    expect(gradeAnswer(singleCorrect, { choiceIds: [] }).isCorrect).toBe(false);
  });
});

describe("gradeAnswer — image (mcq or open answer mode)", () => {
  const imageMcq: GradableImageQuestion = {
    type: "image",
    answerMode: "mcq",
    strict: false,
    correctChoiceIds: ["x"],
  };
  const imageOpen: GradableImageQuestion = {
    type: "image",
    answerMode: "open",
    strict: false,
    acceptedAnswers: ["Tour Eiffel"],
  };

  it("grades image-mcq like mcq", () => {
    expect(gradeAnswer(imageMcq, { choiceIds: ["x"] }).isCorrect).toBe(true);
    expect(gradeAnswer(imageMcq, { choiceIds: ["y"] }).isCorrect).toBe(false);
  });

  it("grades image-open like open", () => {
    expect(gradeAnswer(imageOpen, { text: "Tour Eiffel" }).isCorrect).toBe(true);
    expect(gradeAnswer(imageOpen, { text: "Statue de la Liberte" }).isCorrect).toBe(false);
  });
});

describe("gradeAnswer — geo: locate_country / capital_of (iso3 match)", () => {
  const locate: GradableGeoQuestion = {
    type: "geo",
    geoMode: "locate_country",
    strict: false,
    targetIso3: "PRT",
  };
  const capitalOf: GradableGeoQuestion = {
    type: "geo",
    geoMode: "capital_of",
    strict: false,
    targetIso3: "KEN",
  };

  it("grades locate_country by exact iso3 match", () => {
    expect(gradeAnswer(locate, { iso3: "PRT" }).isCorrect).toBe(true);
    expect(gradeAnswer(locate, { iso3: "ESP" }).isCorrect).toBe(false);
  });

  it("grades capital_of by exact iso3 match", () => {
    expect(gradeAnswer(capitalOf, { iso3: "KEN" }).isCorrect).toBe(true);
    expect(gradeAnswer(capitalOf, { iso3: "TZA" }).isCorrect).toBe(false);
  });

  it("rejects a missing iso3", () => {
    expect(gradeAnswer(locate, {}).isCorrect).toBe(false);
  });
});

describe("gradeAnswer — geo: name_country / name_from_shape / find_capital (text match)", () => {
  const nameCountry: GradableGeoQuestion = {
    type: "geo",
    geoMode: "name_country",
    strict: false,
    targetIso3: "LSO",
    acceptedAnswers: ["Lesotho"],
  };
  const nameFromShape: GradableGeoQuestion = {
    type: "geo",
    geoMode: "name_from_shape",
    strict: false,
    targetIso3: "FRA",
    acceptedAnswers: ["France"],
  };
  const findCapital: GradableGeoQuestion = {
    type: "geo",
    geoMode: "find_capital",
    strict: false,
    targetIso3: "KEN",
    acceptedAnswers: ["Nairobi"],
  };

  it("grades name_country by fuzzy text match", () => {
    expect(gradeAnswer(nameCountry, { text: "Lesotho" }).isCorrect).toBe(true);
    expect(gradeAnswer(nameCountry, { text: "Lesoto" }).isCorrect).toBe(true); // 1 typo
    expect(gradeAnswer(nameCountry, { text: "Swaziland" }).isCorrect).toBe(false);
  });

  it("grades name_from_shape by fuzzy text match", () => {
    expect(gradeAnswer(nameFromShape, { text: "France" }).isCorrect).toBe(true);
    expect(gradeAnswer(nameFromShape, { text: "la France" }).isCorrect).toBe(true); // article stripped
    expect(gradeAnswer(nameFromShape, { text: "Allemagne" }).isCorrect).toBe(false);
  });

  it("grades find_capital by fuzzy text match", () => {
    expect(gradeAnswer(findCapital, { text: "Nairobi" }).isCorrect).toBe(true);
    expect(gradeAnswer(findCapital, { text: "Nairoby" }).isCorrect).toBe(true); // 1 typo
    expect(gradeAnswer(findCapital, { text: "Mombasa" }).isCorrect).toBe(false);
  });

  it("respects strict mode for geo text answers (e.g. IATA-style exact codes)", () => {
    const strictGeo: GradableGeoQuestion = { ...findCapital, strict: true };
    expect(gradeAnswer(strictGeo, { text: "Nairoby" }).isCorrect).toBe(false);
    expect(gradeAnswer(strictGeo, { text: "Nairobi" }).isCorrect).toBe(true);
  });
});

describe("gradeAnswer — sort", () => {
  const question: GradableSortQuestion = {
    type: "sort",
    correctOrder: ["a", "b", "c", "d"],
  };

  it("correct only on an exact match, in order", () => {
    expect(gradeAnswer(question, { order: ["a", "b", "c", "d"] }).isCorrect).toBe(true);
  });

  it("wrong on a single adjacent swap — all-or-nothing, same as every other type's grader", () => {
    expect(gradeAnswer(question, { order: ["b", "a", "c", "d"] }).isCorrect).toBe(false);
  });

  it("wrong on a shorter or longer submission (never throws)", () => {
    expect(gradeAnswer(question, { order: ["a", "b", "c"] }).isCorrect).toBe(false);
    expect(gradeAnswer(question, { order: ["a", "b", "c", "d", "e"] }).isCorrect).toBe(false);
  });

  it("wrong, not a crash, on no answer at all", () => {
    expect(gradeAnswer(question, {}).isCorrect).toBe(false);
  });
});

describe("gradeAnswer — estimation", () => {
  const absolute: GradableEstimationQuestion = {
    type: "estimation",
    correctValue: 400,
    toleranceType: "absolute",
    toleranceValue: 50,
  };

  it("exact guess: correct, suggests full credit", () => {
    const result = gradeAnswer(absolute, { value: 400 });
    expect(result.isCorrect).toBe(true);
    expect(result.suggestedFraction).toBe(1);
  });

  it("within tolerance: correct, suggested fraction scales linearly with distance", () => {
    const result = gradeAnswer(absolute, { value: 425 }); // 25 off, half the 50 tolerance
    expect(result.isCorrect).toBe(true);
    expect(result.suggestedFraction).toBeCloseTo(0.5);
  });

  it("right at the tolerance boundary: still correct, suggests no credit", () => {
    const result = gradeAnswer(absolute, { value: 450 });
    expect(result.isCorrect).toBe(true);
    expect(result.suggestedFraction).toBeCloseTo(0);
  });

  it("outside tolerance: wrong, suggests no credit", () => {
    const result = gradeAnswer(absolute, { value: 451 });
    expect(result.isCorrect).toBe(false);
    expect(result.suggestedFraction).toBe(0);
  });

  it("nearer guess earns a strictly higher suggested fraction — 'nearest earns most'", () => {
    const near = gradeAnswer(absolute, { value: 410 });
    const far = gradeAnswer(absolute, { value: 440 });
    expect(near.suggestedFraction!).toBeGreaterThan(far.suggestedFraction!);
  });

  it("percentage tolerance scales with the correct value, not a fixed amount", () => {
    const question: GradableEstimationQuestion = {
      type: "estimation",
      correctValue: 8_000_000,
      toleranceType: "percentage",
      toleranceValue: 10, // ±10% of 8,000,000 = ±800,000
    };
    expect(gradeAnswer(question, { value: 8_700_000 }).isCorrect).toBe(true);
    expect(gradeAnswer(question, { value: 8_900_000 }).isCorrect).toBe(false);
  });

  it("scoring is independent per player — never compares against another player's guess", () => {
    // No mechanism in the function signature even allows a second player's answer in; this test
    // exists to pin that down as a deliberate design choice, not an oversight.
    const a = gradeAnswer(absolute, { value: 410 });
    const b = gradeAnswer(absolute, { value: 410 });
    expect(a).toEqual(b);
  });

  it("wrong, not a crash, on no answer at all or a non-finite value", () => {
    expect(gradeAnswer(absolute, {}).isCorrect).toBe(false);
    expect(gradeAnswer(absolute, { value: NaN }).isCorrect).toBe(false);
  });

  it("a zero-width tolerance requires an exact match", () => {
    const question: GradableEstimationQuestion = {
      type: "estimation",
      correctValue: 10,
      toleranceType: "absolute",
      toleranceValue: 0,
    };
    expect(gradeAnswer(question, { value: 10 }).isCorrect).toBe(true);
    expect(gradeAnswer(question, { value: 11 }).isCorrect).toBe(false);
  });
});

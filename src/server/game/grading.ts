/**
 * Pure, dependency-free answer grading — brief §7. No DB, no I/O, so it's
 * trivially unit-testable and safe to call from both the socket engine and
 * any future offline tooling. Keep it that way: don't import from
 * src/server/db or anything else with side effects.
 */

export type GeoMode =
  | "locate_country"
  | "name_country"
  | "find_capital"
  | "capital_of"
  | "name_from_shape"
  | "name_from_flag";

export interface GradableOpenQuestion {
  type: "open";
  strict: boolean;
  acceptedAnswers: string[];
}

export interface GradableMcqQuestion {
  type: "mcq";
  correctChoiceIds: string[];
}

export interface GradableImageQuestion {
  type: "image";
  answerMode: "mcq" | "open";
  strict: boolean;
  acceptedAnswers?: string[];
  correctChoiceIds?: string[];
}

export interface GradableGeoQuestion {
  type: "geo";
  geoMode: GeoMode;
  strict: boolean;
  targetIso3: string;
  /** Accepted text for name_country / name_from_shape / name_from_flag / find_capital. */
  acceptedAnswers?: string[];
}

export interface GradableSortQuestion {
  type: "sort";
  /** Item ids, top to bottom, in the CORRECT order. */
  correctOrder: string[];
}

export interface GradableEstimationQuestion {
  type: "estimation";
  correctValue: number;
  toleranceType: "absolute" | "percentage";
  /** Same unit as correctValue when "absolute"; a 0-100 percentage of |correctValue| when
   *  "percentage". Always positive. */
  toleranceValue: number;
}

export type GradableQuestion =
  | GradableOpenQuestion
  | GradableMcqQuestion
  | GradableImageQuestion
  | GradableGeoQuestion
  | GradableSortQuestion
  | GradableEstimationQuestion;

export interface OpenAnswerPayload {
  text: string;
}
export interface McqAnswerPayload {
  choiceIds: string[];
}
export interface GeoAnswerPayload {
  iso3?: string;
  text?: string;
}
export interface SortAnswerPayload {
  order: string[];
}
export interface EstimationAnswerPayload {
  value: number;
}
export type AnswerPayload =
  | OpenAnswerPayload
  | McqAnswerPayload
  | GeoAnswerPayload
  | SortAnswerPayload
  | EstimationAnswerPayload;

export interface GradeResult {
  isCorrect: boolean;
  /** Which accepted variant matched, for debugging — undefined for MCQ/iso3 grading. */
  matchedOn?: string;
  /** 0-1: how much of full credit the grader itself suggests, before the correction phase's
   *  human review. Every type but estimation is binary, so omitting this is the same as
   *  `isCorrect ? 1 : 0` (engine.ts's default) — only estimation's distance-based partial credit
   *  ("nearest earns most points", within the author's own tolerance) needs to set this
   *  explicitly, scaling linearly from 1 at an exact guess down to 0 right at the tolerance
   *  boundary. Still a *suggestion*: the correction phase's slider can override it either way,
   *  same as every other type's binary suggestion. */
  suggestedFraction?: number;
}

// ---------------------------------------------------------------------------
// Text normalisation — brief §7, exact pipeline order matters.
// ---------------------------------------------------------------------------

const LEADING_ARTICLE = /^(le |la |les |l['’]|the )/;
const PUNCT_TO_SPACE = /[-'’.]/g;
const TRAILING_PUNCT = /[!?,;:]+$/;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function normalizeAnswer(input: string): string {
  let s = input.normalize("NFD").replace(COMBINING_MARKS, "");
  s = s.toLowerCase().trim();
  s = s.replace(LEADING_ARTICLE, "");
  s = s.replace(PUNCT_TO_SPACE, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(TRAILING_PUNCT, "");
  return s;
}

// ---------------------------------------------------------------------------
// Damerau-Levenshtein (optimal string alignment variant — single adjacent
// transposition allowed). Pure DP, no dependency.
// ---------------------------------------------------------------------------

export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i]![0] = i;
  for (let j = 0; j <= bl; j++) d[0]![j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        d[i - 1]![j]! + 1, // deletion
        d[i]![j - 1]! + 1, // insertion
        d[i - 1]![j - 1]! + cost, // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1] &&
        a[i - 1] !== a[i - 2] // adjacent transposition, not a same-char no-op
      ) {
        value = Math.min(value, d[i - 2]![j - 2]! + cost);
      }
      d[i]![j] = value;
    }
  }
  return d[al]![bl]!;
}

/** Brief §7: exact match under 4 chars, else a length-scaled edit-distance tolerance. */
function fuzzyThreshold(length: number): number {
  if (length < 4) return 0;
  if (length <= 7) return 1;
  if (length <= 12) return 2;
  return 3;
}

export function matchesAnyVariant(
  rawInput: string,
  acceptedVariants: string[],
  strict: boolean,
): GradeResult {
  const input = normalizeAnswer(rawInput);
  if (input.length === 0) return { isCorrect: false };

  const normalizedVariants = acceptedVariants.map((v) => ({
    raw: v,
    normalized: normalizeAnswer(v),
  }));

  for (const variant of normalizedVariants) {
    if (variant.normalized.length > 0 && variant.normalized === input) {
      return { isCorrect: true, matchedOn: variant.raw };
    }
  }

  if (strict) return { isCorrect: false };

  for (const variant of normalizedVariants) {
    if (variant.normalized.length === 0) continue;
    const threshold = fuzzyThreshold(variant.normalized.length);
    if (threshold === 0) continue;
    if (damerauLevenshtein(input, variant.normalized) <= threshold) {
      return { isCorrect: true, matchedOn: variant.raw };
    }
  }

  return { isCorrect: false };
}

// ---------------------------------------------------------------------------
// Per-type grading
// ---------------------------------------------------------------------------

function isMcqPayload(payload: AnswerPayload): payload is McqAnswerPayload {
  return Array.isArray((payload as McqAnswerPayload).choiceIds);
}

function gradeChoiceSet(chosenIds: string[], correctIds: string[]): boolean {
  if (chosenIds.length !== correctIds.length) return false;
  const correctSet = new Set(correctIds);
  return chosenIds.every((id) => correctSet.has(id));
}

export function gradeAnswer(question: GradableQuestion, payload: AnswerPayload): GradeResult {
  switch (question.type) {
    case "open": {
      const text = "text" in payload ? payload.text : "";
      return matchesAnyVariant(text ?? "", question.acceptedAnswers, question.strict);
    }

    case "mcq": {
      const choiceIds = isMcqPayload(payload) ? payload.choiceIds : [];
      return { isCorrect: gradeChoiceSet(choiceIds, question.correctChoiceIds) };
    }

    case "image": {
      if (question.answerMode === "mcq") {
        const choiceIds = isMcqPayload(payload) ? payload.choiceIds : [];
        return { isCorrect: gradeChoiceSet(choiceIds, question.correctChoiceIds ?? []) };
      }
      const text = "text" in payload ? payload.text : "";
      return matchesAnyVariant(text ?? "", question.acceptedAnswers ?? [], question.strict);
    }

    case "geo": {
      const geoPayload = payload as GeoAnswerPayload;
      switch (question.geoMode) {
        case "locate_country":
        case "capital_of":
          return { isCorrect: geoPayload.iso3 === question.targetIso3 };
        case "name_country":
        case "name_from_shape":
        case "name_from_flag":
        case "find_capital":
          return matchesAnyVariant(
            geoPayload.text ?? "",
            question.acceptedAnswers ?? [],
            question.strict,
          );
      }
    }

    case "sort": {
      const order = "order" in payload ? (payload.order ?? []) : [];
      // All-or-nothing, same as every other type's auto-grader — a swapped adjacent pair is
      // still "wrong" here, exactly like a one-letter typo is still "wrong" for exact-match MCQ.
      // The correction phase's slider is where "3 of 4 in the right spot" earns partial credit.
      const isCorrect =
        order.length === question.correctOrder.length &&
        order.every((id, i) => id === question.correctOrder[i]);
      return { isCorrect };
    }

    case "estimation": {
      const raw = "value" in payload ? payload.value : undefined;
      if (raw === undefined || !Number.isFinite(raw)) return { isCorrect: false };

      const distance = Math.abs(raw - question.correctValue);
      const toleranceAbs =
        question.toleranceType === "percentage"
          ? (Math.abs(question.correctValue) * question.toleranceValue) / 100
          : question.toleranceValue;

      // A zero-width tolerance (author set 0, or a percentage of a zero correct value) means
      // only an exact match counts — the fraction math below would otherwise divide by zero.
      if (toleranceAbs <= 0) {
        const exact = distance === 0;
        return { isCorrect: exact, suggestedFraction: exact ? 1 : 0 };
      }

      const isCorrect = distance <= toleranceAbs;
      // Linear falloff: an exact guess suggests full credit, a guess right at the tolerance
      // boundary suggests none — "nearest earns most points" is just what this curve produces,
      // not a comparison against any other player's guess (each player is scored independently).
      const suggestedFraction = isCorrect ? Math.max(0, 1 - distance / toleranceAbs) : 0;
      return { isCorrect, suggestedFraction };
    }
  }
}

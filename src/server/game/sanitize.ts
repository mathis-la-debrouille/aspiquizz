import type { AnswerMode, ColorToken, GeoMode, QuestionType } from "@/server/db/schema";

/**
 * The explicit whitelist boundary for "no correct answer reaches the client
 * before reveal" (brief §2/§11.3). `QuestionForSanitizing` deliberately
 * carries the answer-bearing fields (isCorrect, targetIso3, …) so callers
 * can pass the full DB row straight through — `toSanitisedQuestion` is the
 * only place that's allowed to read them, and `SanitisedQuestion`'s type
 * structurally has nowhere to put the ones that don't belong. See
 * tests/unit/sanitize.test.ts.
 *
 * Both `mcq` choices and `sort` items are shuffled here. Their stored order is the author's,
 * and the author writes the right answer first — so passing the stored order through is a
 * straight answer leak, just a less obvious one than sending `isCorrect`.
 *
 * Geo is the one type with a real subtlety: for the three "visual
 * identification" modes (name_country, find_capital, name_from_shape,
 * name_from_flag) the
 * map has to *show* the target country to pose the question at all — a
 * highlighted shape or silhouette is the puzzle, not a leaked answer. Only
 * the two "click to answer" modes (locate_country, capital_of) must hide
 * `targetIso3`, since sending it there would let a client trivially
 * auto-click the correct country instead of a human finding it.
 */

const GEO_MODES_REVEALING_TARGET: readonly GeoMode[] = [
  "name_country",
  "find_capital",
  "name_from_shape",
  // Same reasoning as name_from_shape: the client cannot render the flag without
  // knowing which country's flag it is. The flag IS the puzzle.
  "name_from_flag",
];

export interface RawChoice {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface QuestionForSanitizing {
  /** Room setting (config.mcqAsOpen): present an mcq question as a free-text one. The choices
   *  are then omitted entirely rather than merely unused — sending four options a client could
   *  read is most of the answer. */
  asFreeText?: boolean;
  id: string;
  type: QuestionType;
  prompt: string;
  hint: string | null;
  categoryName: string;
  categoryColorToken: ColorToken;
  difficulty: number;
  timeLimitS: number;
  pointsBase: number;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarSeed: string;
  /** open / image(open) only — never forwarded. */
  acceptedAnswers?: string[];
  /** mcq / image(mcq) only — isCorrect never forwarded, only the aggregate multiSelect fact. */
  choices?: RawChoice[];
  /** image only. */
  mediaId?: string;
  answerMode?: AnswerMode;
  /** geo only — targetIso3 forwarded only for the visual-identification modes, see above. */
  geo?: {
    mode: GeoMode;
    targetIso3: string;
    showLabels: boolean;
    showNeighbours: boolean;
  };
  /** sort only — always in the CORRECT order here; toSanitisedQuestion shuffles before this
   *  reaches SanitisedQuestion, since the array's own order would otherwise just be the answer. */
  sortItems?: { id: string; label: string; mediaId: string | null }[];
  /** estimation only — `unit` alone: the question's framing ("bananes", "habitants"), never the
   *  answer-bearing correctValue/tolerance, which stay server-side until reveal. */
  estimation?: { unit: string | null };
}

export interface SanitisedChoice {
  id: string;
  label: string;
}

export interface SanitisedQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  hint: string | null;
  categoryName: string;
  categoryColorToken: ColorToken;
  difficulty: number;
  timeLimitS: number;
  pointsBase: number;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarSeed: string;
  choices?: SanitisedChoice[];
  /** Whether more than one choice is correct — brief §6.2's "Plusieurs réponses" UI needs to
   *  know this *before* the player answers, without knowing which ones. */
  multiSelect?: boolean;
  mediaId?: string;
  answerMode?: AnswerMode;
  geoMode?: GeoMode;
  /** Only present for the visual-identification geo modes — see module doc comment. */
  revealIso3?: string;
  showLabels?: boolean;
  showNeighbours?: boolean;
  /** sort only — shuffled here, never the stored (correct) order. */
  sortItems?: SanitisedSortItem[];
  /** estimation only — the question's framing, never the answer. */
  estimationUnit?: string | null;
  /** mcq / image(mcq) in the room's free-text mode: `choices` is absent entirely and the
   *  client renders a text input. */
  asFreeText?: boolean;
}

export interface SanitisedSortItem {
  id: string;
  label: string;
  mediaId: string | null;
}

function stripChoice(choice: RawChoice): SanitisedChoice {
  return { id: choice.id, label: choice.label };
}

function isMultiSelect(choices: RawChoice[]): boolean {
  return choices.filter((c) => c.isCorrect).length > 1;
}

/** Fisher-Yates — unbiased, and the only shuffle worth using here: `.sort(() => Math.random() -
 *  0.5)` is the common broken alternative, not a uniform permutation. Never mutates its input;
 *  the caller (question-detail.ts) hands over the correct-order array, so a caller that also
 *  held a reference to it must not see it silently reordered underneath it. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function toSanitisedQuestion(q: QuestionForSanitizing): SanitisedQuestion {
  const base: SanitisedQuestion = {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    hint: q.hint,
    categoryName: q.categoryName,
    categoryColorToken: q.categoryColorToken,
    difficulty: q.difficulty,
    timeLimitS: q.timeLimitS,
    pointsBase: q.pointsBase,
    authorUsername: q.authorUsername,
    authorDisplayName: q.authorDisplayName,
    authorAvatarSeed: q.authorAvatarSeed,
  };

  switch (q.type) {
    case "open":
      return base;

    case "mcq":
      // In the room's free-text mode the choices don't travel at all. Omitting them is the
      // point: four options on screen is most of the answer, so "hidden by the client" would
      // be no protection whatsoever.
      if (q.asFreeText) return { ...base, asFreeText: true };
      // Shuffled, for the same reason sort's items are: `question_choices.position` is the
      // order the author wrote them in, and every importer writes the correct one first
      // ("First entry is the correct one" — seed-imported-questions.ts). Sending that order
      // straight through meant the answer sat in slot 1 on all 2000-odd questions, and the
      // game was "always click top-left". Grading is by choice id, so the display order is
      // free to move.
      return {
        ...base,
        choices: shuffled((q.choices ?? []).map(stripChoice)),
        multiSelect: isMultiSelect(q.choices ?? []),
      };

    case "image":
      if (q.asFreeText && q.answerMode === "mcq") {
        return { ...base, mediaId: q.mediaId, answerMode: "open", asFreeText: true };
      }
      return {
        ...base,
        mediaId: q.mediaId,
        answerMode: q.answerMode,
        ...(q.answerMode === "mcq"
          ? {
              choices: shuffled((q.choices ?? []).map(stripChoice)),
              multiSelect: isMultiSelect(q.choices ?? []),
            }
          : {}),
      };

    case "geo": {
      const revealTarget = q.geo && GEO_MODES_REVEALING_TARGET.includes(q.geo.mode);
      return {
        ...base,
        geoMode: q.geo?.mode,
        revealIso3: revealTarget ? q.geo?.targetIso3 : undefined,
        showLabels: q.geo?.showLabels,
        showNeighbours: q.geo?.showNeighbours,
      };
    }

    case "sort":
      // The one place the shuffle happens — every caller downstream (the client, the
      // correction-phase item lookup) only ever sees this scrambled order, never the stored one.
      return { ...base, sortItems: shuffled(q.sortItems ?? []) };

    case "estimation":
      // correctValue/toleranceType/toleranceValue never appear on `base` or here — they simply
      // have nowhere to go on SanitisedQuestion, the same structural guarantee sort's correct
      // order relies on.
      return { ...base, estimationUnit: q.estimation?.unit ?? null };
  }
}

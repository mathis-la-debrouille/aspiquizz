import type { AnswerMode, ColorToken, GeoMode, QuestionType } from "@/server/db/schema";

/**
 * The explicit whitelist boundary for "no correct answer reaches the client
 * before reveal" (brief §2/§11.3). `QuestionForSanitizing` deliberately
 * carries the answer-bearing fields (isCorrect, targetIso3, …) so callers
 * can pass the full DB row straight through — `toSanitisedQuestion` is the
 * only place that's allowed to read them, and `SanitisedQuestion`'s type
 * structurally has nowhere to put them. See tests/unit/sanitize.test.ts.
 */

export interface RawChoice {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface QuestionForSanitizing {
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
  /** mcq / image(mcq) only — isCorrect never forwarded. */
  choices?: RawChoice[];
  /** image only. */
  mediaId?: string;
  answerMode?: AnswerMode;
  /** geo only — targetIso3 never forwarded. */
  geo?: {
    mode: GeoMode;
    targetIso3: string;
    showLabels: boolean;
    showNeighbours: boolean;
  };
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
  mediaId?: string;
  answerMode?: AnswerMode;
  geoMode?: GeoMode;
  showLabels?: boolean;
  showNeighbours?: boolean;
}

function stripChoice(choice: RawChoice): SanitisedChoice {
  return { id: choice.id, label: choice.label };
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
      return { ...base, choices: (q.choices ?? []).map(stripChoice) };

    case "image":
      return {
        ...base,
        mediaId: q.mediaId,
        answerMode: q.answerMode,
        ...(q.answerMode === "mcq" ? { choices: (q.choices ?? []).map(stripChoice) } : {}),
      };

    case "geo":
      return {
        ...base,
        geoMode: q.geo?.mode,
        showLabels: q.geo?.showLabels,
        showNeighbours: q.geo?.showNeighbours,
      };
  }
}

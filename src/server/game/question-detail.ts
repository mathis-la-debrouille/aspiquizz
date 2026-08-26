import { eq, asc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  questions,
  questionChoices,
  questionOpenAnswers,
  questionGeo,
  questionSortItems,
  questionEstimation,
  categories,
  users,
  type AnswerMode,
  type ColorToken,
  type QuestionType,
  type QuestionStatus,
  type EstimationToleranceType,
} from "@/server/db/schema";
import { toSanitisedQuestion, type SanitisedQuestion } from "@/server/game/sanitize";
import { maxPointsFor } from "@/server/game/scoring";
import type { GradableQuestion } from "@/server/game/grading";

export interface FullQuestionDetail {
  id: string;
  type: QuestionType;
  prompt: string;
  hint: string | null;
  explanation: string | null;
  categoryId: string;
  categoryName: string;
  categoryColorToken: ColorToken;
  difficulty: number;
  pointsBase: number;
  status: QuestionStatus;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarSeed: string;
  mediaId: string | null;
  answerMode: AnswerMode | null;
  strict: boolean;
  choices: { id: string; label: string; isCorrect: boolean }[];
  openAnswers: string[];
  /** The canonical answers only, without spelling variants — what the reveal shows.
   *  Grading still uses the full openAnswers list. */
  primaryAnswers: string[];
  geo: {
    mode:
      | "locate_country"
      | "name_country"
      | "find_capital"
      | "capital_of"
      | "name_from_shape"
      | "name_from_flag";
    targetIso3: string;
    showLabels: boolean;
    showNeighbours: boolean;
  } | null;
  /** sort only — stored/returned in the CORRECT order (position asc). Never handed to a client
   *  that hasn't reached reveal: toSanitised shuffles before it leaves this module. */
  sortItems: { id: string; label: string; mediaId: string | null }[];
  /** estimation only — null for every other type. Answer-bearing fields (correctValue,
   *  tolerance*) never reach toSanitised's output; only `unit` does. */
  estimation: {
    correctValue: number;
    toleranceType: EstimationToleranceType;
    toleranceValue: number;
    unit: string | null;
  } | null;
}

/** Also the read side of edit mode (Addendum A.1's /creer/question/[id]) — one query, not a
 *  separate near-duplicate, since the shape it needs (status/authorId included below) is a
 *  strict superset of what the live game loop reads. */
export async function getFullQuestionDetail(
  questionId: string,
): Promise<FullQuestionDetail | null> {
  const rows = await db
    .select({
      id: questions.id,
      type: questions.type,
      prompt: questions.prompt,
      hint: questions.hint,
      explanation: questions.explanation,
      categoryId: questions.categoryId,
      categoryName: categories.name,
      categoryColorToken: categories.colorToken,
      difficulty: questions.difficulty,
      pointsBase: questions.pointsBase,
      status: questions.status,
      authorId: questions.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarSeed: users.avatarSeed,
      mediaId: questions.mediaId,
      answerMode: questions.answerMode,
      strict: questions.strict,
    })
    .from(questions)
    .innerJoin(categories, eq(questions.categoryId, categories.id))
    .innerJoin(users, eq(questions.authorId, users.id))
    .where(eq(questions.id, questionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [choices, openAnswers, geoRows, sortItems, estimationRows] = await Promise.all([
    db
      .select({
        id: questionChoices.id,
        label: questionChoices.label,
        isCorrect: questionChoices.isCorrect,
      })
      .from(questionChoices)
      .where(eq(questionChoices.questionId, questionId))
      .orderBy(asc(questionChoices.position)),
    db
      .select({ value: questionOpenAnswers.value, isPrimary: questionOpenAnswers.isPrimary })
      .from(questionOpenAnswers)
      .where(eq(questionOpenAnswers.questionId, questionId)),
    db.select().from(questionGeo).where(eq(questionGeo.questionId, questionId)).limit(1),
    db
      .select({
        id: questionSortItems.id,
        label: questionSortItems.label,
        mediaId: questionSortItems.mediaId,
      })
      .from(questionSortItems)
      .where(eq(questionSortItems.questionId, questionId))
      .orderBy(asc(questionSortItems.position)),
    db
      .select({
        correctValue: questionEstimation.correctValue,
        toleranceType: questionEstimation.toleranceType,
        toleranceValue: questionEstimation.toleranceValue,
        unit: questionEstimation.unit,
      })
      .from(questionEstimation)
      .where(eq(questionEstimation.questionId, questionId))
      .limit(1),
  ]);

  const geoRow = geoRows[0];
  const estimationRow = estimationRows[0];

  return {
    ...row,
    choices,
    openAnswers: openAnswers.map((a) => a.value),
    primaryAnswers: openAnswers.filter((a) => a.isPrimary).map((a) => a.value),
    geo: geoRow
      ? {
          mode: geoRow.mode,
          targetIso3: geoRow.targetIso3,
          showLabels: geoRow.showLabels,
          showNeighbours: geoRow.showNeighbours,
        }
      : null,
    sortItems,
    estimation: estimationRow ?? null,
  };
}

/** `timeLimitS` is the room's resolved value (room_questions.time_limit_s), not a property of
 *  the question itself — passed in explicitly by the caller (engine.ts, from `frozen.timeLimitS`)
 *  rather than read off `detail`, which no longer carries one at all (Addendum B.2). */
export function toSanitised(
  detail: FullQuestionDetail,
  timeLimitS: number,
  asFreeText = false,
): SanitisedQuestion {
  return toSanitisedQuestion({
    asFreeText,
    id: detail.id,
    type: detail.type,
    prompt: detail.prompt,
    hint: detail.hint,
    categoryName: detail.categoryName,
    categoryColorToken: detail.categoryColorToken,
    difficulty: detail.difficulty,
    timeLimitS,
    // What the question is worth at full marks: its difficulty tier, straight up. Not the
    // stored questions.points_base column (1000 on every row, so the whole 1-5 scale used to be
    // decorative). Derived in one place so the client display and the engine's scoring agree.
    pointsBase: maxPointsFor(detail.difficulty),
    authorUsername: detail.authorUsername,
    authorDisplayName: detail.authorDisplayName,
    authorAvatarSeed: detail.authorAvatarSeed,
    mediaId: detail.mediaId ?? undefined,
    answerMode: detail.answerMode ?? undefined,
    choices: detail.choices,
    geo: detail.geo ?? undefined,
    sortItems: detail.type === "sort" ? detail.sortItems : undefined,
    estimation:
      detail.type === "estimation" ? { unit: detail.estimation?.unit ?? null } : undefined,
  });
}

/**
 * `asFreeText` is the room's mcqAsOpen setting. An mcq question then grades as an open one
 * against the labels of its correct choices — which is also why the fuzzy matcher matters here:
 * a player typing "glock 18" for "Le Glock-18" is right, and only normalizeAnswer knows that.
 */
export function toGradable(detail: FullQuestionDetail, asFreeText = false): GradableQuestion {
  const correctLabels = () => detail.choices.filter((c) => c.isCorrect).map((c) => c.label);
  switch (detail.type) {
    case "open":
      return { type: "open", strict: detail.strict, acceptedAnswers: detail.openAnswers };
    case "mcq":
      if (asFreeText) {
        // Never strict: the choice labels were written to be *read*, not typed, so they carry
        // articles and punctuation a player has no reason to reproduce.
        return { type: "open", strict: false, acceptedAnswers: correctLabels() };
      }
      return {
        type: "mcq",
        correctChoiceIds: detail.choices.filter((c) => c.isCorrect).map((c) => c.id),
      };
    case "image":
      if (asFreeText && detail.answerMode === "mcq") {
        return { type: "open", strict: false, acceptedAnswers: correctLabels() };
      }
      return detail.answerMode === "mcq"
        ? {
            type: "image",
            answerMode: "mcq",
            strict: detail.strict,
            correctChoiceIds: detail.choices.filter((c) => c.isCorrect).map((c) => c.id),
          }
        : {
            type: "image",
            answerMode: "open",
            strict: detail.strict,
            acceptedAnswers: detail.openAnswers,
          };
    case "geo":
      if (!detail.geo) throw new Error(`geo question ${detail.id} has no question_geo row`);
      return {
        type: "geo",
        geoMode: detail.geo.mode,
        strict: detail.strict,
        targetIso3: detail.geo.targetIso3,
        acceptedAnswers: detail.openAnswers,
      };
    case "sort":
      // sortItems is already ordered by position asc (the query orderBy), i.e. already the
      // correct order — mapping straight to ids is all this needs.
      return { type: "sort", correctOrder: detail.sortItems.map((i) => i.id) };
    case "estimation":
      if (!detail.estimation) {
        throw new Error(`estimation question ${detail.id} has no question_estimation row`);
      }
      return {
        type: "estimation",
        correctValue: detail.estimation.correctValue,
        toleranceType: detail.estimation.toleranceType,
        toleranceValue: detail.estimation.toleranceValue,
      };
  }
}

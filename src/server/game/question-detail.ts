import { eq, asc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  questions,
  questionChoices,
  questionOpenAnswers,
  questionGeo,
  categories,
  users,
  type AnswerMode,
  type ColorToken,
  type QuestionType,
  type QuestionStatus,
} from "@/server/db/schema";
import { toSanitisedQuestion, type SanitisedQuestion } from "@/server/game/sanitize";
import { pointsForDifficulty } from "@/server/game/scoring";
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
  geo: {
    mode: "locate_country" | "name_country" | "find_capital" | "capital_of" | "name_from_shape";
    targetIso3: string;
    showLabels: boolean;
    showNeighbours: boolean;
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

  const [choices, openAnswers, geoRows] = await Promise.all([
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
      .select({ value: questionOpenAnswers.value })
      .from(questionOpenAnswers)
      .where(eq(questionOpenAnswers.questionId, questionId)),
    db.select().from(questionGeo).where(eq(questionGeo.questionId, questionId)).limit(1),
  ]);

  const geoRow = geoRows[0];

  return {
    ...row,
    choices,
    openAnswers: openAnswers.map((a) => a.value),
    geo: geoRow
      ? {
          mode: geoRow.mode,
          targetIso3: geoRow.targetIso3,
          showLabels: geoRow.showLabels,
          showNeighbours: geoRow.showNeighbours,
        }
      : null,
  };
}

/** `timeLimitS` is the room's resolved value (room_questions.time_limit_s), not a property of
 *  the question itself — passed in explicitly by the caller (engine.ts, from `frozen.timeLimitS`)
 *  rather than read off `detail`, which no longer carries one at all (Addendum B.2). */
export function toSanitised(detail: FullQuestionDetail, timeLimitS: number): SanitisedQuestion {
  return toSanitisedQuestion({
    id: detail.id,
    type: detail.type,
    prompt: detail.prompt,
    hint: detail.hint,
    categoryName: detail.categoryName,
    categoryColorToken: detail.categoryColorToken,
    difficulty: detail.difficulty,
    timeLimitS,
    // Difficulty drives the points, not the stored questions.points_base column
    // (1000 on every row, so the whole 1-5 scale used to be decorative). Derived
    // in one place so both the client display and engine.ts's scoring agree.
    pointsBase: pointsForDifficulty(detail.difficulty),
    authorUsername: detail.authorUsername,
    authorDisplayName: detail.authorDisplayName,
    authorAvatarSeed: detail.authorAvatarSeed,
    mediaId: detail.mediaId ?? undefined,
    answerMode: detail.answerMode ?? undefined,
    choices: detail.choices,
    geo: detail.geo ?? undefined,
  });
}

export function toGradable(detail: FullQuestionDetail): GradableQuestion {
  switch (detail.type) {
    case "open":
      return { type: "open", strict: detail.strict, acceptedAnswers: detail.openAnswers };
    case "mcq":
      return {
        type: "mcq",
        correctChoiceIds: detail.choices.filter((c) => c.isCorrect).map((c) => c.id),
      };
    case "image":
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
  }
}

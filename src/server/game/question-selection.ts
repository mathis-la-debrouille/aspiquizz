import { sql, eq, and, gte, lte, inArray, asc } from "drizzle-orm";
import { db } from "@/server/db";
import { questions, quizQuestions, type QuestionType } from "@/server/db/schema";
import type { RoomConfigInput } from "@/lib/schemas/socket";

export interface SelectedQuestion {
  questionId: string;
  /** The caller resolves this to a duration via config.timeLimitByType/timeLimitS — duration is
   *  a room-setup decision, not a property of the question itself (Addendum B.2). */
  type: QuestionType;
}

export async function selectQuestionsForRoom(
  source: "quiz" | "random",
  quizId: string | null,
  config: RoomConfigInput,
): Promise<SelectedQuestion[]> {
  if (source === "quiz") {
    if (!quizId) throw new Error("quizId is required when source is 'quiz'.");
    const rows = await db
      .select({ questionId: quizQuestions.questionId, type: questions.type })
      .from(quizQuestions)
      .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.position))
      .limit(config.questionCount);
    return rows;
  }

  const conditions = [
    eq(questions.status, "published" as const),
    gte(questions.difficulty, config.difficultyMin),
    lte(questions.difficulty, config.difficultyMax),
  ];
  if (config.categoryIds.length > 0) {
    conditions.push(inArray(questions.categoryId, config.categoryIds));
  }

  const rows = await db
    .select({ questionId: questions.id, type: questions.type })
    .from(questions)
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(config.questionCount);

  return rows;
}

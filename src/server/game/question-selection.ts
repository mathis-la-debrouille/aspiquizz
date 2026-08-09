import { sql, eq, and, gte, lte, inArray, asc } from "drizzle-orm";
import { db } from "@/server/db";
import { questions, quizQuestions } from "@/server/db/schema";
import type { RoomConfigInput } from "@/lib/schemas/socket";

export interface SelectedQuestion {
  questionId: string;
  timeLimitS: number;
}

export async function selectQuestionsForRoom(
  source: "quiz" | "random",
  quizId: string | null,
  config: RoomConfigInput,
): Promise<SelectedQuestion[]> {
  if (source === "quiz") {
    if (!quizId) throw new Error("quizId is required when source is 'quiz'.");
    const rows = await db
      .select({ questionId: quizQuestions.questionId, timeLimitS: questions.timeLimitS })
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
    .select({ questionId: questions.id, timeLimitS: questions.timeLimitS })
    .from(questions)
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(config.questionCount);

  return rows.map((r) => ({
    questionId: r.questionId,
    timeLimitS: r.timeLimitS || config.defaultTimeLimitS,
  }));
}

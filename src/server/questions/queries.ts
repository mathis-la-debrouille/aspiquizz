import { and, desc, eq, like } from "drizzle-orm";
import { db } from "@/server/db";
import {
  questions,
  categories,
  users,
  quizzes,
  type QuestionType,
  type QuestionStatus,
} from "@/server/db/schema";

export interface QuizListItem {
  id: string;
  title: string;
  authorUsername: string;
}

export async function listPublishedQuizzes(): Promise<QuizListItem[]> {
  const rows = await db
    .select({ id: quizzes.id, title: quizzes.title, authorUsername: users.username })
    .from(quizzes)
    .innerJoin(users, eq(quizzes.authorId, users.id))
    .where(eq(quizzes.status, "published"))
    .orderBy(desc(quizzes.createdAt))
    .limit(100);
  return rows;
}

export interface QuestionListItem {
  id: string;
  type: QuestionType;
  prompt: string;
  difficulty: number;
  status: "draft" | "published" | "archived";
  categoryName: string;
  categoryColorToken: "moss" | "gold" | "clay" | "plum";
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarSeed: string;
  createdAt: Date;
}

export interface ListQuestionsFilters {
  categoryId?: string;
  type?: QuestionType;
  authorId?: string;
  search?: string;
  /** Omit for every status (the admin moderation view) — every other call site passes this
   *  explicitly to scope its own list (published browsing, an author's own drafts). */
  status?: QuestionStatus;
}

export async function listQuestions(
  filters: ListQuestionsFilters = {},
): Promise<QuestionListItem[]> {
  const conditions = [];
  if (filters.status) conditions.push(eq(questions.status, filters.status));
  if (filters.categoryId) conditions.push(eq(questions.categoryId, filters.categoryId));
  if (filters.type) conditions.push(eq(questions.type, filters.type));
  if (filters.authorId) conditions.push(eq(questions.authorId, filters.authorId));
  if (filters.search) conditions.push(like(questions.prompt, `%${filters.search}%`));

  const rows = await db
    .select({
      id: questions.id,
      type: questions.type,
      prompt: questions.prompt,
      difficulty: questions.difficulty,
      status: questions.status,
      categoryName: categories.name,
      categoryColorToken: categories.colorToken,
      authorId: questions.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarSeed: users.avatarSeed,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .innerJoin(categories, eq(questions.categoryId, categories.id))
    .innerJoin(users, eq(questions.authorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(questions.createdAt))
    .limit(200);

  return rows;
}

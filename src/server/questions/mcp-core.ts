/**
 * Read/patch/delete helpers backing the MCP question tools that aren't creation (Addendum C.5):
 * `rechercher_questions`, `lister_mes_brouillons`, `modifier_brouillon`, `supprimer_brouillon`.
 * Creation itself is ingest.ts — this module never inserts into `questions`.
 */
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  questions,
  answers,
  categories,
  users,
  type QuestionType,
  type QuestionStatus,
} from "@/server/db/schema";

export interface SearchResultItem {
  id: string;
  prompt: string;
  type: QuestionType;
  auteur: string;
}

/**
 * Deliberately broader than the library's own visibility rule (A.3, drafts hidden from
 * non-authors) — this is a dedup check for authoring, not a browsing surface, and this app's
 * whole userbase is one small invited group (see CLAUDE.md), so surfacing another member's
 * draft *prompt text* here to avoid a duplicate is the intended tradeoff, not a leak. Archived
 * questions are excluded — a retired question isn't a live duplicate concern.
 */
export async function searchQuestionsForDedup(params: {
  requete: string;
  type?: QuestionType;
  categorieId?: string;
  limite?: number;
}): Promise<SearchResultItem[]> {
  const conditions = [sql`${questions.status} != 'archived'`];
  if (params.requete.trim()) conditions.push(like(questions.prompt, `%${params.requete.trim()}%`));
  if (params.type) conditions.push(eq(questions.type, params.type));
  if (params.categorieId) conditions.push(eq(questions.categoryId, params.categorieId));

  const limit = Math.min(Math.max(params.limite ?? 10, 1), 50);
  const rows = await db
    .select({
      id: questions.id,
      prompt: questions.prompt,
      type: questions.type,
      auteur: users.username,
    })
    .from(questions)
    .innerJoin(users, eq(questions.authorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(questions.createdAt))
    .limit(limit);
  return rows;
}

export interface DraftSummary {
  id: string;
  type: QuestionType;
  prompt: string;
  categoryName: string;
  difficulty: number;
  source: string;
  createdAt: Date;
}

export async function listMyDrafts(userId: string, limit = 50): Promise<DraftSummary[]> {
  const rows = await db
    .select({
      id: questions.id,
      type: questions.type,
      prompt: questions.prompt,
      categoryName: categories.name,
      difficulty: questions.difficulty,
      source: questions.source,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .innerJoin(categories, eq(questions.categoryId, categories.id))
    .where(and(eq(questions.authorId, userId), eq(questions.status, "draft")))
    .orderBy(desc(questions.createdAt))
    .limit(limit);
  return rows;
}

export type DraftMutationResult = { ok: true } | { ok: false; error: string };

async function requireOwnedDraft(
  questionId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select({ authorId: questions.authorId, status: questions.status })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!row) return { ok: false, error: "Brouillon introuvable." };
  if (row.authorId !== userId) {
    return { ok: false, error: "Vous ne pouvez modifier que vos propres brouillons." };
  }
  if (row.status !== "draft") {
    return { ok: false, error: "Cette question n'est plus à l'état de brouillon." };
  }
  return { ok: true };
}

export interface DraftPatch {
  enonce?: string;
  categorieId?: string;
  difficulte?: 1 | 2 | 3 | 4 | 5;
  indice?: string;
  explication?: string;
}

/** Only the common metadata fields (prompt/category/difficulty/hint/explanation) — a structural
 *  change (accepted answers, MCQ choices, geo target) isn't exposed here; delete and recreate via
 *  `creer_question` instead. Kept intentionally small: the MCP surface for editing an in-flight
 *  draft is "fix a typo/reclassify", not a full editor. */
export async function patchDraft(
  questionId: string,
  userId: string,
  patch: DraftPatch,
): Promise<DraftMutationResult> {
  const owned = await requireOwnedDraft(questionId, userId);
  if (!owned.ok) return owned;

  const set: Partial<typeof questions.$inferInsert> = { updatedAt: new Date() };
  if (patch.enonce !== undefined) set.prompt = patch.enonce;
  if (patch.categorieId !== undefined) set.categoryId = patch.categorieId;
  if (patch.difficulte !== undefined) set.difficulty = patch.difficulte;
  if (patch.indice !== undefined) set.hint = patch.indice;
  if (patch.explication !== undefined) set.explanation = patch.explication;

  await db.update(questions).set(set).where(eq(questions.id, questionId));
  return { ok: true };
}

export async function deleteDraft(
  questionId: string,
  userId: string,
): Promise<DraftMutationResult> {
  const owned = await requireOwnedDraft(questionId, userId);
  if (!owned.ok) return owned;

  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(answers)
    .where(eq(answers.questionId, questionId));
  if (Number(row?.n ?? 0) > 0) {
    return { ok: false, error: "Ce brouillon a déjà été joué et ne peut plus être supprimé." };
  }

  await db.delete(questions).where(eq(questions.id, questionId));
  return { ok: true };
}

export type { QuestionStatus };

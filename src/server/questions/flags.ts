/**
 * Player-raised reports on questions already in play — "this is wrong" or "I
 * dispute this answer". Plain module, no `"use server"` and no `next/cache`
 * import, per CLAUDE.md: anything the MCP layer might need has to stay callable
 * from outside a Next request context. `flag-actions.ts` wraps this for the web.
 *
 * Distinct from `review.ts`, which gates drafts BEFORE publication. This is the
 * feedback loop on published questions, and the queue a later review pass reads.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { questionFlags, questions, users, type FlagResolution } from "@/server/db/schema";

export type FlagResult = { ok: true; alreadyFlagged: boolean } | { ok: false; error: string };

/**
 * Idempotent: a second report from the same player on the same question is a
 * no-op rather than an error or a duplicate row, so a mis-tap or a double click
 * mid-question never becomes two reports or an error toast during a live game.
 */
export async function flagQuestion(
  questionId: string,
  userId: string,
  opts: { roomId?: string | null; reason?: string | null } = {},
): Promise<FlagResult> {
  const [question] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.id, questionId));
  if (!question) return { ok: false, error: "Question introuvable." };

  const [existing] = await db
    .select({ id: questionFlags.id })
    .from(questionFlags)
    .where(and(eq(questionFlags.questionId, questionId), eq(questionFlags.userId, userId)));
  if (existing) return { ok: true, alreadyFlagged: true };

  await db.insert(questionFlags).values({
    questionId,
    userId,
    roomId: opts.roomId ?? null,
    reason: opts.reason?.trim() ? opts.reason.trim() : null,
  });
  return { ok: true, alreadyFlagged: false };
}

export interface FlaggedQuestion {
  questionId: string;
  prompt: string;
  type: string;
  difficulty: number;
  status: string;
  flagCount: number;
  reporters: string;
  reasons: string[];
  lastFlaggedAt: Date | null;
}

/**
 * The review queue: unresolved reports, most-reported first. Grouped by question
 * rather than listed per report — the useful unit is "this question has four
 * people disputing it", not four separate rows saying the same thing.
 */
export async function listFlaggedQuestions(): Promise<FlaggedQuestion[]> {
  const rows = await db
    .select({
      questionId: questions.id,
      prompt: questions.prompt,
      type: questions.type,
      difficulty: questions.difficulty,
      status: questions.status,
      flagCount: sql<number>`count(${questionFlags.id})`,
      reporters: sql<string>`group_concat(distinct ${users.username})`,
      reasons: sql<string | null>`group_concat(${questionFlags.reason}, '||')`,
      lastFlaggedAt: sql<number | null>`max(${questionFlags.createdAt})`,
    })
    .from(questionFlags)
    .innerJoin(questions, eq(questions.id, questionFlags.questionId))
    .innerJoin(users, eq(users.id, questionFlags.userId))
    .where(isNull(questionFlags.resolution))
    .groupBy(questions.id)
    .orderBy(desc(sql`count(${questionFlags.id})`));

  return rows.map((r) => ({
    questionId: r.questionId,
    prompt: r.prompt,
    type: r.type,
    difficulty: r.difficulty,
    status: r.status,
    flagCount: Number(r.flagCount),
    reporters: r.reporters ?? "",
    reasons: (r.reasons ?? "").split("||").filter((s) => s.length > 0),
    lastFlaggedAt: r.lastFlaggedAt ? new Date(Number(r.lastFlaggedAt) * 1000) : null,
  }));
}

/**
 * Stamps every open report on a question. Rows are kept, never deleted, so a
 * question reported again after being resolved as "kept" shows as a recurring
 * pattern instead of looking brand new each time.
 */
export async function resolveFlagsForQuestion(
  questionId: string,
  resolution: FlagResolution,
  resolvedBy: string,
): Promise<{ ok: true; count: number }> {
  const open = await db
    .select({ id: questionFlags.id })
    .from(questionFlags)
    .where(and(eq(questionFlags.questionId, questionId), isNull(questionFlags.resolution)));

  await db
    .update(questionFlags)
    .set({ resolution, resolvedAt: new Date(), resolvedBy })
    .where(and(eq(questionFlags.questionId, questionId), isNull(questionFlags.resolution)));

  return { ok: true, count: open.length };
}

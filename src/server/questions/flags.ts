/**
 * Player-raised reports on questions already in play — "this is wrong" or "I
 * dispute this answer". Plain module, no `"use server"` and no `next/cache`
 * import, per CLAUDE.md: anything the MCP layer might need has to stay callable
 * from outside a Next request context. `flag-actions.ts` wraps this for the web.
 *
 * Distinct from `review.ts`, which gates drafts BEFORE publication. This is the
 * feedback loop on published questions, and the queue a later review pass reads.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { questionFlags, questions, users, type FlagResolution } from "@/server/db/schema";
import { describeCorrectAnswer, getFullQuestionDetail } from "@/server/game/question-detail";

export type FlagResult = { ok: true; alreadyFlagged: boolean } | { ok: false; error: string };

/**
 * One report per player per question (unique index), so a second call never adds a row. What
 * it does instead depends on what the player brought:
 *
 * - Nothing new (a double click, a re-tap mid-question): a no-op, reported as alreadyFlagged.
 * - A reason: it replaces the stored one. The usual path is a one-tap report during the
 *   question, then the explanation typed on the correction screen once the answer is shown —
 *   the second call is the useful one, and it used to be silently dropped.
 * - Either, on a report an admin already closed: the report reopens. Closing a report as
 *   "kept" and having the same player dispute it again is exactly the signal the queue is
 *   for; before, that second report vanished without a trace.
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

  const reason = opts.reason?.trim() ? opts.reason.trim() : null;

  const [existing] = await db
    .select({
      id: questionFlags.id,
      reason: questionFlags.reason,
      resolution: questionFlags.resolution,
    })
    .from(questionFlags)
    .where(and(eq(questionFlags.questionId, questionId), eq(questionFlags.userId, userId)));

  if (!existing) {
    await db.insert(questionFlags).values({
      questionId,
      userId,
      roomId: opts.roomId ?? null,
      reason,
    });
    return { ok: true, alreadyFlagged: false };
  }

  const reopen = existing.resolution !== null;
  const newReason = reason !== null && reason !== existing.reason;
  if (reopen || newReason) {
    await db
      .update(questionFlags)
      .set({
        ...(newReason ? { reason } : {}),
        ...(reopen
          ? { resolution: null, resolvedAt: null, resolvedBy: null, createdAt: new Date() }
          : {}),
        ...(opts.roomId ? { roomId: opts.roomId } : {}),
      })
      .where(eq(questionFlags.id, existing.id));
  }
  return { ok: true, alreadyFlagged: true };
}

export interface FlagReport {
  username: string;
  displayName: string;
  reason: string | null;
  createdAt: Date;
}

export interface FlaggedQuestion {
  questionId: string;
  prompt: string;
  type: string;
  difficulty: number;
  status: string;
  categoryName: string;
  /** What the game currently accepts — the thing a report is usually disputing. */
  correct: string;
  explanation: string | null;
  reports: FlagReport[];
  lastFlaggedAt: Date;
}

/**
 * The review queue: open reports, most-reported first, then most recent. Grouped by
 * question — the useful unit is "four people disputed this one", not four rows — and each
 * group carries the accepted answer and explanation, because a report reading "réponse
 * fausse" is unjudgeable without seeing what the answer is.
 */
export async function listFlaggedQuestions(): Promise<FlaggedQuestion[]> {
  const rows = await db
    .select({
      questionId: questionFlags.questionId,
      reason: questionFlags.reason,
      createdAt: questionFlags.createdAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(questionFlags)
    .innerJoin(users, eq(users.id, questionFlags.userId))
    .where(isNull(questionFlags.resolution))
    .orderBy(desc(questionFlags.createdAt));

  const reportsByQuestion = new Map<string, FlagReport[]>();
  for (const r of rows) {
    const list = reportsByQuestion.get(r.questionId) ?? [];
    list.push({
      username: r.username,
      displayName: r.displayName,
      reason: r.reason,
      createdAt: r.createdAt,
    });
    reportsByQuestion.set(r.questionId, list);
  }

  // One detail load per reported question. The queue is tens of questions, not thousands, and
  // this reuses the exact loader and answer formatter the correction screen uses, so the admin
  // sees the same "Réponse attendue" the room saw.
  const details = await Promise.all(
    [...reportsByQuestion.keys()].map((id) => getFullQuestionDetail(id)),
  );

  const result: FlaggedQuestion[] = [];
  for (const detail of details) {
    if (!detail) continue;
    const reports = reportsByQuestion.get(detail.id) ?? [];
    result.push({
      questionId: detail.id,
      prompt: detail.prompt,
      type: detail.type,
      difficulty: detail.difficulty,
      status: detail.status,
      categoryName: detail.categoryName,
      correct: describeCorrectAnswer(detail),
      explanation: detail.explanation,
      reports,
      lastFlaggedAt: reports[0]?.createdAt ?? new Date(0),
    });
  }
  return result.sort(
    (a, b) =>
      b.reports.length - a.reports.length || b.lastFlaggedAt.getTime() - a.lastFlaggedAt.getTime(),
  );
}

/**
 * Stamps every open report on a question. Rows are kept, never deleted, so a
 * question reported again after being resolved as "kept" shows as a recurring
 * pattern instead of looking brand new each time.
 *
 * "removed" also archives the question. The button said "Retirée du jeu" and used to only
 * stamp the reports, leaving the question published and still being drawn into games.
 * Archiving, not deleting — see setQuestionStatusAction for why a played question is never
 * hard-deleted — so it can be republished from the Questions tab.
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

  if (resolution === "removed") {
    await db
      .update(questions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(questions.id, questionId));
  }

  if (open.length > 0) {
    await db
      .update(questionFlags)
      .set({ resolution, resolvedAt: new Date(), resolvedBy })
      .where(
        inArray(
          questionFlags.id,
          open.map((f) => f.id),
        ),
      );
  }

  return { ok: true, count: open.length };
}

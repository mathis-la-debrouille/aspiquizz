"use server";

/**
 * The "À relire" tab (Addendum C.7) — where a machine-authored draft becomes a real question.
 * Deliberately separate from library-actions.ts's admin-only `bulkSetQuestionStatus`: publishing/
 * rejecting here is author-or-admin (whoever can see the row can act on it), not admin-only.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  questions,
  categories,
  users,
  questionStats,
  questionGeo,
  questionEstimation,
  type QuestionSource,
} from "@/server/db/schema";
import { getSession, type SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/audit/log";
import type { LibraryQuestionItem } from "@/server/questions/library";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

/** Drafts where `source != 'manual'`, newest first, visible to the draft's author or an admin —
 *  same row shape as the main library (`LibraryQuestionItem`) so `LibraryCard`/`PreviewPanel` can
 *  be reused verbatim instead of a second, drifting card component (Addendum A.6's whole point:
 *  the preview must never diverge from what players actually see). */
export async function listReviewQueue(): Promise<LibraryQuestionItem[]> {
  const user = await requireUser();
  const conditions = [eq(questions.status, "draft"), ne(questions.source, "manual")];
  if (user.role !== "admin") conditions.push(eq(questions.authorId, user.id));

  const rows = await db
    .select({
      id: questions.id,
      type: questions.type,
      prompt: questions.prompt,
      difficulty: questions.difficulty,
      status: questions.status,
      categoryId: questions.categoryId,
      categoryName: categories.name,
      categoryColorToken: categories.colorToken,
      authorId: questions.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarSeed: users.avatarSeed,
      mediaId: questions.mediaId,
      answerMode: questions.answerMode,
      source: questions.source,
      createdAt: questions.createdAt,
      timesAsked: sql<number>`COALESCE(${questionStats.timesAsked}, 0)`,
      timesCorrect: sql<number>`COALESCE(${questionStats.timesCorrect}, 0)`,
      totalMs: sql<number>`COALESCE(${questionStats.totalMs}, 0)`,
      choiceCount: sql<number>`(SELECT COUNT(*) FROM question_choices WHERE question_id = questions.id)`,
      correctChoiceCount: sql<number>`(SELECT COUNT(*) FROM question_choices WHERE question_id = questions.id AND is_correct = 1)`,
      openAnswerCount: sql<number>`(SELECT COUNT(*) FROM question_open_answers WHERE question_id = questions.id)`,
      geoTargetIso3: questionGeo.targetIso3,
      sortItemCount: sql<number>`(SELECT COUNT(*) FROM question_sort_items WHERE question_id = questions.id)`,
      estimationUnit: questionEstimation.unit,
    })
    .from(questions)
    .innerJoin(categories, eq(questions.categoryId, categories.id))
    .innerJoin(users, eq(questions.authorId, users.id))
    .leftJoin(questionStats, eq(questionStats.questionId, questions.id))
    .leftJoin(questionGeo, eq(questionGeo.questionId, questions.id))
    .leftJoin(questionEstimation, eq(questionEstimation.questionId, questions.id))
    .where(and(...conditions))
    .orderBy(desc(questions.createdAt));

  return rows.map((r) => ({
    ...r,
    avgMs: r.timesAsked > 0 ? Math.round(r.totalMs / r.timesAsked) : null,
    choiceCount: Number(r.choiceCount),
    multiSelect: Number(r.correctChoiceCount) > 1,
    openAnswerCount: Number(r.openAnswerCount),
    sortItemCount: Number(r.sortItemCount),
  }));
}

/** Admins and authors alike may only act on a draft that's actually theirs to review — an admin
 *  can review anyone's, an author only their own (mirrors the visibility rule above, checked
 *  again here since these actions are independently reachable, not just from the list). */
async function requireReviewAccess(
  questionId: string,
  user: SessionUser,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select({ authorId: questions.authorId, status: questions.status, source: questions.source })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!row) return { ok: false, error: "Question introuvable." };
  if (row.status !== "draft")
    return { ok: false, error: "Cette question n'est plus un brouillon." };
  if (row.source === "manual") return { ok: false, error: "Cette question n'a rien à relire." };
  if (row.authorId !== user.id && user.role !== "admin") {
    return { ok: false, error: "Vous ne pouvez relire que vos propres brouillons." };
  }
  return { ok: true };
}

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

export async function publishDraftAction(questionId: string): Promise<ReviewActionResult> {
  const user = await requireUser();
  const access = await requireReviewAccess(questionId, user);
  if (!access.ok) return access;

  await db
    .update(questions)
    .set({
      status: "published",
      reviewedAt: new Date(),
      reviewedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(questions.id, questionId));

  revalidatePath("/creer");
  return { ok: true };
}

export async function rejectDraftAction(
  questionId: string,
  reason?: string,
): Promise<ReviewActionResult> {
  const user = await requireUser();
  const access = await requireReviewAccess(questionId, user);
  if (!access.ok) return access;

  await db
    .update(questions)
    .set({ status: "archived", reviewedAt: new Date(), reviewedBy: user.id, updatedAt: new Date() })
    .where(eq(questions.id, questionId));

  // No dedicated "rejection reason" column exists on `questions` (not part of C.1's schema
  // additions) — the reason, when given, is preserved in audit_log instead of silently dropped.
  if (reason?.trim()) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "question_reject",
      before: { questionId },
      after: { reason: reason.trim() },
    });
  }

  revalidatePath("/creer");
  return { ok: true };
}

export type BulkReviewResult = { ok: true; count: number } | { ok: false; error: string };

export async function bulkPublishDraftsAction(questionIds: string[]): Promise<BulkReviewResult> {
  const user = await requireUser();
  let count = 0;
  for (const id of questionIds) {
    const access = await requireReviewAccess(id, user);
    if (!access.ok) continue;
    await db
      .update(questions)
      .set({
        status: "published",
        reviewedAt: new Date(),
        reviewedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id));
    count += 1;
  }
  revalidatePath("/creer");
  return { ok: true, count };
}

export async function bulkRejectDraftsAction(
  questionIds: string[],
  reason?: string,
): Promise<BulkReviewResult> {
  const user = await requireUser();
  let count = 0;
  for (const id of questionIds) {
    const access = await requireReviewAccess(id, user);
    if (!access.ok) continue;
    await db
      .update(questions)
      .set({
        status: "archived",
        reviewedAt: new Date(),
        reviewedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id));
    count += 1;
  }
  if (reason?.trim() && count > 0) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "question_reject",
      before: { questionIds },
      after: { reason: reason.trim(), count },
    });
  }
  revalidatePath("/creer");
  return { ok: true, count };
}

export type { QuestionSource };

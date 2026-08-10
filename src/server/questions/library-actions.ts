"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  questions,
  questionChoices,
  questionOpenAnswers,
  questionGeo,
  questionStats,
  answers,
  countries,
  type QuestionStatus,
} from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { listLibraryQuestions, type LibraryResult } from "@/server/questions/library";
import { getFullQuestionDetail, type FullQuestionDetail } from "@/server/game/question-detail";
import { questionLibraryQuerySchema, type QuestionLibraryQuery } from "@/lib/schemas/library";

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

/** Called by the "Charger plus" button — the viewer always comes from the session, never from
 *  the client, even though the rest of the query does (it's already been through
 *  parseLibraryQuery/Zod server-side once for the initial page load; re-validating here is
 *  cheap and means this action is safe to call with an arbitrary payload). */
export async function loadMoreLibraryQuestions(
  query: QuestionLibraryQuery,
  page: number,
): Promise<LibraryResult> {
  const user = await requireUser();
  const parsed = questionLibraryQuerySchema.safeParse(query);
  const safeQuery = parsed.success ? parsed.data : questionLibraryQuerySchema.parse({});
  return listLibraryQuestions(safeQuery, user, page);
}

export interface ChoiceDistributionEntry {
  label: string;
  isCorrect: boolean;
  count: number;
  pct: number;
}

export interface PreviewGeoCountry {
  nameFr: string;
  capitalFr: string | null;
  population: number | null;
}

export interface PreviewData {
  detail: FullQuestionDetail;
  stats: { timesAsked: number; timesCorrect: number; avgMs: number | null };
  choiceDistribution: ChoiceDistributionEntry[] | null;
  /** geo only — the raw answer key (name/capital/population), never sanitised, since the
   *  preview is for the question's own author/an admin, not a player mid-game. */
  geoCountry: PreviewGeoCountry | null;
}

/** Read side of the preview panel (A.6) — same visibility rule as the library list itself
 *  (drafts: author or admin only), enforced here too since this is reachable independently of
 *  whatever the list happened to filter to. */
export async function getPreviewData(questionId: string): Promise<PreviewData | null> {
  const user = await requireUser();
  const detail = await getFullQuestionDetail(questionId);
  if (!detail) return null;
  if (detail.status === "draft" && detail.authorId !== user.id && user.role !== "admin") {
    return null;
  }

  const statRow = (
    await db.select().from(questionStats).where(eq(questionStats.questionId, questionId)).limit(1)
  )[0];
  const timesAsked = statRow?.timesAsked ?? 0;
  const timesCorrect = statRow?.timesCorrect ?? 0;
  const avgMs = timesAsked > 0 ? Math.round((statRow?.totalMs ?? 0) / timesAsked) : null;

  let choiceDistribution: ChoiceDistributionEntry[] | null = null;
  if (detail.type === "mcq" || (detail.type === "image" && detail.answerMode === "mcq")) {
    const answerRows =
      detail.choices.length > 0
        ? await db
            .select({ payload: answers.payload })
            .from(answers)
            .where(eq(answers.questionId, questionId))
        : [];
    const counts = new Map<string, number>();
    let total = 0;
    for (const row of answerRows) {
      const payload = row.payload as { choiceIds?: string[] };
      for (const id of payload.choiceIds ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        total += 1;
      }
    }
    choiceDistribution = detail.choices.map((c) => {
      const count = counts.get(c.id) ?? 0;
      return {
        label: c.label,
        isCorrect: c.isCorrect,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });
  }

  let geoCountry: PreviewGeoCountry | null = null;
  if (detail.geo) {
    const countryRow = (
      await db
        .select({ nameFr: countries.nameFr, capitalFr: countries.capitalFr, population: countries.population })
        .from(countries)
        .where(eq(countries.iso3, detail.geo.targetIso3))
        .limit(1)
    )[0];
    geoCountry = countryRow ?? null;
  }

  return { detail, stats: { timesAsked, timesCorrect, avgMs }, choiceDistribution, geoCountry };
}

export type BulkActionResult = { ok: true; count: number } | { ok: false; error: string };

/** Admin only (A.7), simplified to publish/archive — the addendum's fuller "changer de
 *  catégorie" / "ajouter à un quiz" bulk actions need their own modals and were deprioritised
 *  against the rest of this addendum; see DECISIONS.md. */
export async function bulkSetQuestionStatus(
  questionIds: string[],
  status: QuestionStatus,
): Promise<BulkActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: "Action réservée aux administrateurs." };
  if (questionIds.length === 0) return { ok: true, count: 0 };
  await db
    .update(questions)
    .set({ status, updatedAt: new Date() })
    .where(inArray(questions.id, questionIds));
  revalidatePath("/creer");
  return { ok: true, count: questionIds.length };
}

export type DuplicateResult = { ok: true; id: string } | { ok: false; error: string };

export async function duplicateQuestion(questionId: string): Promise<DuplicateResult> {
  const user = await requireUser();
  const detail = await getFullQuestionDetail(questionId);
  if (!detail) return { ok: false, error: "Question introuvable." };
  if (detail.status === "draft" && detail.authorId !== user.id && user.role !== "admin") {
    return { ok: false, error: "Question introuvable." };
  }

  const [row] = await db
    .insert(questions)
    .values({
      type: detail.type,
      prompt: `${detail.prompt} (copie)`,
      hint: detail.hint,
      explanation: detail.explanation,
      categoryId: detail.categoryId,
      authorId: user.id,
      difficulty: detail.difficulty,
      mediaId: detail.mediaId,
      answerMode: detail.answerMode,
      strict: detail.strict,
      status: "draft",
    })
    .returning({ id: questions.id });
  const newId = row!.id;

  if (detail.choices.length > 0) {
    await db.insert(questionChoices).values(
      detail.choices.map((c, position) => ({
        questionId: newId,
        label: c.label,
        isCorrect: c.isCorrect,
        position,
      })),
    );
  }
  if (detail.openAnswers.length > 0) {
    await db
      .insert(questionOpenAnswers)
      .values(detail.openAnswers.map((value, i) => ({ questionId: newId, value, isPrimary: i === 0 })));
  }
  if (detail.geo) {
    await db.insert(questionGeo).values({
      questionId: newId,
      mode: detail.geo.mode,
      targetIso3: detail.geo.targetIso3,
      extraIso3: [],
      showLabels: detail.geo.showLabels,
      showNeighbours: detail.geo.showNeighbours,
    });
  }

  revalidatePath("/creer");
  return { ok: true, id: newId };
}

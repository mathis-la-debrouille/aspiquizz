"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { categories, questions } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { requireAdmin } from "@/server/admin/guard";
import { type CreateCategoryInput } from "@/lib/schemas/categories";
import { createCategoryCore, type CreateCategoryResult } from "@/server/categories/core";

export type { CategorySummary, CreateCategoryResult } from "@/server/categories/core";

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

/** Open to any logged-in user (B.1) — unlike admin's own createCategoryAction
 *  (server/admin/actions.ts), which is a different, more explicit tool (admin sets slug/
 *  position directly) for the /admin panel. This is the "quick, inline, from wherever a
 *  category is picked" path. The actual DB work lives in server/categories/core.ts (see that
 *  file for why: it must never import `next/cache`, and this file does). */
export async function createCategoryAction(
  input: CreateCategoryInput,
): Promise<CreateCategoryResult> {
  await requireUser();
  const result = await createCategoryCore(input);
  revalidatePath("/creer");
  return result;
}

export type DeleteCategoryResult =
  { ok: true } | { ok: false; error: string; questionCount?: number };

/** Admin only. Unlike the simpler block-only version this replaces in server/admin/actions.ts,
 *  this offers reassignment: called once with no `reassignToId` to discover whether the
 *  category is in use (the UI then shows "Déplacer les N questions vers…"), and again with a
 *  target once the admin picks one. Never orphans a question. */
export async function deleteCategoryAction(
  categoryId: string,
  reassignToId?: string,
): Promise<DeleteCategoryResult> {
  await requireAdmin();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(questions)
    .where(eq(questions.categoryId, categoryId));
  const inUse = Number(row?.n ?? 0);

  if (inUse > 0) {
    if (!reassignToId) {
      return {
        ok: false,
        error: `${inUse} question(s) utilisent encore cette catégorie.`,
        questionCount: inUse,
      };
    }
    if (reassignToId === categoryId) {
      return { ok: false, error: "Choisissez une catégorie différente." };
    }
    await db
      .update(questions)
      .set({ categoryId: reassignToId })
      .where(eq(questions.categoryId, categoryId));
  }

  await db.delete(categories).where(eq(categories.id, categoryId));
  revalidatePath("/creer");
  revalidatePath("/admin");
  return { ok: true };
}

export type MoveCategoryResult = { ok: true } | { ok: false; error: string };

/** Admin only — up/down reordering rather than real drag-and-drop, since no DnD library is a
 *  dependency of this project and adding one just for a ~10-row admin list wasn't worth it; see
 *  DECISIONS.md. Swaps `position` with the adjacent category in the current sort order. */
export async function moveCategoryAction(
  categoryId: string,
  direction: "up" | "down",
): Promise<MoveCategoryResult> {
  await requireAdmin();
  const all = await db.select().from(categories).orderBy(categories.position);
  const index = all.findIndex((c) => c.id === categoryId);
  if (index === -1) return { ok: false, error: "Catégorie introuvable." };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= all.length) return { ok: true }; // already at the edge, no-op

  const a = all[index]!;
  const b = all[swapIndex]!;
  await db.update(categories).set({ position: b.position }).where(eq(categories.id, a.id));
  await db.update(categories).set({ position: a.position }).where(eq(categories.id, b.id));
  revalidatePath("/creer");
  revalidatePath("/admin");
  return { ok: true };
}

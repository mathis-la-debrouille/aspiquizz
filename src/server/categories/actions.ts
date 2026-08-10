"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { categories, questions, type ColorToken } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { requireAdmin } from "@/server/admin/guard";
import { createCategorySchema, type CreateCategoryInput } from "@/lib/schemas/categories";
import { normalizeForComparison, slugify, uniqueSlug } from "@/server/categories/slug";

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

export interface CategorySummary {
  id: string;
  name: string;
  colorToken: ColorToken;
}

export type CreateCategoryResult =
  | { ok: true; category: CategorySummary }
  | { ok: false; error: string; existingCategoryId?: string };

/** The actual DB work, factored out so it's reachable without a session cookie — the MCP
 *  `creer_categorie` tool and ingest.ts's by-name category resolution (Addendum C.1/C.5) call
 *  this directly with an already-authenticated caller, instead of going through the "use server"
 *  action below (which re-derives the caller from getSession() and would reject every MCP
 *  request outright, since bearer-token requests carry no session cookie by design — see C.3).
 *  Deliberately never calls `revalidatePath` — that's a Next-request-scoped API (it throws
 *  "static generation store missing" outside one, which is exactly the environment every MCP
 *  tool call runs in, on the raw server.ts HTTP server); each caller that *does* have a Next
 *  request context revalidates itself after calling this. */
export async function createCategoryCore(
  input: CreateCategoryInput,
): Promise<CreateCategoryResult> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { name, colorToken, description } = parsed.data;

  const existingRows = await db.select().from(categories);
  const normalizedInput = normalizeForComparison(name);
  const clash = existingRows.find((c) => normalizeForComparison(c.name) === normalizedInput);
  if (clash) {
    return { ok: false, error: "Une catégorie porte déjà ce nom.", existingCategoryId: clash.id };
  }

  const maxPosition = existingRows.reduce((max, c) => Math.max(max, c.position), -1);
  const [row] = await db
    .insert(categories)
    .values({
      name,
      slug: await uniqueSlug(slugify(name), existingRows.map((c) => c.slug)),
      colorToken,
      description: description ?? null,
      position: maxPosition + 1,
    })
    .returning({ id: categories.id, name: categories.name, colorToken: categories.colorToken });

  return { ok: true, category: row! };
}

/** Open to any logged-in user (B.1) — unlike admin's own createCategoryAction
 *  (server/admin/actions.ts), which is a different, more explicit tool (admin sets slug/
 *  position directly) for the /admin panel. This is the "quick, inline, from wherever a
 *  category is picked" path. */
export async function createCategoryAction(input: CreateCategoryInput): Promise<CreateCategoryResult> {
  await requireUser();
  const result = await createCategoryCore(input);
  revalidatePath("/creer");
  return result;
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; error: string; questionCount?: number };

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
      return { ok: false, error: `${inUse} question(s) utilisent encore cette catégorie.`, questionCount: inUse };
    }
    if (reassignToId === categoryId) {
      return { ok: false, error: "Choisissez une catégorie différente." };
    }
    await db.update(questions).set({ categoryId: reassignToId }).where(eq(questions.categoryId, categoryId));
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

// ---------------------------------------------------------------------------
// MCP-only category mutation cores (Addendum C.5) — session-agnostic (no revalidatePath, no
// getSession()/requireAdmin() call: the admin gate for modifier_categorie/fusionner_categories/
// supprimer_categorie lives in the MCP tool wrapper, which already knows the caller's role from
// the verified token, not from a cookie). Not reused by any existing web UI call site — the
// admin panel's own rename/reorder/delete flows (above) keep their existing behaviour untouched.
// ---------------------------------------------------------------------------

export type CategorySnapshot = typeof categories.$inferSelect;

export interface UpdateCategoryPatch {
  name?: string;
  colorToken?: ColorToken;
  description?: string | null;
  position?: number;
}

export type UpdateCategoryResult =
  | { ok: true; before: CategorySnapshot; after: CategorySnapshot }
  | { ok: false; error: string };

/** Renaming/recolouring never touches `slug` — Addendum C.5: "keeps the id and slug stable so
 *  existing questions are unaffected." */
export async function updateCategoryCore(
  categoryId: string,
  patch: UpdateCategoryPatch,
): Promise<UpdateCategoryResult> {
  const [existing] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!existing) return { ok: false, error: "Catégorie introuvable." };

  if (patch.name !== undefined) {
    const normalized = normalizeForComparison(patch.name);
    const all = await db.select({ id: categories.id, name: categories.name }).from(categories);
    const dup = all.find((c) => c.id !== categoryId && normalizeForComparison(c.name) === normalized);
    if (dup) return { ok: false, error: "Une catégorie porte déjà ce nom." };
  }

  const set: Partial<typeof categories.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.colorToken !== undefined) set.colorToken = patch.colorToken;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.position !== undefined) set.position = patch.position;

  if (Object.keys(set).length > 0) {
    await db.update(categories).set(set).where(eq(categories.id, categoryId));
  }
  const [after] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  return { ok: true, before: existing, after: after! };
}

export type MergeCategoriesResult = { ok: true; movedCount: number } | { ok: false; error: string };

/** The only supported way to remove a non-empty category over MCP (C.5) — moves every question
 *  from `sourceId` to `targetId`, then deletes `sourceId`, in one transaction. */
export async function mergeCategoriesCore(
  sourceId: string,
  targetId: string,
): Promise<MergeCategoriesResult> {
  if (sourceId === targetId) return { ok: false, error: "Choisissez deux catégories différentes." };
  const [source] = await db.select().from(categories).where(eq(categories.id, sourceId)).limit(1);
  const [target] = await db.select().from(categories).where(eq(categories.id, targetId)).limit(1);
  if (!source) return { ok: false, error: "Catégorie source introuvable." };
  if (!target) return { ok: false, error: "Catégorie cible introuvable." };

  const movedCount = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.categoryId, sourceId));
    await tx.update(questions).set({ categoryId: targetId }).where(eq(questions.categoryId, sourceId));
    await tx.delete(categories).where(eq(categories.id, sourceId));
    return Number(row?.n ?? 0);
  });
  return { ok: true, movedCount };
}

export type DeleteCategoryStrictResult =
  | { ok: true }
  | { ok: false; error: string; questionCount?: number };

/** Unlike deleteCategoryAction above, no reassignment offer — supprimer_categorie succeeds only
 *  on an empty category; a non-empty one is pointed at fusionner_categories instead (C.5). */
export async function deleteCategoryStrictCore(categoryId: string): Promise<DeleteCategoryStrictResult> {
  const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!existing) return { ok: false, error: "Catégorie introuvable." };

  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(questions)
    .where(eq(questions.categoryId, categoryId));
  const inUse = Number(row?.n ?? 0);
  if (inUse > 0) {
    return {
      ok: false,
      error: `${inUse} question(s) utilisent encore cette catégorie — utilisez fusionner_categories pour les déplacer avant de supprimer.`,
      questionCount: inUse,
    };
  }

  await db.delete(categories).where(eq(categories.id, categoryId));
  return { ok: true };
}

"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { categories, questions, type ColorToken } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { requireAdmin } from "@/server/admin/guard";
import { createCategorySchema, type CreateCategoryInput } from "@/lib/schemas/categories";

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

/** Case/accent-insensitive comparison key — "Géographie" and "geographie" collide, matching
 *  B.1's uniqueness rule. Not the grading pipeline's normalizeAnswer (§7): that also strips
 *  French articles and punctuation for freeform answer matching, which would be wrong here
 *  (a category legitimately named "Le Sport" shouldn't collide with "Sport"). */
// Built via the RegExp constructor from an escaped string literal, not a /[...]/ regex literal
// — deliberately, so the combining-marks range (U+0300-U+036F, same range grading.ts's
// normalizeAnswer strips) is unambiguous source text rather than literal Unicode glyphs sitting
// inside the character class, which are easy to mis-copy/mis-render.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeForComparison(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

function slugify(name: string): string {
  return (
    normalizeForComparison(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "categorie"
  );
}

export interface CategorySummary {
  id: string;
  name: string;
  colorToken: ColorToken;
}

export type CreateCategoryResult =
  | { ok: true; category: CategorySummary }
  | { ok: false; error: string; existingCategoryId?: string };

/** Open to any logged-in user (B.1) — unlike admin's own createCategoryAction
 *  (server/admin/actions.ts), which is a different, more explicit tool (admin sets slug/
 *  position directly) for the /admin panel. This is the "quick, inline, from wherever a
 *  category is picked" path. */
export async function createCategoryAction(input: CreateCategoryInput): Promise<CreateCategoryResult> {
  await requireUser();
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

  revalidatePath("/creer");
  return { ok: true, category: row! };
}

async function uniqueSlug(base: string, existingSlugs: string[]): Promise<string> {
  if (!existingSlugs.includes(base)) return base;
  let n = 2;
  while (existingSlugs.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
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

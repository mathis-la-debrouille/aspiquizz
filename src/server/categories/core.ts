/**
 * Session-agnostic category mutation logic — deliberately NOT a "use server" file and
 * deliberately importing nothing from `next/cache` or `next/navigation`. This is what ingest.ts
 * and the MCP tools (`register.ts`) import.
 *
 * Why this split exists (a real bug, found by booting the actual production server, not by
 * typechecking): `next/cache`'s `revalidatePath` is only safe inside a Next request context.
 * `server/categories/actions.ts` is a "use server" file that imported it at module scope: fine
 * for the web, since Next's own build only ever loads "use server" files inside a request.
 * server.ts, though, statically imports the MCP transport (`server/mcp/transport.ts`), which
 * imports `register.ts`, which used to import these same functions FROM actions.ts — pulling
 * `next/cache` into server.ts's own top-level module graph, outside any Next request, on every
 * boot. The result wasn't an error at `revalidatePath()`-call time (which would at least be
 * obviously attributable) — it was Next's *own* internal `async-local-storage.js` throwing
 * "AsyncLocalStorage accessed in runtime where it is not available" the moment the very first
 * real page request came in, because `next/cache` having been `require()`d this early/this way
 * (via tsx's CJS transform, never through Next's own bundler) left Next's shared AsyncLocalStorage
 * singleton in a broken state. Moving the actual DB logic here — no `next/cache` in this file's
 * import graph, ever — fixes it at the root instead of working around the symptom.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, questions, type ColorToken } from "@/server/db/schema";
import { createCategorySchema, type CreateCategoryInput } from "@/lib/schemas/categories";
import { normalizeForComparison, slugify, uniqueSlug } from "@/server/categories/slug";

export interface CategorySummary {
  id: string;
  name: string;
  colorToken: ColorToken;
}

export type CreateCategoryResult =
  | { ok: true; category: CategorySummary }
  | { ok: false; error: string; existingCategoryId?: string };

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

/** Unlike server/categories/actions.ts's deleteCategoryAction, no reassignment offer —
 *  supprimer_categorie succeeds only on an empty category; a non-empty one is pointed at
 *  fusionner_categories instead (C.5). */
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

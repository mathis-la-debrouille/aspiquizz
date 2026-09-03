"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  users,
  categories,
  media,
  questions,
  type UserRole,
  type QuestionStatus,
} from "@/server/db/schema";
import { requireAdmin } from "@/server/admin/guard";
import { hashPassword } from "@/server/auth/password";
import { deleteUpload } from "@/server/media/storage";
import {
  createUserSchema,
  categorySchema,
  type CreateUserInput,
  type CategoryInput,
} from "@/lib/schemas/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createUserAction(input: CreateUserInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { username, password, displayName, role } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "Ce nom d'utilisateur existe déjà." };
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    username,
    displayName: displayName ?? username,
    passwordHash,
    role,
    avatarSeed: ulid(),
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id && !isActive) {
    return { ok: false, error: "Vous ne pouvez pas désactiver votre propre compte." };
  }
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserRoleAction(userId: string, role: UserRole): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id && role !== "admin") {
    return { ok: false, error: "Vous ne pouvez pas retirer vos propres droits d'administration." };
  }
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/admin");
  return { ok: true };
}

export async function createCategoryAction(input: CategoryInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const clashing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, parsed.data.slug))
    .limit(1);
  if (clashing.length > 0) {
    return { ok: false, error: "Ce slug existe déjà." };
  }
  await db
    .insert(categories)
    .values({ ...parsed.data, description: parsed.data.description ?? null });
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateCategoryAction(
  categoryId: string,
  input: CategoryInput,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const clashing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, parsed.data.slug), ne(categories.id, categoryId)))
    .limit(1);
  if (clashing.length > 0) {
    return { ok: false, error: "Ce slug existe déjà." };
  }
  await db
    .update(categories)
    .set({ ...parsed.data, description: parsed.data.description ?? null })
    .where(eq(categories.id, categoryId));
  revalidatePath("/admin");
  // Also reachable from /creer's Categories tab (Addendum B.5's lighter CategoryEditModal calls
  // this same action) — a colour/name change must propagate to the library's chips/cards there
  // too, not just /admin.
  revalidatePath("/creer");
  return { ok: true };
}

// deleteCategoryAction moved to server/categories/actions.ts (Addendum B.5) — that version
// supports reassigning a category's questions before deleting instead of only blocking, and is
// shared with the new /creer Categories tab. admin/CategoriesPanel.tsx uses it directly now.

export async function deleteMediaAction(mediaId: string): Promise<ActionResult> {
  await requireAdmin();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(questions)
    .where(eq(questions.mediaId, mediaId));
  const inUse = Number(row?.n ?? 0);
  if (inUse > 0) {
    return { ok: false, error: `${inUse} question(s) utilisent encore ce media.` };
  }
  const mediaRow = (await db.select().from(media).where(eq(media.id, mediaId)).limit(1))[0];
  if (!mediaRow) {
    return { ok: false, error: "Media introuvable." };
  }
  await db.delete(media).where(eq(media.id, mediaId));
  await deleteUpload(mediaRow.filename);
  revalidatePath("/admin");
  return { ok: true };
}

/** Content moderation is archive/publish, never a hard delete — a question that's already been
 *  played has `answers` rows keyed on it (a game's historical record), and quizzes may include
 *  it via `quiz_questions`. Archiving removes it from selection (question-selection.ts) and
 *  public listing without touching that history. */
export async function setQuestionStatusAction(
  questionId: string,
  status: QuestionStatus,
): Promise<ActionResult> {
  await requireAdmin();
  await db
    .update(questions)
    .set({ status, updatedAt: new Date() })
    .where(eq(questions.id, questionId));
  revalidatePath("/admin");
  return { ok: true };
}

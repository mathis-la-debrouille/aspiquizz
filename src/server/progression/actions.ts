"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/schemas/profile";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

export async function updateProfileAction(input: UpdateProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  await db
    .update(users)
    .set({ displayName: parsed.data.displayName, bio: parsed.data.bio ?? null, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  revalidatePath(`/profil/${user.username}`);
  return { ok: true };
}

/** Deterministic-per-seed avatar (Avatar.tsx), so "changer d'avatar" just picks a fresh seed. */
export async function rerollAvatarAction(): Promise<ActionResult> {
  const user = await requireUser();
  const seed = randomBytes(6).toString("hex");
  await db.update(users).set({ avatarSeed: seed, updatedAt: new Date() }).where(eq(users.id, user.id));
  revalidatePath(`/profil/${user.username}`);
  return { ok: true };
}

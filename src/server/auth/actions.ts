"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { loginSchema } from "@/lib/schemas/auth";
import { verifyPassword, getDummyHash } from "@/server/auth/password";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/server/auth/rate-limit";
import { createSession, destroySession } from "@/server/auth/session";
import { getClientIpHash } from "@/server/auth/ip";

export interface LoginFormState {
  error?: string;
}

const GENERIC_ERROR = "Identifiants incorrects.";

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }
  const { username, password } = parsed.data;
  const ipHash = await getClientIpHash();

  if (isRateLimited(username, ipHash)) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes." };
  }

  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const user = rows[0];

  // No such user: still run an argon2 verify against a dummy hash, so this path takes the
  // same time as a real wrong-password rejection — see password.ts's getDummyHash().
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    recordFailedAttempt(username, ipHash);
    return { error: GENERIC_ERROR };
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword || !user.isActive) {
    recordFailedAttempt(username, ipHash);
    return { error: GENERIC_ERROR };
  }

  clearAttempts(username, ipHash);
  await createSession(user.id, { ipHash });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  redirect("/accueil");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/connexion");
}

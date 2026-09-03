"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { apiTokens } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { generateToken } from "@/server/mcp/tokens";
import { createTokenSchema, type CreateTokenInput } from "@/lib/schemas/tokens";

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

export type CreateTokenResult =
  | { ok: true; token: string; tokenPrefix: string; expiresAt: Date | null }
  | { ok: false; error: string };

/** The one and only time the full secret is ever returned — never retrievable again after this
 *  response (C.3/C.4). Not stored anywhere except hashed (`token_hash`). */
export async function createMcpTokenAction(input: CreateTokenInput): Promise<CreateTokenResult> {
  const user = await requireUser();
  const parsed = createTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { name, scopes, expiryDays } = parsed.data;
  const generated = generateToken();
  const expiresAt =
    expiryDays === "never" ? null : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  await db.insert(apiTokens).values({
    userId: user.id,
    name,
    tokenHash: generated.tokenHash,
    tokenPrefix: generated.tokenPrefix,
    scopes,
    expiresAt,
  });

  revalidatePath("/profil/parametres/mcp");
  return { ok: true, token: generated.token, tokenPrefix: generated.tokenPrefix, expiresAt };
}

export type RevokeTokenResult = { ok: true } | { ok: false; error: string };

/** Self-revoke, or admin revoking anyone's token (C.4's admin cross-user view) — same action,
 *  since the permission check is identical shape either way. */
export async function revokeMcpTokenAction(tokenId: string): Promise<RevokeTokenResult> {
  const user = await requireUser();
  const [row] = await db
    .select({ userId: apiTokens.userId, revokedAt: apiTokens.revokedAt })
    .from(apiTokens)
    .where(eq(apiTokens.id, tokenId))
    .limit(1);
  if (!row) return { ok: false, error: "Jeton introuvable." };
  if (row.userId !== user.id && user.role !== "admin") {
    return { ok: false, error: "Vous ne pouvez révoquer que vos propres jetons." };
  }
  if (row.revokedAt) return { ok: true }; // already revoked — idempotent, not an error

  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, tokenId));
  revalidatePath("/profil/parametres/mcp");
  revalidatePath("/admin");
  return { ok: true };
}

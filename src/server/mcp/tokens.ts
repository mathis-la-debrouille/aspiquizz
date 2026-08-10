/**
 * Personal access token generation + verification — Addendum C.3. sha256, not argon2: the secret
 * is 32 random bytes (256 bits of entropy), not a guessable human password, so a fast hash is
 * correct here (argon2's whole point is slowing down guessing attacks against low-entropy
 * secrets, which doesn't apply). Every check below collapses to a single `{ ok: false }` on
 * failure — never a distinct reason — so the HTTP layer (server.ts's /mcp mount) can send back
 * byte-for-byte the same 401 body regardless of *why* a token didn't verify (no token, malformed,
 * unknown, revoked, expired, or a deactivated owner — C.8).
 */
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { apiTokens, users, type ApiTokenScope, type UserRole } from "@/server/db/schema";

const TOKEN_LITERAL_PREFIX = "aspi_pat_";
const DISPLAY_PREFIX_LEN = 12;
const LAST_USED_THROTTLE_MS = 60_000;

export interface GeneratedToken {
  /** The full secret — shown to the user exactly once, at creation. Never persisted anywhere. */
  token: string;
  tokenHash: string;
  tokenPrefix: string;
}

export function generateToken(): GeneratedToken {
  const token = TOKEN_LITERAL_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), tokenPrefix: token.slice(0, DISPLAY_PREFIX_LEN) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface McpAuthContext {
  tokenId: string;
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  scopes: ApiTokenScope[];
}

export type McpAuthResult = { ok: true; ctx: McpAuthContext } | { ok: false };

/**
 * Runs every step of C.3's verification order and stops at the first failure — but the caller
 * only ever sees `{ ok: false }`, on purpose. Also renews `last_used_at`, throttled to once/minute
 * per token so a busy client doesn't turn every tool call into a write.
 */
export async function verifyBearerToken(authHeader: string | null | undefined): Promise<McpAuthResult> {
  if (!authHeader) return { ok: false };
  const match = /^Bearer\s+(\S+)$/.exec(authHeader.trim());
  if (!match) return { ok: false };
  const token = match[1]!;
  if (!token.startsWith(TOKEN_LITERAL_PREFIX)) return { ok: false };

  const prefix = token.slice(0, DISPLAY_PREFIX_LEN);
  const candidates = await db.select().from(apiTokens).where(eq(apiTokens.tokenPrefix, prefix));
  if (candidates.length === 0) return { ok: false };

  const tokenHashBuf = Buffer.from(hashToken(token), "hex");
  const matched = candidates.find((row) => {
    const rowBuf = Buffer.from(row.tokenHash, "hex");
    return rowBuf.length === tokenHashBuf.length && timingSafeEqual(rowBuf, tokenHashBuf);
  });
  if (!matched) return { ok: false };
  if (matched.revokedAt) return { ok: false };
  if (matched.expiresAt && matched.expiresAt.getTime() <= Date.now()) return { ok: false };

  const [user] = await db.select().from(users).where(eq(users.id, matched.userId)).limit(1);
  if (!user || !user.isActive) return { ok: false };

  void touchLastUsed(matched.id);

  return {
    ok: true,
    ctx: {
      tokenId: matched.id,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      scopes: matched.scopes,
    },
  };
}

const lastTouchWriteMs = new Map<string, number>();

async function touchLastUsed(tokenId: string): Promise<void> {
  const now = Date.now();
  const prev = lastTouchWriteMs.get(tokenId) ?? 0;
  if (now - prev < LAST_USED_THROTTLE_MS) return;
  lastTouchWriteMs.set(tokenId, now);
  try {
    await db.update(apiTokens).set({ lastUsedAt: new Date(now) }).where(eq(apiTokens.id, tokenId));
  } catch {
    // Best-effort — a failed last_used_at write must never block the actual MCP request.
    lastTouchWriteMs.delete(tokenId);
  }
}

export function hasScope(ctx: McpAuthContext, scope: ApiTokenScope): boolean {
  return ctx.scopes.includes(scope);
}

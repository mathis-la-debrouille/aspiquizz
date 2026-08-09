import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sessions, users, type UserRole } from "@/server/db/schema";

const SESSION_COOKIE_NAME = process.env["SESSION_COOKIE_NAME"]?.trim() || "aspi_session";

export interface SocketUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarSeed: string;
}

/** Handshake headers don't go through next/headers — parse the raw Cookie header by hand. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/**
 * Authenticates a socket handshake from the same session cookie the HTTP
 * side uses. Never trusts a userId sent in a payload — this is the only
 * source of truth for "who is this socket" — brief §9.
 */
export async function authenticateHandshake(
  cookieHeader: string | undefined,
): Promise<SocketUser | null> {
  const cookies = parseCookies(cookieHeader);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      avatarSeed: users.avatarSeed,
      isActive: users.isActive,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!row.isActive) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return {
    id: row.userId,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    avatarSeed: row.avatarSeed,
  };
}

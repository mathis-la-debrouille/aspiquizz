import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sessions, users, type UserRole } from "@/server/db/schema";

const SESSION_COOKIE_NAME = process.env["SESSION_COOKIE_NAME"]?.trim() || "aspi_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEWAL_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renew when < 15 days remain

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarSeed: string;
}

export interface SessionInfo {
  sessionId: string;
  user: SessionUser;
  /** True when under the renewal threshold — the client should call /api/session/touch. */
  needsRenewal: boolean;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, meta: { ipHash: string }): Promise<void> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const headerList = await headers();

  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    userAgent: headerList.get("user-agent"),
    ipHash: meta.ipHash,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, id, cookieOptions(expiresAt));
}

/** Only callable from a Server Action or Route Handler — see destroySessionCookie below. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Read-only session lookup — safe to call from Server Components (layouts,
 * pages), which Next.js forbids from mutating cookies. Cached per request
 * with React `cache()` so repeated call sites in one render only hit the DB
 * once. Never writes to the DB or the cookie jar; see touchSession() for the
 * sliding-renewal write path, which runs from a Route Handler instead.
 */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const row = await lookupSession(sessionId);
  if (!row) return null;

  const remainingMs = row.expiresAt.getTime() - Date.now();
  return {
    sessionId: row.sessionId,
    needsRenewal: remainingMs < RENEWAL_THRESHOLD_MS,
    user: {
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      avatarSeed: row.avatarSeed,
    },
  };
});

async function lookupSession(sessionId: string) {
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      avatarSeed: users.avatarSeed,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!row.isActive) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/**
 * The sliding-renewal write path — extends both the DB row and the cookie.
 * Must run from a Route Handler or Server Action (Next.js forbids cookie
 * mutation during a plain Server Component render). Called by the
 * /api/session/touch route, which the app shell pings on mount when
 * getSession().needsRenewal is true — see SessionTouch client component.
 */
export async function touchSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return false;

  const row = await lookupSession(sessionId);
  if (!row) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return false;
  }

  const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt: newExpiresAt }).where(eq(sessions.id, sessionId));
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, cookieOptions(newExpiresAt));
  return true;
}

export { SESSION_COOKIE_NAME };

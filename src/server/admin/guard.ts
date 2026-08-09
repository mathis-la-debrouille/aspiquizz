import { getSession, type SessionUser } from "@/server/auth/session";

/** Every admin server action calls this first — the /admin route group's layout is only a
 *  UX-level redirect for the page itself, not a trust boundary on its own (brief's own
 *  convention: server actions re-check, they don't lean on a parent layout having run). */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    throw new Error("Accès réservé aux administrateurs.");
  }
  return session.user;
}

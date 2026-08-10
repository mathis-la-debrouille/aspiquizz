import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

/** /profil is always "my profile" — the real page lives at /profil/[username] so other
 *  players' profiles (from the leaderboard, a room roster, …) are linkable too. */
export default async function ProfilPage() {
  const session = await getSession();
  // The (app) layout already redirects unauthenticated requests to /connexion, but that's a
  // UX-level gate, not a trust boundary this page can lean on having already run (same
  // convention as every server action's own requireUser()) — confirmed by curl this crashed
  // with a non-null assertion here instead of redirecting cleanly.
  if (!session) redirect("/connexion");
  redirect(`/profil/${session.user.username}`);
}

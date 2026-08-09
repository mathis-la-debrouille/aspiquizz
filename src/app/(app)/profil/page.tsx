import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

/** /profil is always "my profile" — the real page lives at /profil/[username] so other
 *  players' profiles (from the leaderboard, a room roster, …) are linkable too. */
export default async function ProfilPage() {
  const session = await getSession();
  redirect(`/profil/${session!.user.username}`);
}

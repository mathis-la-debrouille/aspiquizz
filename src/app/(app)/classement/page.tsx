import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getLeaderboard } from "@/server/progression/queries";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Classement — ASPI Quiz" };

export default async function ClassementPage() {
  const [session, entries] = await Promise.all([getSession(), getLeaderboard(50)]);
  // Same defensive check as every other page here — the (app) layout's redirect is a UX gate,
  // not something a page can lean on having already run (see profil/page.tsx's own fix).
  if (!session) redirect("/connexion");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-26 text-ink-high">Classement</h1>
      {entries.length === 0 ? (
        <EmptyState
          title="Personne n'a encore joué."
          description="Lancez une partie pour apparaître ici."
        />
      ) : (
        <LeaderboardTable entries={entries} currentUserId={session.user.id} />
      )}
    </div>
  );
}

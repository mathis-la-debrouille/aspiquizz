import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getProfileByUsername } from "@/server/progression/queries";
import { xpForLevel, levelProgress } from "@/server/game/scoring";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { StatGrid } from "@/components/profile/StatGrid";
import { BadgeGrid } from "@/components/profile/BadgeGrid";
import { CategoryBreakdown } from "@/components/profile/CategoryBreakdown";
import { RecentGames } from "@/components/profile/RecentGames";
import { Panel } from "@/components/ui/Panel";

export const metadata: Metadata = { title: "Profil — ASPI Quiz" };

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [session, profile] = await Promise.all([getSession(), getProfileByUsername(username)]);
  // Same defensive check as every other page here — the (app) layout's redirect is a UX gate,
  // not something a page can lean on having already run (see profil/page.tsx's own fix).
  if (!session) redirect("/connexion");
  if (!profile) notFound();

  const isOwnProfile = session.user.id === profile.userId;
  const xpToNextLevel = Math.max(0, xpForLevel(profile.stats.level + 1) - profile.stats.xp);
  const earnedCount = profile.badges.filter((b) => b.earnedAt).length;

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader
        profile={profile}
        isOwnProfile={isOwnProfile}
        levelProgressValue={levelProgress(profile.stats.xp)}
        xpToNextLevel={xpToNextLevel}
      />
      <StatGrid stats={profile.stats} />
      <Panel title="Badges" eyebrow={`${earnedCount}/${profile.badges.length}`}>
        <BadgeGrid badges={profile.badges} />
      </Panel>
      <CategoryBreakdown categories={profile.categories} />
      <RecentGames games={profile.recentGames} />
    </div>
  );
}

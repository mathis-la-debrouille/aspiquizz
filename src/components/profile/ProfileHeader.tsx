import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProfileActions } from "@/components/profile/ProfileActions";
import type { ProfileData } from "@/server/progression/queries";

export function ProfileHeader({
  profile,
  isOwnProfile,
  levelProgressValue,
  xpToNextLevel,
}: {
  profile: ProfileData;
  isOwnProfile: boolean;
  levelProgressValue: number;
  xpToNextLevel: number;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border-soft bg-bg-raised p-6 shadow-[var(--shadow-2)] sm:flex-row sm:items-center sm:gap-6">
      <Avatar seed={profile.avatarSeed} size="xl" levelRingProgress={levelProgressValue} />

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-26 text-ink-high">{profile.displayName}</h1>
          <Badge tone="gold">Niveau {profile.stats.level}</Badge>
        </div>
        <p className="text-14 text-ink-faint">@{profile.username}</p>
        {profile.bio && <p className="max-w-prose text-14 text-ink-mid">{profile.bio}</p>}
        <ProgressBar
          value={levelProgressValue}
          label={`${profile.stats.xp} XP — ${xpToNextLevel} XP avant le niveau ${profile.stats.level + 1}`}
          tone="gold"
          className="max-w-xs"
        />
      </div>

      {isOwnProfile && (
        <ProfileActions displayName={profile.displayName} bio={profile.bio ?? ""} />
      )}
    </div>
  );
}

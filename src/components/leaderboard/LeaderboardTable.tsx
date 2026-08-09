import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { LeaderboardEntry } from "@/server/progression/queries";

const MEDALS = ["🥇", "🥈", "🥉"];

export function LeaderboardTable({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border-soft bg-bg-raised">
      {entries.map((entry) => (
        <Link
          key={entry.userId}
          href={`/profil/${entry.username}`}
          className={cn(
            "flex items-center gap-3 border-b border-border-soft px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-bg-surface",
            entry.userId === currentUserId && "bg-gold-deep/10",
          )}
        >
          <span className="font-numeral w-8 shrink-0 text-16 text-ink-faint">
            {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
          </span>
          <Avatar seed={entry.avatarSeed} size="sm" />
          <div className="flex flex-1 flex-col">
            <span className="text-14 font-medium text-ink-high">{entry.displayName}</span>
            <span className="text-12 text-ink-faint">
              Niveau {entry.level} · {entry.gamesPlayed} partie{entry.gamesPlayed > 1 ? "s" : ""}
            </span>
          </div>
          {entry.wins > 0 && (
            <Badge tone="gold">
              {entry.wins} victoire{entry.wins > 1 ? "s" : ""}
            </Badge>
          )}
          <span className="font-numeral w-20 shrink-0 text-right text-16 tabular-nums text-gold">
            {entry.xp} XP
          </span>
        </Link>
      ))}
    </div>
  );
}

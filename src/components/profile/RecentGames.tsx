import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ProfileRecentGame } from "@/server/progression/queries";

export function RecentGames({ games }: { games: ProfileRecentGame[] }) {
  if (games.length === 0) {
    return (
      <Panel title="Parties récentes">
        <EmptyState title="Aucune partie récente." />
      </Panel>
    );
  }

  return (
    <Panel title="Parties récentes">
      <div className="flex flex-col divide-y divide-border-soft">
        {games.map((g) => (
          <div key={g.roomId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-14 text-ink-high">{g.roomName}</span>
              <span className="text-12 text-ink-faint">
                {g.endedAt ? new Date(g.endedAt).toLocaleDateString("fr-FR") : "En cours"} ·{" "}
                {g.playerCount} joueur{g.playerCount > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {g.finalRank && (
                <Badge tone={g.finalRank === 1 ? "gold" : "neutral"}>#{g.finalRank}</Badge>
              )}
              <span className="font-numeral text-14 tabular-nums text-gold">{g.score} pts</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

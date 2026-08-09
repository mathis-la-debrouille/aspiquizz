import { Crown, WifiOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils/cn";

export interface PlayerChipProps {
  displayName: string;
  seed: string;
  isHost?: boolean;
  ready?: boolean;
  connected?: boolean;
  score?: number;
  className?: string;
}

export function PlayerChip({
  displayName,
  seed,
  isHost = false,
  ready,
  connected = true,
  score,
  className,
}: PlayerChipProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-border-soft bg-bg-surface py-2 pr-3 pl-2",
        !connected && "opacity-50",
        ready && "border-moss-deep",
        className,
      )}
    >
      <Avatar seed={seed} size="sm" />
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 truncate text-14 font-medium text-ink-high">
          {isHost && (
            <Crown aria-label="Hôte" strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0 text-gold" />
          )}
          <span className="truncate">{displayName}</span>
        </span>
        {score !== undefined && (
          <span className="font-numeral text-12 tabular-nums text-ink-faint">{score} pts</span>
        )}
      </div>
      {!connected && (
        <WifiOff aria-label="Déconnecté" strokeWidth={1.5} className="ml-auto h-4 w-4 text-clay" />
      )}
      {connected && ready !== undefined && (
        <span
          aria-hidden="true"
          className={cn("ml-auto h-2 w-2 rounded-full", ready ? "bg-moss" : "bg-border-hard")}
        />
      )}
    </div>
  );
}

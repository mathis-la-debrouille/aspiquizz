import {
  Swords,
  CheckCircle2,
  Zap,
  Globe2,
  BookOpen,
  Hammer,
  Flame,
  Heart,
  Map,
  Landmark,
  Award,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ProfileBadge } from "@/server/progression/queries";

// Keys must match badges.icon_key from scripts/seed-badges.ts.
const ICONS: Record<string, typeof Award> = {
  Swords,
  CheckCircle2,
  Zap,
  Globe2,
  BookOpen,
  Hammer,
  Flame,
  Heart,
  Map,
  Landmark,
};

export function BadgeGrid({ badges }: { badges: ProfileBadge[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {badges.map((b) => {
        const Icon = ICONS[b.iconKey] ?? Award;
        const earned = b.earnedAt !== null;
        return (
          <div
            key={b.id}
            title={`${b.nameFr} — ${b.descriptionFr}`}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 text-center",
              earned
                ? "border-gold-deep/60 bg-gold-deep/10"
                : "border-border-soft bg-bg-inset opacity-50",
            )}
          >
            <span className="relative">
              <Icon
                className={cn("h-8 w-8", earned ? "text-gold" : "text-ink-faint")}
                strokeWidth={1.5}
              />
              {!earned && (
                <Lock
                  className="absolute -right-1 -bottom-1 h-3.5 w-3.5 text-ink-faint"
                  strokeWidth={1.5}
                />
              )}
            </span>
            <span className="text-12 font-medium text-ink-high">{b.nameFr}</span>
            <span className="text-12 text-ink-faint">{b.descriptionFr}</span>
          </div>
        );
      })}
    </div>
  );
}

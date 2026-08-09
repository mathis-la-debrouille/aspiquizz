import { Panel } from "@/components/ui/Panel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { CategoryBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ProfileCategoryStat } from "@/server/progression/queries";

export function CategoryBreakdown({ categories }: { categories: ProfileCategoryStat[] }) {
  if (categories.length === 0) {
    return (
      <Panel title="Par catégorie">
        <EmptyState title="Aucune partie jouée pour l'instant." />
      </Panel>
    );
  }

  const sorted = [...categories].sort((a, b) => b.answered - a.answered);

  return (
    <Panel title="Par catégorie">
      <div className="flex flex-col gap-3">
        {sorted.map((c) => (
          <div key={c.categoryId} className="flex items-center gap-3">
            <div className="w-40 shrink-0">
              <CategoryBadge name={c.name} colorToken={c.colorToken} />
            </div>
            <ProgressBar
              value={c.answered > 0 ? c.correct / c.answered : 0}
              className="flex-1"
              tone="moss"
            />
            <span className="font-numeral w-16 shrink-0 text-right text-12 tabular-nums text-ink-faint">
              {c.correct}/{c.answered}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

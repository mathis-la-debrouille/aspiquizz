import { Card } from "@/components/ui/Card";
import type { ProfileStats } from "@/server/progression/queries";

export function StatGrid({ stats }: { stats: ProfileStats }) {
  const accuracy =
    stats.questionsAnswered > 0
      ? Math.round((stats.correctAnswers / stats.questionsAnswered) * 100)
      : 0;

  const items: { value: number | string; label: string }[] = [
    { value: stats.gamesPlayed, label: "Parties jouées" },
    { value: stats.wins, label: "Victoires" },
    { value: stats.correctAnswers, label: "Bonnes réponses" },
    { value: `${accuracy}%`, label: "Précision" },
    { value: stats.bestStreak, label: "Meilleure série" },
    { value: stats.totalPoints, label: "Points cumulés" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label} className="flex flex-col gap-1 p-4">
          <span className="font-numeral text-26 tabular-nums text-gold">{item.value}</span>
          <span className="text-12 text-ink-faint">{item.label}</span>
        </Card>
      ))}
    </div>
  );
}

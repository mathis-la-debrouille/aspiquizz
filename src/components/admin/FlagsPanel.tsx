"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DifficultyBadge } from "@/components/ui/Badge";
import { resolveFlagsAction } from "@/server/questions/flag-actions";
import type { FlaggedQuestion } from "@/server/questions/flags";
import type { FlagResolution } from "@/server/db/schema";

/**
 * The other half of the in-game report button. Players could raise a question from
 * the question screen, and the rows landed in `question_flags`, but nothing ever
 * read them — the queue was invisible, so a report went nowhere. That's the loop
 * this closes.
 *
 * Grouped by question, most-reported first, because the useful unit is "four people
 * disputed this one", not four identical rows.
 */
export function FlagsPanel({ flagged }: { flagged: FlaggedQuestion[] }) {
  const [rows, setRows] = useState(flagged);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(questionId: string, resolution: FlagResolution) {
    setError(null);
    startTransition(async () => {
      const result = await resolveFlagsAction(questionId, resolution);
      if (result.ok) setRows((prev) => prev.filter((r) => r.questionId !== questionId));
      else setError(result.error);
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucun signalement en attente"
        description="Les questions signalées pendant une partie apparaissent ici."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-14 text-clay-soft">{error}</p>}
      <p className="text-14 text-ink-mid">
        {rows.length} question{rows.length > 1 ? "s" : ""} signalée
        {rows.length > 1 ? "s" : ""} pendant une partie.
      </p>

      {rows.map((row) => (
        <Card key={row.questionId} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-16 text-ink-high">{row.prompt}</p>
              <p className="text-12 text-ink-faint">
                {row.type} · {row.status} · signalée par {row.reporters || "—"}
                {row.flagCount > 1 && ` · ${row.flagCount} fois`}
              </p>
            </div>
            <DifficultyBadge
              level={Math.min(5, Math.max(1, row.difficulty)) as 1 | 2 | 3 | 4 | 5}
            />
          </div>

          {row.reasons.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-border-soft bg-bg-inset px-3 py-2">
              {row.reasons.map((reason, i) => (
                <li key={i} className="text-14 text-ink-mid">
                  « {reason} »
                </li>
              ))}
            </ul>
          )}

          {/* Three outcomes, because "I looked at it" is not the same as "I changed
           *  it": the question was wrong and is fixed, it was wrong and is gone, or
           *  the report was mistaken and it stands. Rows are stamped, never deleted,
           *  so a question reported again later still reads as a pattern. */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => resolve(row.questionId, "fixed")}
            >
              Corrigée
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => resolve(row.questionId, "removed")}
            >
              Retirée du jeu
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => resolve(row.questionId, "kept")}
            >
              Signalement injustifié
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

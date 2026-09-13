"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DifficultyBadge } from "@/components/ui/Badge";
import { resolveFlagsAction } from "@/server/questions/flag-actions";
import type { FlaggedQuestion } from "@/server/questions/flags";
import type { FlagResolution } from "@/server/db/schema";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/**
 * The other half of the in-game report button: the queue an admin works through.
 *
 * Grouped by question, most-reported first, because the useful unit is "four people
 * disputed this one", not four identical rows. Each card shows what the game accepts
 * and the explanation next to who reported it and why — a report is a claim about the
 * answer, and it can't be judged without the answer in view.
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
        description="Les questions signalées pendant une partie, à la correction ou sur le podium apparaissent ici."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-14 text-clay-soft">{error}</p>}
      <p className="text-14 text-ink-mid">
        {rows.length} question{rows.length > 1 ? "s" : ""} signalée
        {rows.length > 1 ? "s" : ""}.
      </p>

      {rows.map((row) => (
        <Card key={row.questionId} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-16 text-ink-high">{row.prompt}</p>
              <p className="text-12 text-ink-faint">
                {row.categoryName} · {row.type}
                {row.status !== "published" && ` · ${row.status}`}
                {row.reports.length > 1 && ` · signalée ${row.reports.length} fois`}
              </p>
            </div>
            <DifficultyBadge
              level={Math.min(5, Math.max(1, row.difficulty)) as 1 | 2 | 3 | 4 | 5}
            />
          </div>

          <div className="rounded-md border border-moss-deep bg-moss-deep/15 px-3 py-2">
            <p className="text-12 uppercase tracking-wide text-ink-faint">Réponse acceptée</p>
            <p className="text-14 text-moss-glow">{row.correct || "—"}</p>
            {row.explanation && <p className="mt-1 text-12 text-ink-mid">{row.explanation}</p>}
          </div>

          <ul className="flex flex-col gap-1 rounded-md border border-border-soft bg-bg-inset px-3 py-2">
            {row.reports.map((report, i) => (
              <li key={i} className="text-14 text-ink-mid">
                <span className="font-medium text-ink-high">{report.displayName}</span>
                <span className="text-12 text-ink-faint">
                  {" "}
                  · {DATE_FORMAT.format(new Date(report.createdAt))}
                </span>
                {" — "}
                {report.reason ? (
                  <span>« {report.reason} »</span>
                ) : (
                  <span className="text-ink-faint">sans précision</span>
                )}
              </li>
            ))}
          </ul>

          {/* Three outcomes, because "I looked at it" is not the same as "I changed
           *  it": the question was wrong and is fixed, it was wrong and is gone, or
           *  the report was mistaken and it stands. Rows are stamped, never deleted,
           *  so a question reported again later still reads as a pattern. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Geo questions are generated and their editor isn't wired into edit mode
             *  (see CLAUDE.md), so the link would land on a form that can't load them. */}
            {row.type !== "geo" && (
              <Link
                href={`/creer/question/${row.questionId}`}
                className="text-14 text-moss-glow underline underline-offset-2"
              >
                Modifier la question
              </Link>
            )}
            <span className="flex-1" />
            <Button size="sm" disabled={isPending} onClick={() => resolve(row.questionId, "fixed")}>
              Corrigée
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => resolve(row.questionId, "removed")}
              title="Archive la question : elle ne sera plus tirée dans les parties. Réversible depuis l'onglet Questions."
            >
              Retirer du jeu
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

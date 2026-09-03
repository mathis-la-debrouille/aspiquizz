"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Eye, Pencil, Copy, Archive, ArchiveRestore, ImageOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  CategoryBadge,
  DifficultyBadge,
  QuestionTypeBadge,
  SourceBadge,
} from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { duplicateQuestion, bulkSetQuestionStatus } from "@/server/questions/library-actions";
import type { LibraryQuestionItem } from "@/server/questions/library";

const GeoMap = dynamic(() => import("@/components/map").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => null,
});

function relativeDateFr(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${Math.floor(months / 12)} an${months >= 24 ? "s" : ""}`;
}

function successRateBand(pct: number): "moss" | "gold" | "clay" {
  if (pct >= 70) return "moss";
  if (pct >= 40) return "gold";
  return "clay";
}

export function LibraryCard({
  question: q,
  viewerId,
  isAdmin,
  selected,
  selectable,
  onToggleSelect,
  onPreview,
  onChanged,
}: {
  question: LibraryQuestionItem;
  viewerId: string;
  isAdmin: boolean;
  selected: boolean;
  selectable: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const canEdit = isAdmin || q.authorId === viewerId;
  const successPct = q.timesAsked > 0 ? Math.round((q.timesCorrect / q.timesAsked) * 100) : null;

  async function handleDuplicate() {
    setPending(true);
    await duplicateQuestion(q.id);
    setPending(false);
    onChanged();
  }

  async function handleArchiveToggle() {
    setPending(true);
    await bulkSetQuestionStatus([q.id], q.status === "archived" ? "published" : "archived");
    setPending(false);
    onChanged();
  }

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-2 p-3",
        q.status === "draft" && "border-dashed border-gold-deep",
        q.status === "archived" && "opacity-55",
      )}
      elevation="raised"
    >
      {q.status === "draft" && (
        <span className="absolute top-2 right-2 rounded-sm border border-gold-deep/60 bg-gold-deep/25 px-1.5 py-0.5 text-12 font-medium text-gold-soft">
          Brouillon
        </span>
      )}
      {q.status === "archived" && (
        <span className="absolute top-2 right-2 rounded-sm border border-border-hard bg-bg-inset px-1.5 py-0.5 text-12 font-medium text-ink-faint">
          Archivée
        </span>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {selectable && (
          <Checkbox
            label=""
            aria-label="Sélectionner"
            checked={selected}
            onChange={() => onToggleSelect(q.id)}
          />
        )}
        <QuestionTypeBadge type={q.type} />
        <CategoryBadge name={q.categoryName} colorToken={q.categoryColorToken} />
        <DifficultyBadge level={q.difficulty as 1 | 2 | 3 | 4 | 5} />
        <SourceBadge source={q.source} />
      </div>

      {q.type === "image" && q.mediaId && imageBroken && (
        <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-soft bg-bg-inset text-ink-faint">
          <ImageOff className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-12">Image manquante</span>
        </div>
      )}
      {q.type === "image" && q.mediaId && !imageBroken && (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated /media/[id] route, not an optimizable static asset
        <img
          src={`/media/${q.mediaId}`}
          alt=""
          onError={() => setImageBroken(true)}
          className="h-24 w-full rounded-sm border border-border-soft object-cover"
        />
      )}
      {q.type === "geo" && q.geoTargetIso3 && (
        <div className="h-[72px] w-full overflow-hidden rounded-sm border border-border-soft bg-bg-inset">
          <GeoMap mode="silhouette" focusOn={q.geoTargetIso3} interactive={false} />
        </div>
      )}

      <p className="line-clamp-3 text-14 text-ink-high">{q.prompt}</p>

      <p className="text-12 text-ink-faint">
        {q.type === "mcq" &&
          `${q.choiceCount} choix${q.multiSelect ? " · plusieurs réponses" : ""}`}
        {q.type === "image" &&
          (q.answerMode === "mcq"
            ? `${q.choiceCount} choix${q.multiSelect ? " · plusieurs réponses" : ""}`
            : `${q.openAnswerCount} réponse${q.openAnswerCount > 1 ? "s" : ""} acceptée${q.openAnswerCount > 1 ? "s" : ""}`)}
        {q.type === "open" &&
          `${q.openAnswerCount} réponse${q.openAnswerCount > 1 ? "s" : ""} acceptée${q.openAnswerCount > 1 ? "s" : ""}`}
        {q.type === "sort" && `${q.sortItemCount} éléments à trier`}
        {q.type === "estimation" &&
          (q.estimationUnit ? `Estimation · ${q.estimationUnit}` : "Estimation numérique")}
      </p>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/profil/${q.authorUsername}`}
          className="flex items-center gap-1.5 text-12 text-ink-faint hover:text-ink-mid"
        >
          <Avatar seed={q.authorAvatarSeed} size="xs" />@{q.authorUsername}
        </Link>
        <span className="text-12 text-ink-faint">{relativeDateFr(q.createdAt)}</span>
      </div>

      {q.timesAsked > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-12 text-ink-faint">
            posée {q.timesAsked}× · {successPct}% de réussite
            {q.avgMs !== null && ` · ⌀ ${(q.avgMs / 1000).toFixed(1)} s`}
          </p>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-bg-inset">
            <div
              className={cn(
                "h-full rounded-full",
                successPct !== null && successRateBand(successPct) === "moss" && "bg-moss",
                successPct !== null && successRateBand(successPct) === "gold" && "bg-gold",
                successPct !== null && successRateBand(successPct) === "clay" && "bg-clay",
              )}
              style={{ width: `${successPct}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-12 text-ink-faint">jamais posée</p>
      )}

      <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label="Aperçu"
          onClick={() => onPreview(q.id)}
          className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high"
        >
          <Eye className="h-4 w-4" strokeWidth={1.5} />
        </button>
        {canEdit && q.type !== "geo" && (
          <Link
            href={`/creer/question/${q.id}`}
            aria-label="Modifier"
            className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        )}
        {canEdit && (
          <button
            type="button"
            aria-label="Dupliquer"
            disabled={pending}
            onClick={handleDuplicate}
            className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high disabled:opacity-40"
          >
            <Copy className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            aria-label={q.status === "archived" ? "Restaurer" : "Archiver"}
            disabled={pending}
            onClick={handleArchiveToggle}
            className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high disabled:opacity-40"
          >
            {q.status === "archived" ? (
              <ArchiveRestore className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Archive className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        )}
      </div>
    </Card>
  );
}

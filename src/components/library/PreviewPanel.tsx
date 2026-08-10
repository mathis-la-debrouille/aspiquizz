"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Pencil, Copy, Archive, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CategoryBadge, DifficultyBadge, QuestionTypeBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { OpenAnswerSurface } from "@/components/room/answer-surfaces/OpenAnswerSurface";
import { McqAnswerSurface } from "@/components/room/answer-surfaces/McqAnswerSurface";
import { ImageAnswerSurface } from "@/components/room/answer-surfaces/ImageAnswerSurface";
import { GeoAnswerSurface } from "@/components/room/answer-surfaces/GeoAnswerSurface";
import { toSanitisedQuestion } from "@/server/game/sanitize";
import {
  getPreviewData,
  duplicateQuestion,
  bulkSetQuestionStatus,
  type PreviewData,
} from "@/server/questions/library-actions";

const noop = () => {};

export function PreviewPanel({
  questionId,
  onClose,
  onNavigate,
  canGoPrev,
  canGoNext,
  viewerId,
  isAdmin,
  onChanged,
}: {
  questionId: string;
  onClose: () => void;
  onNavigate: (direction: 1 | -1) => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  viewerId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    void getPreviewData(questionId).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  const canEdit = data ? isAdmin || data.detail.authorId === viewerId : false;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Don't hijack arrow keys / "e" while the user is typing in an input inside the panel
      // (e.g. the open-answer preview field, even though it's disabled — still be defensive).
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && canGoPrev) onNavigate(-1);
      else if (e.key === "ArrowRight" && canGoNext) onNavigate(1);
      else if (e.key.toLowerCase() === "e" && canEdit && data) {
        router.push(`/creer/question/${data.detail.id}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onNavigate, canGoPrev, canGoNext, canEdit, data, router]);

  async function handleDuplicate() {
    if (!data) return;
    setPending(true);
    await duplicateQuestion(data.detail.id);
    setPending(false);
    onChanged();
  }

  async function handleArchive() {
    if (!data) return;
    setPending(true);
    await bulkSetQuestionStatus(
      [data.detail.id],
      data.detail.status === "archived" ? "published" : "archived",
    );
    setPending(false);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fermer l'aperçu"
        onClick={onClose}
        className="absolute inset-0 bg-bg-void/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Aperçu de la question"
        className="relative flex h-dvh w-full flex-col overflow-y-auto border-l border-border-hard bg-bg-raised p-5 shadow-[var(--shadow-lift)] sm:w-[480px]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Question précédente"
              disabled={!canGoPrev}
              onClick={() => onNavigate(-1)}
              className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Question suivante"
              disabled={!canGoNext}
              onClick={() => onNavigate(1)}
              className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {loading || !data ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <PreviewContent
            data={data}
            canEdit={canEdit}
            pending={pending}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
          />
        )}
      </div>
    </div>
  );
}

function PreviewContent({
  data,
  canEdit,
  pending,
  onDuplicate,
  onArchive,
}: {
  data: PreviewData;
  canEdit: boolean;
  pending: boolean;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const { detail, stats, choiceDistribution, geoCountry } = data;
  const sanitised = toSanitisedQuestion({
    id: detail.id,
    type: detail.type,
    prompt: detail.prompt,
    hint: detail.hint,
    categoryName: detail.categoryName,
    categoryColorToken: detail.categoryColorToken,
    difficulty: detail.difficulty,
    timeLimitS: 20, // unused by any answer surface — no timer is rendered in a static preview
    pointsBase: detail.pointsBase,
    authorUsername: detail.authorUsername,
    authorDisplayName: detail.authorDisplayName,
    authorAvatarSeed: detail.authorAvatarSeed,
    mediaId: detail.mediaId ?? undefined,
    answerMode: detail.answerMode ?? undefined,
    choices: detail.choices,
    geo: detail.geo ?? undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <QuestionTypeBadge type={detail.type} />
          <CategoryBadge name={detail.categoryName} colorToken={detail.categoryColorToken} />
          <DifficultyBadge level={detail.difficulty as 1 | 2 | 3 | 4 | 5} />
        </div>
        <h2 className="font-display text-20 text-ink-high">{detail.prompt}</h2>
        {detail.hint && <p className="text-12 text-ink-faint">Indice : {detail.hint}</p>}

        {/* Real, disabled answer surfaces — the same components a player sees mid-game, so this
            view can never visually drift from reality (Addendum A.6). */}
        {detail.type === "open" && <OpenAnswerSurface disabled onSubmit={noop} />}
        {detail.type === "mcq" && (
          <McqAnswerSurface
            choices={sanitised.choices ?? []}
            multiSelect={sanitised.multiSelect ?? false}
            disabled
            onSubmit={noop}
          />
        )}
        {detail.type === "image" && <ImageAnswerSurface question={sanitised} disabled onSubmit={noop} />}
        {detail.type === "geo" && <GeoAnswerSurface question={sanitised} disabled onSubmit={noop} />}
      </div>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-4">
        <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">Réponse</p>
        {detail.type === "open" && (
          <p className="text-16 text-moss-glow">{detail.openAnswers.join(" · ")}</p>
        )}
        {(detail.type === "mcq" || (detail.type === "image" && detail.answerMode === "mcq")) && (
          <ul className="flex flex-col gap-1">
            {detail.choices.map((c) => (
              <li
                key={c.id}
                className={c.isCorrect ? "text-16 text-moss-glow" : "text-14 text-ink-faint"}
              >
                {c.isCorrect ? "✓ " : "· "}
                {c.label}
              </li>
            ))}
          </ul>
        )}
        {detail.type === "image" && detail.answerMode === "open" && (
          <p className="text-16 text-moss-glow">{detail.openAnswers.join(" · ")}</p>
        )}
        {detail.type === "geo" && geoCountry && (
          <p className="text-16 text-moss-glow">
            {geoCountry.nameFr}
            {geoCountry.capitalFr && ` · ${geoCountry.capitalFr}`}
            {geoCountry.population && ` · ${(geoCountry.population / 1_000_000).toFixed(1)} M hab.`}
          </p>
        )}
        {detail.explanation && <p className="text-14 text-ink-mid">{detail.explanation}</p>}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-4 text-14 text-ink-mid">
        <div className="flex items-center gap-2">
          <Avatar seed={detail.authorAvatarSeed} size="xs" />
          <span>@{detail.authorUsername}</span>
        </div>
        <p className="text-12 text-ink-faint">{detail.pointsBase} points de base</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-4">
        <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">Statistiques</p>
        {stats.timesAsked > 0 ? (
          <p className="text-14 text-ink-mid">
            posée {stats.timesAsked}× · {Math.round((stats.timesCorrect / stats.timesAsked) * 100)}%
            de réussite
            {stats.avgMs !== null && ` · ⌀ ${(stats.avgMs / 1000).toFixed(1)} s`}
          </p>
        ) : (
          <p className="text-14 text-ink-faint">jamais posée</p>
        )}
        {choiceDistribution && choiceDistribution.some((c) => c.count > 0) && (
          <div className="flex flex-col gap-1">
            {choiceDistribution.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-12">
                <span className={c.isCorrect ? "text-moss-glow" : "text-ink-faint"}>{c.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-inset">
                  <div
                    className={c.isCorrect ? "h-full bg-moss" : "h-full bg-ink-faint"}
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
                <span className="font-numeral w-10 text-right text-ink-faint">{c.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-border-soft pt-4">
          {detail.type !== "geo" && (
            <a href={`/creer/question/${detail.id}`}>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Pencil className="h-4 w-4" strokeWidth={1.5} />}
              >
                Modifier
              </Button>
            </a>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={pending}
            leadingIcon={<Copy className="h-4 w-4" strokeWidth={1.5} />}
            onClick={onDuplicate}
          >
            Dupliquer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={pending}
            leadingIcon={<Archive className="h-4 w-4" strokeWidth={1.5} />}
            onClick={onArchive}
          >
            {detail.status === "archived" ? "Restaurer" : "Archiver"}
          </Button>
        </div>
      )}
    </div>
  );
}

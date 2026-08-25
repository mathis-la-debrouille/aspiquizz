"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { OpenAnswerSurface } from "@/components/room/answer-surfaces/OpenAnswerSurface";
import { FlagAnswerSurface } from "@/components/room/answer-surfaces/FlagAnswerSurface";
import type { AnswerPayload } from "@/components/room/QuestionScreen";
import type { SanitisedQuestion } from "@/server/game/sanitize";

const GeoMap = dynamic(() => import("@/components/map").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[58vh] min-h-72 items-center justify-center bg-geo-sea text-14 text-ink-high">
      Carte…
    </div>
  ),
});

const CLICK_MODES = new Set(["locate_country", "capital_of"]);

export function GeoAnswerSurface({
  question,
  disabled,
  committed,
  onSubmit,
  onDraft,
}: {
  question: SanitisedQuestion;
  disabled: boolean;
  committed: boolean;
  onSubmit: (payload: AnswerPayload) => void;
  onDraft: (payload: AnswerPayload) => void;
}) {
  const mode = question.geoMode!;
  const isClickMode = CLICK_MODES.has(mode);
  const isSilhouette = mode === "name_from_shape";

  // A click used to submit and lock immediately, so a misclick was final. It now
  // only *selects*: the country is highlighted, clicking elsewhere moves the
  // selection, and nothing is committed until Valider or the timer. Same rule as
  // typing — what is on screen when time runs out is the answer.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [question.id]);

  // The flag mode has no map at all — rendering one would show the country's
  // outline next to its flag and answer the question for the player.
  if (mode === "name_from_flag") {
    return (
      <FlagAnswerSurface
        iso3={question.revealIso3}
        disabled={disabled}
        committed={committed}
        onSubmit={onSubmit}
        onDraft={onDraft}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Viewport-relative, not a fixed h-72 (288px): on a laptop that left the map
       *  a small panel in the middle of an empty screen, and small countries were
       *  a few pixels wide. The map IS the question here, so it gets the room. */}
      <div className="h-[58vh] min-h-72 overflow-hidden rounded-md border border-border-soft bg-geo-sea">
        <GeoMap
          mode={isSilhouette ? "silhouette" : isClickMode ? "pick" : "display"}
          interactive={isClickMode && !disabled && !committed}
          focusOn={isSilhouette ? (question.revealIso3 ?? null) : null}
          highlight={!isSilhouette && question.revealIso3 ? [question.revealIso3] : []}
          dimOthers={!isClickMode && !isSilhouette}
          showLabels={question.showLabels}
          selected={isClickMode ? selected : null}
          onSelect={
            isClickMode && !committed
              ? (iso3) => {
                  setSelected(iso3);
                  onDraft({ iso3 });
                }
              : undefined
          }
        />
      </div>
      {isClickMode && !disabled && (
        <div className="flex flex-col gap-1.5">
          <Button
            disabled={committed || !selected}
            onClick={() => selected && onSubmit({ iso3: selected })}
          >
            {committed ? "Réponse verrouillée" : "Valider"}
          </Button>
          {!committed && selected && (
            <p className="text-12 text-ink-faint">
              Clique un autre pays pour changer d&apos;avis.
            </p>
          )}
        </div>
      )}
      {!isClickMode && (
        <OpenAnswerSurface
          disabled={disabled}
          committed={committed}
          onSubmit={onSubmit}
          onDraft={onDraft}
        />
      )}
    </div>
  );
}

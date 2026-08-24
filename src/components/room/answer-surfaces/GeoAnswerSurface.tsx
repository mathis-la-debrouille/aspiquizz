"use client";

import dynamic from "next/dynamic";
import { OpenAnswerSurface } from "@/components/room/answer-surfaces/OpenAnswerSurface";
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
  onSubmit,
}: {
  question: SanitisedQuestion;
  disabled: boolean;
  onSubmit: (payload: AnswerPayload) => void;
}) {
  const mode = question.geoMode!;
  const isClickMode = CLICK_MODES.has(mode);
  const isSilhouette = mode === "name_from_shape";

  return (
    <div className="flex flex-col gap-4">
      {/* Viewport-relative, not a fixed h-72 (288px): on a laptop that left the map
       *  a small panel in the middle of an empty screen, and small countries were
       *  a few pixels wide. The map IS the question here, so it gets the room. */}
      <div className="h-[58vh] min-h-72 overflow-hidden rounded-md border border-border-soft bg-geo-sea">
        <GeoMap
          mode={isSilhouette ? "silhouette" : isClickMode ? "pick" : "display"}
          interactive={isClickMode && !disabled}
          focusOn={isSilhouette ? (question.revealIso3 ?? null) : null}
          highlight={!isSilhouette && question.revealIso3 ? [question.revealIso3] : []}
          dimOthers={!isClickMode && !isSilhouette}
          showLabels={question.showLabels}
          onSelect={isClickMode ? (iso3) => onSubmit({ iso3 }) : undefined}
        />
      </div>
      {!isClickMode && <OpenAnswerSurface disabled={disabled} onSubmit={onSubmit} />}
    </div>
  );
}

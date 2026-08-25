"use client";

import { OpenAnswerSurface } from "@/components/room/answer-surfaces/OpenAnswerSurface";
import type { AnswerPayload } from "@/components/room/QuestionScreen";

/**
 * `name_from_flag` — the flag is shown, the player types the country.
 *
 * A real SVG, not `countries.flag_emoji`: at any size a quiz renders, 🇹🇩 Chad and
 * 🇷🇴 Romania are near-identical, as are 🇮🇩 Indonesia and 🇲🇨 Monaco, and 🇹🇼
 * Taiwan is hidden outright on some platforms. Assets live in public/flags/,
 * keyed by iso3, committed by scripts/build-flags.ts — same arrangement as
 * public/geo/'s topology, nothing fetched from a CDN at runtime.
 *
 * Sits on a pale plate rather than the page's dark surface: a flag with white in
 * it (Japan, Poland, Indonesia) needs a boundary, or its shape dissolves into the
 * background and half the answer is gone.
 */
export function FlagAnswerSurface({
  iso3,
  disabled,
  committed,
  onSubmit,
  onDraft,
}: {
  iso3: string | undefined;
  disabled: boolean;
  committed: boolean;
  onSubmit: (payload: AnswerPayload) => void;
  onDraft: (payload: AnswerPayload) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center rounded-md border border-border-soft bg-geo-land p-6">
        {iso3 ? (
          // A plain <img>, not next/image, and verified rather than assumed: the
          // optimizer endpoint answers 400 for an SVG source (it needs
          // dangerouslyAllowSVG), so next/image would render nothing here. The
          // file is served straight from public/ — 200 image/svg+xml — and an SVG
          // has nothing to optimize anyway.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/flags/${iso3}.svg`}
            alt="Drapeau à identifier"
            className="h-auto w-full max-w-md rounded-sm border border-geo-land-border shadow-lg"
          />
        ) : (
          <p className="text-14 text-ink-faint">Drapeau indisponible.</p>
        )}
      </div>
      <OpenAnswerSurface
        disabled={disabled}
        committed={committed}
        onSubmit={onSubmit}
        onDraft={onDraft}
      />
    </div>
  );
}

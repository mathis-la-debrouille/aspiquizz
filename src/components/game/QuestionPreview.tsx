"use client";

import dynamic from "next/dynamic";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { GeoMode } from "@/server/game/grading";
import type { CategoryOption } from "@/components/authoring/types";

const GeoMap = dynamic(() => import("@/components/map").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[240px] items-center justify-center text-14 text-ink-faint">
      Carte…
    </div>
  ),
});

export type PreviewChoice = { label: string; isCorrect: boolean };

export type PreviewData =
  | { type: "open"; prompt: string; hint?: string }
  | { type: "mcq"; prompt: string; choices: PreviewChoice[]; hint?: string }
  | {
      type: "image";
      prompt: string;
      imageUrl: string | null;
      answerMode: "mcq" | "open";
      choices: PreviewChoice[];
      hint?: string;
    }
  | { type: "geo"; prompt: string; geoMode: GeoMode; targetIso3: string | null; hint?: string };

const GEO_MODE_LABELS: Record<GeoMode, string> = {
  locate_country: "Localiser un pays",
  name_country: "Nommer un pays",
  find_capital: "Trouver une capitale",
  capital_of: "Capitale de quel pays",
  name_from_shape: "Deviner depuis la silhouette",
};

/**
 * Renders a question exactly as a player will see it, driven by whatever
 * state the authoring form currently holds — brief §10.1. No timer/submit
 * mechanics here (that's the real game screen, Phase 8); this is purely
 * visual fidelity for the author.
 */
export function QuestionPreview({
  data,
  category,
}: {
  data: PreviewData;
  category?: CategoryOption;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5" elevation="lifted">
      <div className="flex items-center gap-2">
        {category && <Badge tone={category.colorToken}>{category.name}</Badge>}
        <Badge tone="neutral">{typeLabel(data.type)}</Badge>
      </div>

      <h3 className="font-display text-20 text-ink-high">{data.prompt || "Votre question…"}</h3>

      {data.hint && <p className="text-12 text-ink-faint">Indice : {data.hint}</p>}

      {data.type === "open" && (
        <div className="h-11 rounded-md border border-border-hard bg-bg-inset px-3 py-2 text-14 text-ink-faint">
          Réponse du joueur…
        </div>
      )}

      {data.type === "mcq" && <ChoiceGrid choices={data.choices} />}

      {data.type === "image" && (
        <div className="flex flex-col gap-3">
          <div className="flex max-h-[42vh] items-center justify-center overflow-hidden rounded-md border border-border-soft bg-bg-inset">
            {data.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of a client-side object URL / /media/[id], not an optimizable static asset
              <img src={data.imageUrl} alt="" className="max-h-[42vh] w-full object-contain" />
            ) : (
              <p className="p-8 text-14 text-ink-faint">Aucune image</p>
            )}
          </div>
          {data.answerMode === "mcq" ? (
            <ChoiceGrid choices={data.choices} />
          ) : (
            <div className="h-11 rounded-md border border-border-hard bg-bg-inset px-3 py-2 text-14 text-ink-faint">
              Réponse du joueur…
            </div>
          )}
        </div>
      )}

      {data.type === "geo" && (
        <div className="flex h-72 flex-col gap-2">
          <div className="min-h-0 flex-1 rounded-md border border-border-soft bg-bg-inset">
            <GeoMap
              mode={data.geoMode === "name_from_shape" ? "silhouette" : "pick"}
              interactive={data.geoMode === "locate_country" || data.geoMode === "capital_of"}
              focusOn={data.geoMode === "name_from_shape" ? data.targetIso3 : null}
              highlight={
                data.geoMode === "name_country" && data.targetIso3 ? [data.targetIso3] : []
              }
              dimOthers={data.geoMode === "name_country"}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function ChoiceGrid({ choices }: { choices: PreviewChoice[] }) {
  if (choices.length === 0) {
    return <p className="text-14 text-ink-faint">Ajoutez des options…</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {choices.map((choice, i) => (
        <div
          key={i}
          className="rounded-md border border-border-hard bg-bg-inset px-3 py-2 text-14 text-ink-high"
        >
          {choice.label || `Option ${i + 1}`}
        </div>
      ))}
    </div>
  );
}

function typeLabel(type: PreviewData["type"]): string {
  switch (type) {
    case "open":
      return "Réponse libre";
    case "mcq":
      return "QCM";
    case "image":
      return "Image";
    case "geo":
      return "Géographie";
  }
}

export { GEO_MODE_LABELS };

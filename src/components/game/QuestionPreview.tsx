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
  | {
      type: "geo";
      prompt: string;
      geoMode: GeoMode;
      targetIso3: string | null;
      hint?: string;
      showLabels?: boolean;
      /** The editor's saved "cadrage" — see GeoMap's `frameOn` prop. */
      viewBbox?: [number, number, number, number] | null;
    }
  | {
      type: "sort";
      prompt: string;
      /** Author's own preview — shown in the actual correct order, unlike the shuffled order a
       *  player gets (sanitize.ts). Confirming the order is right is the point of this preview. */
      items: { label: string; imageUrl: string | null }[];
      hint?: string;
    };

const GEO_MODE_LABELS: Record<GeoMode, string> = {
  locate_country: "Localiser un pays",
  name_country: "Nommer un pays",
  find_capital: "Trouver une capitale",
  capital_of: "Capitale de quel pays",
  name_from_shape: "Deviner depuis la silhouette",
  name_from_flag: "Deviner depuis le drapeau",
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

      {data.type === "geo" && <GeoPreviewMap data={data} />}

      {data.type === "sort" && <SortPreviewList items={data.items} />}
    </Card>
  );
}

function SortPreviewList({ items }: { items: { label: string; imageUrl: string | null }[] }) {
  if (items.length === 0) {
    return <p className="text-14 text-ink-faint">Ajoutez des éléments…</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-md border border-border-hard bg-bg-inset px-3 py-2"
        >
          <span className="font-numeral text-14 text-ink-faint">{i + 1}</span>
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- preview of a client-side object URL / /media/[id], not an optimizable static asset
            <img
              src={item.imageUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-sm object-cover"
            />
          )}
          <span className="text-14 text-ink-high">{item.label || `Élément ${i + 1}`}</span>
        </li>
      ))}
    </ol>
  );
}

const GEO_CLICK_MODES: GeoMode[] = ["locate_country", "capital_of"];

/**
 * The map half of the geo preview — split out mainly so its highlight/dim logic can be compared
 * directly against the real answer surface (GeoAnswerSurface.tsx) that it's supposed to mirror.
 * Two real bugs lived here: `find_capital` was missing from the highlight/dim condition (only
 * `name_country` got it, so the target country never showed as anything but a plain map for
 * "Trouver une capitale" — a real player sees a highlighted country the same way name_country
 * does), and the saved cadrage/"afficher les noms" toggle were captured by the form but never
 * actually threaded down into this component's GeoMap at all. `editorChrome` is on here (unlike
 * the real in-game GeoAnswerSurface) so the author gets zoom controls to actually inspect the
 * preview, and — the same B.3 change already made to the picker map — no small-country hover
 * circles cluttering a screen the author isn't actually playing.
 */
function GeoPreviewMap({ data }: { data: Extract<PreviewData, { type: "geo" }> }) {
  const isClickMode = GEO_CLICK_MODES.includes(data.geoMode);
  const isSilhouette = data.geoMode === "name_from_shape";

  return (
    <div className="flex h-72 flex-col gap-2">
      <div className="min-h-0 flex-1 rounded-md border border-border-soft bg-bg-inset">
        <GeoMap
          mode={isSilhouette ? "silhouette" : isClickMode ? "pick" : "display"}
          editorChrome
          maxScale={24}
          interactive={isClickMode}
          focusOn={isSilhouette ? data.targetIso3 : null}
          frameOn={!isSilhouette ? (data.viewBbox ?? null) : null}
          highlight={!isSilhouette && data.targetIso3 ? [data.targetIso3] : []}
          dimOthers={!isClickMode && !isSilhouette}
          showLabels={data.showLabels ?? false}
        />
      </div>
    </div>
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
    case "sort":
      return "Tri";
  }
}

export { GEO_MODE_LABELS };

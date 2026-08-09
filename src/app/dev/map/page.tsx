"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { GeoMapMode } from "@/components/map";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

// Code-split: d3 never ships to a bundle that doesn't render a map — brief §8.4.
const GeoMap = dynamic(() => import("@/components/map").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[280px] items-center justify-center text-14 text-ink-faint">
      Chargement de la carte…
    </div>
  ),
});

const SAMPLE_ISO3 = ["PRT", "LSO", "SGP", "FRA", "KEN", "BRA", "AUS", "CAN", "RUS", "JPN"];

function PlaygroundControls() {
  const [mode, setMode] = useState<GeoMapMode>("pick");
  const [interactive, setInteractive] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [dimOthers, setDimOthers] = useState(false);
  const [focusOn, setFocusOn] = useState("");
  const [highlightInput, setHighlightInput] = useState("FRA");
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState("");
  const [wrong, setWrong] = useState("");
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  const highlight = highlightInput
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return (
    <Card className="flex flex-col gap-4 p-4" elevation="lifted">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select label="mode" value={mode} onChange={(e) => setMode(e.target.value as GeoMapMode)}>
          <option value="pick">pick</option>
          <option value="display">display</option>
          <option value="silhouette">silhouette</option>
        </Select>
        <Select label="focusOn" value={focusOn} onChange={(e) => setFocusOn(e.target.value)}>
          <option value="">(aucun)</option>
          {SAMPLE_ISO3.map((iso3) => (
            <option key={iso3} value={iso3}>
              {iso3}
            </option>
          ))}
        </Select>
        <Input
          label="highlight (csv)"
          value={highlightInput}
          onChange={(e) => setHighlightInput(e.target.value)}
        />
        <Input
          label="correct"
          value={correct}
          onChange={(e) => setCorrect(e.target.value.toUpperCase())}
        />
        <Input
          label="wrong"
          value={wrong}
          onChange={(e) => setWrong(e.target.value.toUpperCase())}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <Checkbox
          label="interactive"
          checked={interactive}
          onChange={(e) => setInteractive(e.target.checked)}
        />
        <Checkbox
          label="showLabels"
          checked={showLabels}
          onChange={(e) => setShowLabels(e.target.checked)}
        />
        <Checkbox
          label="dimOthers"
          checked={dimOthers}
          onChange={(e) => setDimOthers(e.target.checked)}
        />
      </div>
      <p className="text-14 text-ink-mid">
        selected: <span className="font-numeral">{selected ?? "—"}</span> · dernier clic confirmé:{" "}
        <span className="font-numeral">{lastClicked ?? "—"}</span>
      </p>
      <div className="h-[420px] w-full rounded-md border border-border-soft bg-bg-inset">
        <GeoMap
          mode={mode}
          interactive={interactive}
          showLabels={showLabels}
          dimOthers={dimOthers}
          highlight={highlight}
          focusOn={focusOn || null}
          selected={selected}
          correct={correct || null}
          wrong={wrong || null}
          onSelect={(iso3) => {
            setSelected(iso3);
            setLastClicked(iso3);
          }}
        />
      </div>
    </Card>
  );
}

function ModeCard({
  title,
  prompt,
  children,
}: {
  title: string;
  prompt: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-2 p-3" elevation="raised">
      <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">{title}</p>
      <p className="text-14 text-ink-high">{prompt}</p>
      <div className="h-64 w-full rounded-md border border-border-soft bg-bg-inset">{children}</div>
    </Card>
  );
}

function FiveModesShowcase() {
  const [locateResult, setLocateResult] = useState<string | null>(null);
  const [capitalOfResult, setCapitalOfResult] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ModeCard title="locate_country" prompt="Où se trouve le Portugal ?">
        <GeoMap
          mode="pick"
          interactive
          onSelect={(iso3) => setLocateResult(iso3 === "PRT" ? "✓ Portugal" : `✗ ${iso3}`)}
        />
        <p className="px-2 pb-2 text-12 text-ink-faint">{locateResult}</p>
      </ModeCard>

      <ModeCard title="name_country" prompt="Nommez ce pays en surbrillance (Lesotho).">
        <GeoMap
          mode="display"
          interactive={false}
          highlight={["LSO"]}
          dimOthers
          focusOn="LSO"
          showLabels
        />
      </ModeCard>

      <ModeCard title="find_capital" prompt="Quelle est la capitale du Kenya ?">
        <GeoMap
          mode="display"
          interactive={false}
          highlight={["KEN"]}
          dimOthers
          focusOn="KEN"
          showLabels
        />
      </ModeCard>

      <ModeCard title="capital_of" prompt="Singapour est la capitale de quel pays ?">
        <GeoMap
          mode="pick"
          interactive
          onSelect={(iso3) => setCapitalOfResult(iso3 === "SGP" ? "✓ Singapour" : `✗ ${iso3}`)}
        />
        <p className="px-2 pb-2 text-12 text-ink-faint">{capitalOfResult}</p>
      </ModeCard>

      <ModeCard
        title="name_from_shape"
        prompt="Silhouette seule — aucun contexte alentour (France)."
      >
        <GeoMap mode="silhouette" interactive={false} focusOn="FRA" />
      </ModeCard>
    </div>
  );
}

export default function MapDevPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <header>
        <h1 className="font-display text-34 text-ink-high">Terrain de jeu — GeoMap</h1>
        <p className="text-14 text-ink-mid">
          Route de développement uniquement — 404 en production. Vérifie chaque combinaison de props
          et les cinq sous-modes de question géographique (brief §6.4/§8).
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-26 text-ink-high">Props génériques</h2>
        <PlaygroundControls />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-26 text-ink-high">Cinq sous-modes géographiques</h2>
        <FiveModesShowcase />
      </section>
    </main>
  );
}

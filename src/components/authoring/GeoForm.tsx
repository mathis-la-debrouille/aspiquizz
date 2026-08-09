"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tabs } from "@/components/ui/Tabs";
import { SharedFields, type SharedFieldsValue } from "@/components/authoring/SharedFields";
import { QuestionPreview } from "@/components/game/QuestionPreview";
import { createGeoQuestion } from "@/server/questions/actions";
import { listCountries, type CountryOption } from "@/server/geo/actions";
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

const DEFAULT_SHARED: SharedFieldsValue = {
  categoryId: "",
  difficulty: 1,
  timeLimitS: 20,
  hint: "",
  explanation: "",
  status: "draft",
};

const GEO_MODES: { value: GeoMode; label: string }[] = [
  { value: "locate_country", label: "Localiser un pays" },
  { value: "name_country", label: "Nommer un pays" },
  { value: "find_capital", label: "Trouver une capitale" },
  { value: "capital_of", label: "Capitale de quel pays" },
  { value: "name_from_shape", label: "Deviner depuis la silhouette" },
];

function suggestPrompt(mode: GeoMode, country: CountryOption | undefined): string {
  if (!country) return "";
  switch (mode) {
    case "locate_country":
      return `Où se trouve ${country.nameFr} ?`;
    case "name_country":
      return "Quel est ce pays ?";
    case "find_capital":
      return `Quelle est la capitale ${prepositionOf(country.nameFr)} ?`;
    case "capital_of":
      return `${country.capitalFr ?? "?"} est la capitale de quel pays ?`;
    case "name_from_shape":
      return "Quel est ce pays, d'après sa silhouette ?";
  }
}

function prepositionOf(name: string): string {
  return /^[AEIOUÀÉÈÊ]/i.test(name) ? `d'${name}` : `de ${name}`;
}

function suggestAnswers(mode: GeoMode, country: CountryOption | undefined): string[] {
  if (!country) return [];
  if (mode === "find_capital") return country.capitalFr ? [country.capitalFr] : [];
  if (mode === "name_country" || mode === "name_from_shape") return [country.nameFr];
  return [];
}

export function GeoForm({
  categories,
  onCreated,
}: {
  categories: CategoryOption[];
  onCreated: (id: string) => void;
}) {
  const [shared, setShared] = useState(DEFAULT_SHARED);
  const [geoMode, setGeoMode] = useState<GeoMode>("locate_country");
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [search, setSearch] = useState("");
  const [targetIso3, setTargetIso3] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([]);
  const [strict, setStrict] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showNeighbours, setShowNeighbours] = useState(true);
  const [mobileTab, setMobileTab] = useState("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listCountries().then(setCountries);
  }, []);

  const target = countries.find((c) => c.iso3 === targetIso3);
  const category = categories.find((c) => c.id === shared.categoryId);

  // Auto-suggest prompt + accepted answers when mode/target change, unless the author edited
  // the prompt by hand — brief §10.1: "the form auto-suggests prompt text and accepted answers".
  useEffect(() => {
    if (!promptTouched) setPrompt(suggestPrompt(geoMode, target));
    setAcceptedAnswers(suggestAnswers(geoMode, target));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- promptTouched intentionally excluded, see effect body
  }, [geoMode, target]);

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return countries.slice(0, 12);
    const q = search.trim().toLowerCase();
    return countries.filter((c) => c.nameFr.toLowerCase().includes(q)).slice(0, 12);
  }, [countries, search]);

  const needsTextAnswers =
    geoMode === "name_country" || geoMode === "name_from_shape" || geoMode === "find_capital";
  const canSubmit =
    prompt && shared.categoryId && targetIso3 && (!needsTextAnswers || acceptedAnswers.length > 0);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await createGeoQuestion({
      type: "geo",
      prompt,
      geoMode,
      strict,
      targetIso3: targetIso3!,
      acceptedAnswers,
      showLabels,
      showNeighbours,
      viewBbox: null,
      ...shared,
    });
    setPending(false);
    if (!result.ok) setError(result.error);
    else onCreated(result.id);
  }

  const form = (
    <div className="flex flex-col gap-4">
      <Select
        label="Sous-mode"
        value={geoMode}
        onChange={(e) => setGeoMode(e.target.value as GeoMode)}
      >
        {GEO_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>

      <div className="flex flex-col gap-2">
        <span className="text-14 font-medium text-ink-mid">
          Pays cible {target && `— ${target.nameFr}`}
        </span>
        <Input
          placeholder="Rechercher un pays…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border-soft bg-bg-inset p-1">
          {filteredCountries.map((c) => (
            <button
              key={c.iso3}
              type="button"
              onClick={() => setTargetIso3(c.iso3)}
              className={`rounded-sm px-2 py-1.5 text-left text-14 transition-colors duration-150 ${
                targetIso3 === c.iso3
                  ? "bg-moss-deep/30 text-moss-glow"
                  : "text-ink-mid hover:bg-bg-surface"
              }`}
            >
              {c.nameFr}
            </button>
          ))}
        </div>
        <div className="h-56 rounded-md border border-border-soft bg-bg-inset">
          <GeoMap
            mode="pick"
            interactive
            selected={targetIso3}
            onSelect={(iso3) => setTargetIso3(iso3)}
          />
        </div>
      </div>

      <Input
        label="Question"
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setPromptTouched(true);
        }}
      />

      {needsTextAnswers && (
        <div className="flex flex-col gap-2">
          <span className="text-14 font-medium text-ink-mid">Réponses acceptées</span>
          {acceptedAnswers.map((a, i) => (
            <Input
              key={i}
              value={a}
              onChange={(e) =>
                setAcceptedAnswers(acceptedAnswers.map((v, vi) => (vi === i ? e.target.value : v)))
              }
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <Checkbox
          label="Correspondance stricte"
          checked={strict}
          onChange={(e) => setStrict(e.target.checked)}
        />
        <Checkbox
          label="Afficher les noms de pays"
          checked={showLabels}
          onChange={(e) => setShowLabels(e.target.checked)}
        />
        <Checkbox
          label="Afficher les pays voisins"
          checked={showNeighbours}
          onChange={(e) => setShowNeighbours(e.target.checked)}
        />
      </div>

      <SharedFields value={shared} onChange={setShared} categories={categories} />

      {error && <p className="text-14 text-clay-soft">{error}</p>}
      <Button type="button" loading={pending} disabled={!canSubmit} onClick={handleSubmit}>
        Enregistrer la question
      </Button>
    </div>
  );

  const preview = (
    <QuestionPreview
      data={{ type: "geo", prompt, geoMode, targetIso3, hint: shared.hint }}
      category={category}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="sm:hidden">
        <Tabs
          tabs={[
            { id: "form", label: "Formulaire" },
            { id: "preview", label: "Aperçu" },
          ]}
          value={mobileTab}
          onChange={setMobileTab}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className={mobileTab === "form" ? "block" : "hidden sm:block"}>{form}</div>
        <div className={mobileTab === "preview" ? "block" : "hidden sm:block"}>{preview}</div>
      </div>
    </div>
  );
}

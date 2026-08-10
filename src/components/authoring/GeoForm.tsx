"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CircleHelp } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioCard } from "@/components/ui/RadioCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { Tabs } from "@/components/ui/Tabs";
import { SharedFields, type SharedFieldsValue } from "@/components/authoring/SharedFields";
import { CountrySearchCombobox } from "@/components/authoring/CountrySearchCombobox";
import { QuestionPreview } from "@/components/game/QuestionPreview";
import { createGeoQuestion } from "@/server/questions/actions";
import { listCountries, type CountryOption } from "@/server/geo/actions";
import type { GeoMode } from "@/server/game/grading";
import type { CategoryOption } from "@/components/authoring/types";

const GeoMap = dynamic(() => import("@/components/map").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center text-14 text-ink-faint">
      Carte…
    </div>
  ),
});

const DEFAULT_SHARED: SharedFieldsValue = {
  categoryId: "",
  difficulty: 1,
  hint: "",
  explanation: "",
  status: "draft",
};

// Addendum B.3.5, step 1 — one-line description of what the *player* does, not the author.
const GEO_MODES: { value: GeoMode; label: string; description: string }[] = [
  { value: "locate_country", label: "Localiser un pays", description: "Le joueur clique le pays sur la carte." },
  { value: "name_country", label: "Nommer un pays", description: "Un pays est surligné ; le joueur tape son nom." },
  { value: "find_capital", label: "Trouver une capitale", description: "Le joueur tape la capitale d'un pays surligné." },
  { value: "capital_of", label: "Capitale de quel pays", description: "Le joueur clique le pays dont on donne la capitale." },
  { value: "name_from_shape", label: "Deviner depuis la silhouette", description: "Seule la silhouette est visible ; le joueur tape le nom." },
];

const CLICK_MODES: GeoMode[] = ["locate_country", "capital_of"];

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

function formatPopulation(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M hab.` : `${(n / 1000).toFixed(0)} k hab.`;
}

/** The "?" info affordance + permanent helper line for each of the three options — Addendum
 *  B.3.4. A <button>, not a plain span, so it's reachable by keyboard focus and tap alike. */
function OptionField({
  label,
  helper,
  tooltip,
  checked,
  onChange,
}: {
  label: string;
  helper: string;
  tooltip: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <Checkbox label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <Tooltip content={tooltip}>
          <button
            type="button"
            aria-label={`En savoir plus sur « ${label} »`}
            className="text-ink-faint hover:text-ink-high"
          >
            <CircleHelp className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </Tooltip>
      </div>
      <p className="pl-6 text-12 text-ink-faint">{helper}</p>
    </div>
  );
}

export function GeoForm({
  categories,
  onCategoriesChange,
  onCreated,
}: {
  categories: CategoryOption[];
  onCategoriesChange: (next: CategoryOption[]) => void;
  onCreated: (id: string) => void;
}) {
  const [shared, setShared] = useState(DEFAULT_SHARED);
  const [geoMode, setGeoMode] = useState<GeoMode>("locate_country");
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [targetIso3, setTargetIso3] = useState<string | null>(null);
  const [liveBbox, setLiveBbox] = useState<[number, number, number, number] | null>(null);
  const [savedViewBbox, setSavedViewBbox] = useState<[number, number, number, number] | null>(null);
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
  const isClickMode = CLICK_MODES.includes(geoMode);

  // Auto-suggest prompt + accepted answers when mode/target change, unless the author edited
  // the prompt by hand — brief §10.1, reordered per Addendum B.3.5.
  useEffect(() => {
    if (!promptTouched) setPrompt(suggestPrompt(geoMode, target));
    setAcceptedAnswers(suggestAnswers(geoMode, target));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- promptTouched intentionally excluded, see effect body
  }, [geoMode, target]);

  // "Correspondance stricte" is meaningless for click-based modes — Addendum B.3.4.
  useEffect(() => {
    if (isClickMode) setStrict(false);
  }, [isClickMode]);

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
      viewBbox: savedViewBbox,
      ...shared,
    });
    setPending(false);
    if (!result.ok) setError(result.error);
    else onCreated(result.id);
  }

  const form = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-14 font-medium text-ink-mid">Mode de question</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GEO_MODES.map((m) => (
            <RadioCard
              key={m.value}
              name="geo-mode"
              value={m.value}
              label={m.label}
              description={m.description}
              checked={geoMode === m.value}
              onChange={() => setGeoMode(m.value)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-14 font-medium text-ink-mid">Pays cible</span>
        {!target && (
          <CountrySearchCombobox
            countries={countries}
            value={null}
            onSelect={(c) => setTargetIso3(c.iso3)}
            onClear={() => setTargetIso3(null)}
          />
        )}
        <div className="flex aspect-[16/10] min-h-[420px] flex-col overflow-hidden rounded-md border border-border-soft bg-bg-inset">
          <div className="min-h-0 flex-1">
            <GeoMap
              mode="pick"
              interactive
              editorChrome
              maxScale={12}
              selected={targetIso3}
              onSelect={(iso3) => setTargetIso3(iso3)}
              onViewChange={setLiveBbox}
            />
          </div>
          {target && (
            <div className="flex items-center justify-between gap-2 border-t border-border-soft bg-bg-raised px-3 py-2">
              <p className="text-14 text-ink-high">
                Cible : {target.flagEmoji} {target.nameFr}
                {target.capitalFr && ` · ${target.capitalFr}`}
                {target.population && ` · ${formatPopulation(target.population)}`}
              </p>
              <button
                type="button"
                onClick={() => setTargetIso3(null)}
                className="shrink-0 text-14 text-gold-soft hover:text-gold"
              >
                Changer
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-14 font-medium text-ink-mid">Cadrage</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!liveBbox}
            onClick={() => setSavedViewBbox(liveBbox)}
          >
            Utiliser cette vue comme cadrage
          </Button>
          {savedViewBbox && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSavedViewBbox(null)}>
              Réinitialiser le cadrage
            </Button>
          )}
          {savedViewBbox && <span className="text-12 text-ink-faint">Cadrage enregistré</span>}
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

      <div className="flex flex-col gap-3">
        {!isClickMode && (
          <OptionField
            label="Correspondance stricte"
            helper="Désactive la tolérance aux fautes de frappe."
            tooltip="Par défaut, une réponse écrite est acceptée malgré une petite faute d'orthographe ou un accent manquant. Avec la correspondance stricte, la réponse doit être exactement identique. À réserver aux réponses courtes ou techniques."
            checked={strict}
            onChange={setStrict}
          />
        )}
        <OptionField
          label="Afficher les noms de pays"
          helper="Les noms sont écrits sur la carte pendant la question."
          tooltip="Les joueurs voient le nom de chaque pays sur la carte. Facilite beaucoup les questions de localisation — à laisser désactivé pour une question difficile."
          checked={showLabels}
          onChange={setShowLabels}
        />
        <OptionField
          label="Afficher les pays voisins"
          helper="Le pays cible est montré avec les pays alentour."
          tooltip="Désactivé, le pays apparaît seul, sans contexte autour : c'est nettement plus difficile. Activé, les joueurs voient la région entière."
          checked={showNeighbours}
          onChange={setShowNeighbours}
        />
      </div>

      <SharedFields
        value={shared}
        onChange={setShared}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
      />

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

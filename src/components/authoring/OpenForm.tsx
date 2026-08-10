"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tabs } from "@/components/ui/Tabs";
import { SharedFields, type SharedFieldsValue } from "@/components/authoring/SharedFields";
import { QuestionPreview } from "@/components/game/QuestionPreview";
import { normalizeAnswer } from "@/server/game/grading";
import { createOpenQuestion, updateOpenQuestion } from "@/server/questions/actions";
import type { CategoryOption } from "@/components/authoring/types";

const DEFAULT_SHARED: SharedFieldsValue = {
  categoryId: "",
  difficulty: 1,
  hint: "",
  explanation: "",
  status: "draft",
};

export interface OpenFormInitial {
  id: string;
  prompt: string;
  strict: boolean;
  primaryAnswer: string;
  variants: string[];
  shared: SharedFieldsValue;
}

export function OpenForm({
  categories,
  onCategoriesChange,
  onCreated,
  initial,
}: {
  categories: CategoryOption[];
  onCategoriesChange: (next: CategoryOption[]) => void;
  onCreated: (id: string) => void;
  /** Present in edit mode (/creer/question/[id]) — saves call updateOpenQuestion instead of
   *  createOpenQuestion, everything else about the form is identical. */
  initial?: OpenFormInitial;
}) {
  const [shared, setShared] = useState(initial?.shared ?? DEFAULT_SHARED);
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [strict, setStrict] = useState(initial?.strict ?? false);
  const [primaryAnswer, setPrimaryAnswer] = useState(initial?.primaryAnswer ?? "");
  const [variants, setVariants] = useState<string[]>(initial?.variants ?? []);
  const [newVariant, setNewVariant] = useState("");
  const [mobileTab, setMobileTab] = useState("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === shared.categoryId);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const payload = { type: "open" as const, prompt, strict, primaryAnswer, variants, ...shared };
    const result = initial
      ? await updateOpenQuestion(initial.id, payload)
      : await createOpenQuestion(payload);
    setPending(false);
    if (!result.ok) setError(result.error);
    else onCreated(result.id);
  }

  const form = (
    <div className="flex flex-col gap-4">
      <Input label="Question" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <Input
        label="Réponse principale"
        value={primaryAnswer}
        onChange={(e) => setPrimaryAnswer(e.target.value)}
      />
      {primaryAnswer && (
        <p className="text-12 text-ink-faint">
          Réponse comparée : « {normalizeAnswer(primaryAnswer)} »
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-14 font-medium text-ink-mid">Variantes acceptées</span>
        {variants.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-1 rounded-md border border-border-hard bg-bg-inset px-3 py-2 text-14">
              {v}
            </span>
            <button
              type="button"
              aria-label="Retirer cette variante"
              onClick={() => setVariants(variants.filter((_, vi) => vi !== i))}
              className="text-ink-faint hover:text-clay-soft"
            >
              <X strokeWidth={1.5} className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={newVariant}
            onChange={(e) => setNewVariant(e.target.value)}
            placeholder="Ajouter une variante…"
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />}
            onClick={() => {
              if (!newVariant.trim()) return;
              setVariants([...variants, newVariant.trim()]);
              setNewVariant("");
            }}
          >
            Ajouter
          </Button>
        </div>
      </div>

      <Checkbox
        label="Correspondance stricte"
        description="Désactive la tolérance aux fautes de frappe (ex. codes IATA)."
        checked={strict}
        onChange={(e) => setStrict(e.target.checked)}
      />

      <SharedFields
        value={shared}
        onChange={setShared}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
      />

      {error && <p className="text-14 text-clay-soft">{error}</p>}
      <Button
        type="button"
        loading={pending}
        disabled={!prompt || !primaryAnswer || !shared.categoryId}
        onClick={handleSubmit}
      >
        {initial ? "Enregistrer les modifications" : "Enregistrer la question"}
      </Button>
    </div>
  );

  const preview = (
    <QuestionPreview data={{ type: "open", prompt, hint: shared.hint }} category={category} />
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

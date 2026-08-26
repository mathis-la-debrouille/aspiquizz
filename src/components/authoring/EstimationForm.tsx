"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { SharedFields, type SharedFieldsValue } from "@/components/authoring/SharedFields";
import { QuestionPreview } from "@/components/game/QuestionPreview";
import { createEstimationQuestion, updateEstimationQuestion } from "@/server/questions/actions";
import type { CategoryOption } from "@/components/authoring/types";

const DEFAULT_SHARED: SharedFieldsValue = {
  categoryId: "",
  difficulty: 1,
  hint: "",
  explanation: "",
  status: "draft",
};

export interface EstimationFormInitial {
  id: string;
  prompt: string;
  correctValue: number;
  toleranceType: "absolute" | "percentage";
  toleranceValue: number;
  unit: string;
  shared: SharedFieldsValue;
}

/** "Combien de bananes faut-il manger pour mourir ? 400" — the author sets the true value and
 *  how close counts as "near enough" (brief per this addendum's own request); grading.ts scores
 *  each player independently on their own distance to it, not against each other. */
export function EstimationForm({
  categories,
  onCategoriesChange,
  onCreated,
  initial,
}: {
  categories: CategoryOption[];
  onCategoriesChange: (next: CategoryOption[]) => void;
  onCreated: (id: string) => void;
  initial?: EstimationFormInitial;
}) {
  const [shared, setShared] = useState(initial?.shared ?? DEFAULT_SHARED);
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [correctValue, setCorrectValue] = useState(initial?.correctValue?.toString() ?? "");
  const [toleranceType, setToleranceType] = useState<"absolute" | "percentage">(
    initial?.toleranceType ?? "absolute",
  );
  const [toleranceValue, setToleranceValue] = useState(initial?.toleranceValue?.toString() ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [mobileTab, setMobileTab] = useState("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === shared.categoryId);
  const parsedValue = Number(correctValue);
  const parsedTolerance = Number(toleranceValue);
  const validNumbers =
    correctValue !== "" &&
    toleranceValue !== "" &&
    Number.isFinite(parsedValue) &&
    Number.isFinite(parsedTolerance) &&
    parsedTolerance > 0;

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const payload = {
      type: "estimation" as const,
      prompt,
      correctValue: parsedValue,
      toleranceType,
      toleranceValue: parsedTolerance,
      unit,
      ...shared,
    };
    const result = initial
      ? await updateEstimationQuestion(initial.id, payload)
      : await createEstimationQuestion(payload);
    setPending(false);
    if (!result.ok) setError(result.error);
    else onCreated(result.id);
  }

  const form = (
    <div className="flex flex-col gap-4">
      <Input
        label="Question"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Combien de bananes faut-il manger pour mourir ?"
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Valeur correcte"
          type="number"
          value={correctValue}
          onChange={(e) => setCorrectValue(e.target.value)}
        />
        <Input
          label="Unité (facultatif)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="bananes, km, habitants…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Type de tolérance"
          value={toleranceType}
          onChange={(e) => setToleranceType(e.target.value as "absolute" | "percentage")}
        >
          <option value="absolute">Marge fixe (± N)</option>
          <option value="percentage">Marge en % (± N %)</option>
        </Select>
        <Input
          label={toleranceType === "percentage" ? "Marge (%)" : "Marge (± unité)"}
          type="number"
          min={0}
          value={toleranceValue}
          onChange={(e) => setToleranceValue(e.target.value)}
        />
      </div>

      {validNumbers && (
        <p className="text-12 text-ink-faint">
          « Assez proche » : entre{" "}
          {toleranceType === "percentage"
            ? (parsedValue - (Math.abs(parsedValue) * parsedTolerance) / 100).toFixed(1)
            : parsedValue - parsedTolerance}{" "}
          et{" "}
          {toleranceType === "percentage"
            ? (parsedValue + (Math.abs(parsedValue) * parsedTolerance) / 100).toFixed(1)
            : parsedValue + parsedTolerance}
          {unit ? ` ${unit}` : ""} — plus la réponse est proche de {parsedValue}, plus elle
          rapporte de points.
        </p>
      )}

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
        disabled={!prompt || !validNumbers || !shared.categoryId}
        onClick={handleSubmit}
      >
        {initial ? "Enregistrer les modifications" : "Enregistrer la question"}
      </Button>
    </div>
  );

  const preview = (
    <QuestionPreview data={{ type: "estimation", prompt, unit, hint: shared.hint }} category={category} />
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

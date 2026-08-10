"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { SharedFields, type SharedFieldsValue } from "@/components/authoring/SharedFields";
import { QuestionPreview } from "@/components/game/QuestionPreview";
import { createMcqQuestion, updateMcqQuestion } from "@/server/questions/actions";
import type { CategoryOption } from "@/components/authoring/types";

const DEFAULT_SHARED: SharedFieldsValue = {
  categoryId: "",
  difficulty: 1,
  hint: "",
  explanation: "",
  status: "draft",
};

interface Choice {
  label: string;
  isCorrect: boolean;
}

export interface McqFormInitial {
  id: string;
  prompt: string;
  choices: Choice[];
  shared: SharedFieldsValue;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

export function McqForm({
  categories,
  onCategoriesChange,
  onCreated,
  initial,
}: {
  categories: CategoryOption[];
  onCategoriesChange: (next: CategoryOption[]) => void;
  onCreated: (id: string) => void;
  initial?: McqFormInitial;
}) {
  const [shared, setShared] = useState(initial?.shared ?? DEFAULT_SHARED);
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [choices, setChoices] = useState<Choice[]>(
    initial?.choices ?? [
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
    ],
  );
  const [mobileTab, setMobileTab] = useState("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === shared.categoryId);
  const correctCount = choices.filter((c) => c.isCorrect).length;
  const duplicateLabels =
    new Set(choices.map((c) => c.label.trim().toLowerCase())).size !== choices.length;
  const canSubmit =
    prompt &&
    shared.categoryId &&
    choices.length >= 2 &&
    choices.every((c) => c.label.trim()) &&
    correctCount >= 1 &&
    !duplicateLabels;

  function updateChoice(i: number, patch: Partial<Choice>) {
    setChoices(choices.map((c, ci) => (ci === i ? { ...c, ...patch } : c)));
  }

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const payload = { type: "mcq" as const, prompt, choices, ...shared };
    const result = initial
      ? await updateMcqQuestion(initial.id, payload)
      : await createMcqQuestion(payload);
    setPending(false);
    if (!result.ok) setError(result.error);
    else onCreated(result.id);
  }

  const form = (
    <div className="flex flex-col gap-4">
      <Input label="Question" value={prompt} onChange={(e) => setPrompt(e.target.value)} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-14 font-medium text-ink-mid">
            Options {correctCount > 1 && "· Plusieurs réponses"}
          </span>
        </div>
        {choices.map((choice, i) => (
          <div key={i} className="flex items-center gap-2">
            <Checkbox
              label=""
              aria-label={`Option ${i + 1} correcte`}
              checked={choice.isCorrect}
              onChange={(e) => updateChoice(i, { isCorrect: e.target.checked })}
            />
            <Input
              value={choice.label}
              onChange={(e) => updateChoice(i, { label: e.target.value })}
              placeholder={`Option ${i + 1}`}
              className="flex-1"
            />
            <button
              type="button"
              aria-label="Monter"
              disabled={i === 0}
              onClick={() => setChoices(move(choices, i, i - 1))}
              className="text-ink-faint hover:text-ink-high disabled:opacity-30"
            >
              <ArrowUp strokeWidth={1.5} className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Descendre"
              disabled={i === choices.length - 1}
              onClick={() => setChoices(move(choices, i, i + 1))}
              className="text-ink-faint hover:text-ink-high disabled:opacity-30"
            >
              <ArrowDown strokeWidth={1.5} className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Retirer cette option"
              disabled={choices.length <= 2}
              onClick={() => setChoices(choices.filter((_, ci) => ci !== i))}
              className="text-ink-faint hover:text-clay-soft disabled:opacity-30"
            >
              <X strokeWidth={1.5} className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />}
          disabled={choices.length >= 6}
          onClick={() => setChoices([...choices, { label: "", isCorrect: false }])}
        >
          Ajouter une option
        </Button>
        {duplicateLabels && (
          <p className="text-12 text-clay-soft">Les options doivent être uniques.</p>
        )}
        {correctCount === 0 && (
          <p className="text-12 text-clay-soft">Marquez au moins une bonne réponse.</p>
        )}
      </div>

      <SharedFields
        value={shared}
        onChange={setShared}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
      />

      {error && <p className="text-14 text-clay-soft">{error}</p>}
      <Button type="button" loading={pending} disabled={!canSubmit} onClick={handleSubmit}>
        {initial ? "Enregistrer les modifications" : "Enregistrer la question"}
      </Button>
    </div>
  );

  const preview = (
    <QuestionPreview
      data={{ type: "mcq", prompt, choices, hint: shared.hint }}
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

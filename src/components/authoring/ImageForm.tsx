"use client";

import { useState } from "react";
import { Upload, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { RadioCard } from "@/components/ui/RadioCard";
import { Tabs } from "@/components/ui/Tabs";
import { SharedFields, type SharedFieldsValue } from "@/components/authoring/SharedFields";
import { QuestionPreview } from "@/components/game/QuestionPreview";
import { downscaleImage } from "@/lib/utils/downscale-image";
import { normalizeAnswer } from "@/server/game/grading";
import { createImageQuestion } from "@/server/questions/actions";
import type { CategoryOption } from "@/components/authoring/types";

const DEFAULT_SHARED: SharedFieldsValue = {
  categoryId: "",
  difficulty: 1,
  timeLimitS: 20,
  hint: "",
  explanation: "",
  status: "draft",
};

interface Choice {
  label: string;
  isCorrect: boolean;
}

export function ImageForm({
  categories,
  onCreated,
}: {
  categories: CategoryOption[];
  onCreated: (id: string) => void;
}) {
  const [shared, setShared] = useState(DEFAULT_SHARED);
  const [prompt, setPrompt] = useState("");
  const [answerMode, setAnswerMode] = useState<"mcq" | "open">("open");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [primaryAnswer, setPrimaryAnswer] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const [newVariant, setNewVariant] = useState("");
  const [choices, setChoices] = useState<Choice[]>([
    { label: "", isCorrect: false },
    { label: "", isCorrect: false },
  ]);
  const [strict, setStrict] = useState(false);
  const [mobileTab, setMobileTab] = useState("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === shared.categoryId);
  const canSubmit =
    prompt &&
    shared.categoryId &&
    mediaId &&
    (answerMode === "open"
      ? Boolean(primaryAnswer)
      : choices.length >= 2 &&
        choices.every((c) => c.label.trim()) &&
        choices.some((c) => c.isCorrect));

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const resized = await downscaleImage(file);
      setImageUrl(URL.createObjectURL(resized));
      const formData = new FormData();
      formData.set("file", resized);
      const res = await fetch("/api/media", { method: "POST", body: formData });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Échec de l'envoi.");
      setMediaId(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await createImageQuestion({
      type: "image",
      prompt,
      mediaId: mediaId!,
      answerMode,
      strict,
      // Only send the fields relevant to the chosen answer mode — the unused mode's
      // still-default/empty state (e.g. two blank MCQ choices while in "open" mode)
      // would otherwise fail that branch's own validation for no reason.
      primaryAnswer: answerMode === "open" ? primaryAnswer : "",
      variants: answerMode === "open" ? variants : [],
      choices: answerMode === "mcq" ? choices : [],
      ...shared,
    });
    setPending(false);
    if (!result.ok) setError(result.error);
    else onCreated(result.id);
  }

  const form = (
    <div className="flex flex-col gap-4">
      <Input label="Question" value={prompt} onChange={(e) => setPrompt(e.target.value)} />

      <div className="flex flex-col gap-2">
        <span className="text-14 font-medium text-ink-mid">Image</span>
        <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-hard bg-bg-inset text-14 text-ink-faint hover:border-moss">
          <Upload strokeWidth={1.5} className="h-5 w-5" />
          {uploading ? "Envoi…" : mediaId ? "Remplacer l'image" : "Glisser une image ou cliquer"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <RadioCard
          name="answerMode"
          value="open"
          label="Réponse libre"
          checked={answerMode === "open"}
          onChange={() => setAnswerMode("open")}
        />
        <RadioCard
          name="answerMode"
          value="mcq"
          label="QCM"
          checked={answerMode === "mcq"}
          onChange={() => setAnswerMode("mcq")}
        />
      </div>

      {answerMode === "open" ? (
        <>
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
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 rounded-md border border-border-hard bg-bg-inset px-3 py-2 text-14">
                  {v}
                </span>
                <button
                  type="button"
                  aria-label="Retirer"
                  onClick={() => setVariants(variants.filter((_, vi) => vi !== i))}
                >
                  <X strokeWidth={1.5} className="h-4 w-4 text-ink-faint hover:text-clay-soft" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newVariant}
                onChange={(e) => setNewVariant(e.target.value)}
                placeholder="Variante acceptée…"
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!newVariant.trim()) return;
                  setVariants([...variants, newVariant.trim()]);
                  setNewVariant("");
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
          <Checkbox
            label="Correspondance stricte"
            checked={strict}
            onChange={(e) => setStrict(e.target.checked)}
          />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                label=""
                aria-label={`Option ${i + 1} correcte`}
                checked={choice.isCorrect}
                onChange={(e) =>
                  setChoices(
                    choices.map((c, ci) => (ci === i ? { ...c, isCorrect: e.target.checked } : c)),
                  )
                }
              />
              <Input
                value={choice.label}
                onChange={(e) =>
                  setChoices(
                    choices.map((c, ci) => (ci === i ? { ...c, label: e.target.value } : c)),
                  )
                }
                placeholder={`Option ${i + 1}`}
                className="flex-1"
              />
              <button
                type="button"
                aria-label="Retirer"
                disabled={choices.length <= 2}
                onClick={() => setChoices(choices.filter((_, ci) => ci !== i))}
                className="disabled:opacity-30"
              >
                <X strokeWidth={1.5} className="h-4 w-4 text-ink-faint hover:text-clay-soft" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={choices.length >= 6}
            onClick={() => setChoices([...choices, { label: "", isCorrect: false }])}
          >
            Ajouter une option
          </Button>
        </div>
      )}

      <SharedFields value={shared} onChange={setShared} categories={categories} />

      {error && <p className="text-14 text-clay-soft">{error}</p>}
      <Button type="button" loading={pending} disabled={!canSubmit} onClick={handleSubmit}>
        Enregistrer la question
      </Button>
    </div>
  );

  const preview = (
    <QuestionPreview
      data={{ type: "image", prompt, imageUrl, answerMode, choices, hint: shared.hint }}
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

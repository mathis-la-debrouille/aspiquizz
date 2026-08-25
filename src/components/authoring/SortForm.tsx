"use client";

import { useState } from "react";
import { Upload, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { DragSortList } from "@/components/ui/DragSortList";
import { SharedFields, type SharedFieldsValue } from "@/components/authoring/SharedFields";
import { QuestionPreview } from "@/components/game/QuestionPreview";
import { downscaleImage } from "@/lib/utils/downscale-image";
import { createSortQuestion, updateSortQuestion } from "@/server/questions/actions";
import type { CategoryOption } from "@/components/authoring/types";

const DEFAULT_SHARED: SharedFieldsValue = {
  categoryId: "",
  difficulty: 1,
  hint: "",
  explanation: "",
  status: "draft",
};

const MIN_ITEMS = 3;
const MAX_ITEMS = 6;

/** Local-only id for React keys / DragSortList, discarded on submit — question_sort_items rows
 *  get their real ids from the DB insert, same as question_choices does. */
interface DraftItem {
  key: string;
  label: string;
  mediaId: string | null;
  uploading: boolean;
}

export interface SortFormInitial {
  id: string;
  prompt: string;
  items: { label: string; mediaId: string | null }[];
  shared: SharedFieldsValue;
}

let keySeq = 0;
function newKey(): string {
  keySeq += 1;
  return `draft-${keySeq}`;
}

export function SortForm({
  categories,
  onCategoriesChange,
  onCreated,
  initial,
}: {
  categories: CategoryOption[];
  onCategoriesChange: (next: CategoryOption[]) => void;
  onCreated: (id: string) => void;
  initial?: SortFormInitial;
}) {
  const [shared, setShared] = useState(initial?.shared ?? DEFAULT_SHARED);
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [items, setItems] = useState<DraftItem[]>(
    initial?.items.map((i) => ({ key: newKey(), label: i.label, mediaId: i.mediaId, uploading: false })) ?? [
      { key: newKey(), label: "", mediaId: null, uploading: false },
      { key: newKey(), label: "", mediaId: null, uploading: false },
      { key: newKey(), label: "", mediaId: null, uploading: false },
    ],
  );
  const [mobileTab, setMobileTab] = useState("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === shared.categoryId);
  const canSubmit =
    prompt.trim().length >= 3 &&
    shared.categoryId &&
    items.length >= MIN_ITEMS &&
    items.every((i) => i.label.trim()) &&
    !items.some((i) => i.uploading);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function addItem() {
    if (items.length >= MAX_ITEMS) return;
    setItems((prev) => [...prev, { key: newKey(), label: "", mediaId: null, uploading: false }]);
  }

  function removeItem(key: string) {
    if (items.length <= MIN_ITEMS) return;
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function handleFile(key: string, file: File) {
    updateItem(key, { uploading: true });
    setError(null);
    try {
      const resized = await downscaleImage(file);
      const formData = new FormData();
      formData.set("file", resized);
      const res = await fetch("/api/media", { method: "POST", body: formData });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Échec de l'envoi.");
      updateItem(key, { mediaId: body.id, uploading: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi.");
      updateItem(key, { uploading: false });
    }
  }

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const payload = {
      type: "sort" as const,
      prompt,
      // Array order IS the correct order — DragSortList already keeps `items` in the order the
      // author dragged them into.
      items: items.map((i) => ({ label: i.label.trim(), mediaId: i.mediaId })),
      ...shared,
    };
    const result = initial
      ? await updateSortQuestion(initial.id, payload)
      : await createSortQuestion(payload);
    setPending(false);
    if (!result.ok) setError(result.error);
    else onCreated(result.id);
  }

  const form = (
    <div className="flex flex-col gap-4">
      <Input label="Question" value={prompt} onChange={(e) => setPrompt(e.target.value)} />

      <div className="flex flex-col gap-2">
        <span className="text-14 font-medium text-ink-mid">
          Éléments à trier — l&apos;ordre ci-dessous est l&apos;ordre correct
        </span>
        <p className="text-12 text-ink-faint">
          Une image est facultative par élément : laissez-la vide pour un tri en texte seul.
        </p>
        <DragSortList
          items={items}
          getId={(i) => i.key}
          onReorder={setItems}
          renderItem={(item) => (
            <div className="flex items-center gap-2 py-1.5">
              <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-dashed border-border-hard bg-bg-surface text-ink-faint hover:border-moss">
                {item.uploading ? (
                  <span className="text-12">…</span>
                ) : item.mediaId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated /media/[id] route, not an optimizable static asset
                  <img src={`/media/${item.mediaId}`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Upload className="h-4 w-4" strokeWidth={1.5} />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(item.key, file);
                  }}
                />
              </label>
              <Input
                value={item.label}
                onChange={(e) => updateItem(item.key, { label: e.target.value })}
                placeholder="Libellé…"
                className="flex-1"
              />
              {item.mediaId && (
                <button
                  type="button"
                  aria-label="Retirer l'image"
                  onClick={() => updateItem(item.key, { mediaId: null })}
                  className="shrink-0"
                >
                  <X strokeWidth={1.5} className="h-4 w-4 text-ink-faint hover:text-clay-soft" />
                </button>
              )}
              <button
                type="button"
                aria-label="Retirer l'élément"
                disabled={items.length <= MIN_ITEMS}
                onClick={() => removeItem(item.key)}
                className="shrink-0 disabled:opacity-30"
              >
                <X strokeWidth={1.5} className="h-4 w-4 text-ink-faint hover:text-clay-soft" />
              </button>
            </div>
          )}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={items.length >= MAX_ITEMS}
          onClick={addItem}
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} /> Ajouter un élément
        </Button>
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
      data={{
        type: "sort",
        prompt,
        items: items.map((i) => ({
          label: i.label,
          imageUrl: i.mediaId ? `/media/${i.mediaId}` : null,
        })),
        hint: shared.hint,
      }}
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

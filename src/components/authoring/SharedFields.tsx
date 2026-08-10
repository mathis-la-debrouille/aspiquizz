"use client";

import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import type { CategoryOption } from "@/components/authoring/types";

export interface SharedFieldsValue {
  categoryId: string;
  difficulty: number;
  hint: string;
  explanation: string;
  status: "draft" | "published";
}

interface SharedFieldsProps {
  value: SharedFieldsValue;
  onChange: (next: SharedFieldsValue) => void;
  categories: CategoryOption[];
}

const DIFFICULTY_LABELS = ["1", "2", "3", "4", "5"];

export function SharedFields({ value, onChange, categories }: SharedFieldsProps) {
  function set<K extends keyof SharedFieldsValue>(key: K, v: SharedFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Catégorie"
        value={value.categoryId}
        onChange={(e) => set("categoryId", e.target.value)}
      >
        <option value="">Choisir…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <div className="flex flex-col gap-1.5">
        <span className="text-14 font-medium text-ink-mid">Difficulté</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Difficulté">
          {DIFFICULTY_LABELS.map((label, i) => {
            const level = i + 1;
            const active = value.difficulty === level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set("difficulty", level)}
                className={cn(
                  "h-9 flex-1 rounded-sm border text-14 font-medium transition-colors duration-150",
                  active
                    ? "border-gold-deep bg-gold text-bg-void"
                    : "border-border-hard bg-bg-inset text-ink-mid hover:bg-bg-surface",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <Input
        label="Indice (optionnel)"
        value={value.hint}
        onChange={(e) => set("hint", e.target.value)}
        maxLength={280}
      />
      <Textarea
        label="Explication (affichée à la révélation, optionnel)"
        value={value.explanation}
        onChange={(e) => set("explanation", e.target.value)}
        maxLength={1000}
        rows={3}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-14 font-medium text-ink-mid">Statut</span>
        <div className="flex gap-2">
          {(["draft", "published"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => set("status", status)}
              className={cn(
                "h-9 flex-1 rounded-sm border text-14 font-medium transition-colors duration-150",
                value.status === status
                  ? "border-moss-deep bg-moss text-bg-void"
                  : "border-border-hard bg-bg-inset text-ink-mid hover:bg-bg-surface",
              )}
            >
              {status === "draft" ? "Brouillon" : "Publiée"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

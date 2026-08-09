"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuestionCard } from "@/components/authoring/QuestionCard";
import { createQuiz } from "@/server/questions/actions";
import type { CategoryOption } from "@/components/authoring/types";
import type { QuestionListItem } from "@/server/questions/queries";

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

export function QuizBuilder({
  categories,
  pool,
}: {
  categories: CategoryOption[];
  pool: QuestionListItem[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(pool.map((q) => [q.id, q])), [pool]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((q): q is QuestionListItem => !!q);

  const filteredPool = pool.filter((q) => {
    if (selectedIds.includes(q.id)) return false;
    if (filterCategory && q.categoryName !== filterCategory) return false;
    if (search && !q.prompt.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await createQuiz({
      title,
      description,
      categoryId,
      status,
      questionIds: selectedIds,
    });
    setPending(false);
    if (!result.ok) setError(result.error);
    else setCreatedId(result.id);
  }

  if (createdId) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-moss-deep bg-moss-deep/10 px-6 py-10 text-center">
        <h2 className="font-display text-26 text-ink-high">Quiz enregistré</h2>
        <Button
          onClick={() => {
            setCreatedId(null);
            setTitle("");
            setDescription("");
            setSelectedIds([]);
          }}
        >
          Créer un autre quiz
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Input label="Titre du quiz" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          label="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select
          label="Catégorie (optionnel)"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <div className="flex flex-col gap-2">
          <span className="text-14 font-medium text-ink-mid">
            Questions sélectionnées ({selected.length})
          </span>
          {selected.length === 0 ? (
            <EmptyState
              title="Aucune question ajoutée."
              description="Choisissez dans le vivier à droite."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {selected.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2">
                  <span className="font-numeral w-6 text-12 text-ink-faint">{i + 1}</span>
                  <div className="flex-1">
                    <QuestionCard question={q} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      aria-label="Monter"
                      disabled={i === 0}
                      onClick={() => setSelectedIds(move(selectedIds, i, i - 1))}
                      className="text-ink-faint hover:text-ink-high disabled:opacity-30"
                    >
                      <ArrowUp strokeWidth={1.5} className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descendre"
                      disabled={i === selected.length - 1}
                      onClick={() => setSelectedIds(move(selectedIds, i, i + 1))}
                      className="text-ink-faint hover:text-ink-high disabled:opacity-30"
                    >
                      <ArrowDown strokeWidth={1.5} className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Retirer"
                      onClick={() => setSelectedIds(selectedIds.filter((id) => id !== q.id))}
                      className="text-ink-faint hover:text-clay-soft"
                    >
                      <X strokeWidth={1.5} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {(["draft", "published"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`h-9 flex-1 rounded-sm border text-14 font-medium transition-colors duration-150 ${
                status === s
                  ? "border-moss-deep bg-moss text-bg-void"
                  : "border-border-hard bg-bg-inset text-ink-mid hover:bg-bg-surface"
              }`}
            >
              {s === "draft" ? "Brouillon" : "Publié"}
            </button>
          ))}
        </div>

        {error && <p className="text-14 text-clay-soft">{error}</p>}
        <Button
          type="button"
          loading={pending}
          disabled={!title || selectedIds.length === 0}
          onClick={handleSubmit}
        >
          Enregistrer le quiz
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-14 font-medium text-ink-mid">Vivier de questions</span>
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex max-h-[600px] flex-col gap-2 overflow-y-auto">
          {filteredPool.length === 0 ? (
            <EmptyState title="Aucune question trouvée." />
          ) : (
            filteredPool.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedIds([...selectedIds, q.id])}
                className="text-left"
              >
                <QuestionCard question={q} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { Toggle } from "@/components/ui/Toggle";
import { DIFFICULTY_LABELS_FR } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { LIBRARY_STATUSES, QUESTION_TYPES, type QuestionLibraryQuery } from "@/lib/schemas/library";
import type { CategoryOption } from "@/components/authoring/types";
import type { QuestionAuthorOption } from "@/server/questions/library";
import type { LibraryFacets } from "@/server/questions/library";
import type { QuestionType } from "@/server/db/schema";

const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

const TYPE_LABELS: Record<QuestionType, string> = {
  open: "Libre",
  mcq: "QCM",
  image: "Image",
  geo: "Géographie",
};

const STATUS_LABELS: Record<(typeof LIBRARY_STATUSES)[number], string> = {
  published: "Publiées",
  draft: "Brouillons",
  archived: "Archivées",
  all: "Toutes",
};

const SCOPE_TABS = [
  { id: "all", label: "Toutes" },
  { id: "mine", label: "Mes questions" },
  { id: "drafts", label: "Mes brouillons" },
];

export function FilterRail({
  query,
  categories,
  authors,
  facets,
  onPendingChange,
}: {
  query: QuestionLibraryQuery;
  categories: CategoryOption[];
  authors: QuestionAuthorOption[];
  facets: LibraryFacets;
  /** Called with the transition's pending state — lets the results area (a sibling, not a
   *  descendant of this rail) show its own quick loading indicator while a filter change is
   *  refetching, without this component needing to know anything about that area. */
  onPendingChange: (pending: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [qDraft, setQDraft] = useState(query.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setQDraft(query.q), [query.q]);
  useEffect(() => onPendingChange(isPending), [isPending, onPendingChange]);

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // Wrapped in a transition (not a plain router.push) so isPending above reflects the whole
    // round trip — URL update, the server re-fetching this route with the new searchParams, and
    // the RSC payload streaming back — which is what actually takes the visible ~1-2s.
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function setScalar(key: string, value: string) {
    pushParams((params) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
  }

  function toggleArrayValue(key: string, value: string) {
    pushParams((params) => {
      const current = params.getAll(key);
      params.delete(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      for (const v of next) params.append(key, v);
    });
  }

  function handleSearchChange(value: string) {
    setQDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setScalar("q", value), 250);
  }

  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (query.q) activeChips.push({ key: "q", label: `« ${query.q} »`, clear: () => setScalar("q", "") });
  for (const t of query.type) {
    activeChips.push({
      key: `type-${t}`,
      label: TYPE_LABELS[t],
      clear: () => toggleArrayValue("type", t),
    });
  }
  for (const c of query.cat) {
    const cat = categories.find((x) => x.id === c);
    activeChips.push({
      key: `cat-${c}`,
      label: cat?.name ?? c,
      clear: () => toggleArrayValue("cat", c),
    });
  }
  if (query.dmin > 1 || query.dmax < 5) {
    activeChips.push({
      key: "difficulty",
      label: `Difficulté ${query.dmin}–${query.dmax}`,
      clear: () =>
        pushParams((params) => {
          params.delete("dmin");
          params.delete("dmax");
        }),
    });
  }
  if (query.author) {
    const author = authors.find((a) => a.id === query.author);
    activeChips.push({
      key: "author",
      label: `@${author?.username ?? query.author}`,
      clear: () => setScalar("author", ""),
    });
  }

  function clearAll() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        tabs={SCOPE_TABS}
        value={query.scope}
        onChange={(v) => setScalar("scope", v === "all" ? "" : v)}
      />

      <Input
        label="Recherche"
        placeholder="Question, réponse, option…"
        value={qDraft}
        onChange={(e) => handleSearchChange(e.target.value)}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-14 font-medium text-ink-mid">Type</span>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_TYPES.map((t) => {
            const active = query.type.includes(t);
            const count = facets.byType[t] ?? 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleArrayValue("type", t)}
                className={cn(
                  "rounded-sm border px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                  active
                    ? "border-gold-deep bg-gold text-bg-void"
                    : "border-border-hard bg-bg-inset text-ink-mid hover:bg-bg-surface",
                )}
              >
                {TYPE_LABELS[t]} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-14 font-medium text-ink-mid">Catégorie</span>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const active = query.cat.includes(c.id);
            const count = facets.byCategory[c.id] ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleArrayValue("cat", c.id)}
                className={cn(
                  "rounded-sm border px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                  active ? "border-2" : "border",
                )}
                style={{
                  borderColor: `var(--color-${c.colorToken}-deep)`,
                  backgroundColor: active ? `var(--color-${c.colorToken}-deep)` : "transparent",
                  color: active ? "var(--color-bg-void)" : "var(--color-ink-mid)",
                }}
              >
                {c.name} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-14 font-medium text-ink-mid">Difficulté</span>
        {/* Two bounded <select>s, not a dual-thumb range slider — a pair of native range inputs
         *  side by side rendered as two disjoint tracks with no visual link between them (looked
         *  like one broken slider with a gap in the middle) and, worse, both spanned the full
         *  1–5 scale independently so nothing stopped dmin from being dragged past dmax. Each
         *  select's own option list is bounded by the other's current value instead, so an
         *  invalid range can't be picked at all. */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Au moins"
            value={query.dmin}
            onChange={(e) => setScalar("dmin", e.target.value)}
            className="h-9 text-14"
          >
            {DIFFICULTY_LEVELS.filter((v) => v <= query.dmax).map((v) => (
              <option key={v} value={v}>
                {v} · {DIFFICULTY_LABELS_FR[v - 1]}
              </option>
            ))}
          </Select>
          <Select
            label="Au plus"
            value={query.dmax}
            onChange={(e) => setScalar("dmax", e.target.value)}
            className="h-9 text-14"
          >
            {DIFFICULTY_LEVELS.filter((v) => v >= query.dmin).map((v) => (
              <option key={v} value={v}>
                {v} · {DIFFICULTY_LABELS_FR[v - 1]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Select label="Auteur" value={query.author} onChange={(e) => setScalar("author", e.target.value)}>
        <option value="">Tous</option>
        <option value="me">Moi</option>
        {authors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName}
          </option>
        ))}
      </Select>

      <div className="flex flex-col gap-1.5">
        <span className="text-14 font-medium text-ink-mid">Statut</span>
        <div className="flex flex-wrap gap-1.5">
          {LIBRARY_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScalar("status", s === "published" ? "" : s)}
              className={cn(
                "rounded-sm border px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                query.status === s
                  ? "border-moss-deep bg-moss text-bg-void"
                  : "border-border-hard bg-bg-inset text-ink-mid hover:bg-bg-surface",
              )}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <Toggle
        label="Grouper par catégorie"
        checked={query.groupBy === "category"}
        onChange={(e) => setScalar("groupBy", e.target.checked ? "category" : "")}
      />

      <Toggle
        label="Jamais relue"
        checked={query.neverReviewed}
        onChange={(e) => setScalar("neverReviewed", e.target.checked ? "1" : "")}
      />

      {activeChips.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                aria-label={`Retirer le filtre ${chip.label}`}
                className="inline-flex items-center gap-1 rounded-sm border border-gold-deep/60 bg-gold-deep/25 px-2 py-0.5 text-12 font-medium text-gold-soft transition-colors duration-150 hover:bg-gold-deep/40"
              >
                {chip.label}
                <X className="h-3 w-3" strokeWidth={1.5} />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="self-start text-12 text-ink-faint underline hover:text-ink-mid"
          >
            Tout effacer
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { FilterRail } from "@/components/library/FilterRail";
import { LibraryCard } from "@/components/library/LibraryCard";
import { LibraryTable } from "@/components/library/LibraryTable";
import { PreviewPanel } from "@/components/library/PreviewPanel";
import { BulkActionBar } from "@/components/library/BulkActionBar";
import { loadMoreLibraryQuestions } from "@/server/questions/library-actions";
import { cn } from "@/lib/utils/cn";
import type { QuestionLibraryQuery } from "@/lib/schemas/library";
import type { CategoryOption } from "@/components/authoring/types";
import type {
  LibraryQuestionItem,
  LibraryFacets,
  QuestionAuthorOption,
} from "@/server/questions/library";

const DENSITY_KEY = "aspiquiz:library-density";

export function LibraryClient({
  query,
  initialItems,
  total,
  facets,
  hasMore: initialHasMore,
  categories,
  authors,
  viewerId,
  isAdmin,
}: {
  query: QuestionLibraryQuery;
  initialItems: LibraryQuestionItem[];
  total: number;
  facets: LibraryFacets;
  hasMore: boolean;
  categories: CategoryOption[];
  authors: QuestionAuthorOption[];
  viewerId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [density, setDensity] = useState<"cards" | "table">("cards");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    if (stored === "cards" || stored === "table") setDensity(stored);
  }, []);

  function setAndPersistDensity(next: "cards" | "table") {
    setDensity(next);
    window.localStorage.setItem(DENSITY_KEY, next);
  }

  function refresh() {
    // Re-run the same first page — good enough after a mutation (archive/duplicate/publish);
    // a full URL round-trip (router.refresh()) would also re-run the server component, but this
    // keeps scroll position and is instant.
    setLoadingMore(true);
    void loadMoreLibraryQuestions(query, 0).then((result) => {
      setItems(result.items);
      setHasMore(result.hasMore);
      setPage(0);
      setLoadingMore(false);
    });
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    const result = await loadMoreLibraryQuestions(query, nextPage);
    setItems((prev) => [...prev, ...result.items]);
    setHasMore(result.hasMore);
    setPage(nextPage);
    setLoadingMore(false);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const previewIndex = previewId ? items.findIndex((i) => i.id === previewId) : -1;

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-soft bg-bg-raised px-4 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-5">
        <div>
          <h1 className="font-display text-26 text-ink-high">Bibliothèque</h1>
          <p className="text-12 text-ink-faint">
            {total} question{total > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border-hard bg-bg-inset p-0.5">
            <button
              type="button"
              aria-label="Vue en cartes"
              aria-pressed={density === "cards"}
              onClick={() => setAndPersistDensity("cards")}
              className={cn(
                "rounded-sm p-1.5",
                density === "cards" ? "bg-bg-surface text-ink-high" : "text-ink-faint",
              )}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Vue en tableau"
              aria-pressed={density === "table"}
              onClick={() => setAndPersistDensity("table")}
              className={cn(
                "rounded-sm p-1.5",
                density === "table" ? "bg-bg-surface text-ink-high" : "text-ink-faint",
              )}
            >
              <List className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
          <Link href="/creer/question">
            <Button leadingIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />}>
              Nouvelle question
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <FilterRail query={query} categories={categories} authors={authors} facets={facets} />
        </aside>

        <div className="flex flex-col gap-4">
          {items.length === 0 ? (
            <EmptyState
              title={
                query.q || query.type.length > 0 || query.cat.length > 0
                  ? "Aucune question ne correspond à ces filtres."
                  : "La bibliothèque est vide."
              }
              description={
                query.q || query.type.length > 0 || query.cat.length > 0
                  ? "Réinitialisez les filtres pour voir davantage de questions."
                  : "Créez la première question."
              }
              action={
                !(query.q || query.type.length > 0 || query.cat.length > 0) && (
                  <Link href="/creer/question">
                    <Button>Créer la première question</Button>
                  </Link>
                )
              }
            />
          ) : density === "cards" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((q) => (
                <LibraryCard
                  key={q.id}
                  question={q}
                  viewerId={viewerId}
                  isAdmin={isAdmin}
                  selected={selected.has(q.id)}
                  selectable={isAdmin}
                  onToggleSelect={toggleSelect}
                  onPreview={setPreviewId}
                  onChanged={refresh}
                />
              ))}
            </div>
          ) : (
            <LibraryTable items={items} onPreview={setPreviewId} />
          )}

          {loadingMore && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-52 w-full" />
              ))}
            </div>
          )}

          {hasMore && !loadingMore && (
            <Button variant="secondary" onClick={handleLoadMore} className="self-center">
              Charger plus
            </Button>
          )}
        </div>
      </div>

      {isAdmin && selected.size > 0 && (
        <BulkActionBar
          selectedIds={[...selected]}
          onClear={() => setSelected(new Set())}
          onDone={() => {
            setSelected(new Set());
            refresh();
          }}
        />
      )}

      {previewId && (
        <PreviewPanel
          questionId={previewId}
          onClose={() => setPreviewId(null)}
          onNavigate={(dir) => {
            const next = items[previewIndex + dir];
            if (next) setPreviewId(next.id);
          }}
          canGoPrev={previewIndex > 0}
          canGoNext={previewIndex >= 0 && previewIndex < items.length - 1}
          viewerId={viewerId}
          isAdmin={isAdmin}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

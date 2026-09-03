"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { CategoryBadge } from "@/components/ui/Badge";
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
  const [filtersPending, setFiltersPending] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    if (stored === "cards" || stored === "table") setDensity(stored);
  }, []);

  // FilterRail's router.push changes searchParams, not pathname — the server page re-runs and
  // hands this component fresh initialItems/initialHasMore props, but items/hasMore/page above
  // are local state seeded from those props only on mount, so a plain re-render never picks up
  // the new results. Re-seed local state every time a fresh fetch actually lands.
  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialHasMore);
    setPage(0);
  }, [initialItems, initialHasMore]);

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

  // Client-side grouping over whatever's already loaded — "the existing sort applied inside
  // each group" (B.5) falls out for free since it's just partitioning the already-sorted flat
  // list, not a second server round trip. Only applied to the cards view; grouping a <table>
  // into per-category sections is a fair bit more layout work for a display mode that's
  // secondary to begin with — see DECISIONS.md.
  const groupedByCategory = useMemo(() => {
    if (query.groupBy !== "category") return null;
    const groups = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        categoryColorToken: LibraryQuestionItem["categoryColorToken"];
        items: LibraryQuestionItem[];
      }
    >();
    for (const item of items) {
      const existing = groups.get(item.categoryId);
      if (existing) existing.items.push(item);
      else
        groups.set(item.categoryId, {
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          categoryColorToken: item.categoryColorToken,
          items: [item],
        });
    }
    return [...groups.values()];
  }, [items, query.groupBy]);

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
          <FilterRail
            query={query}
            categories={categories}
            authors={authors}
            facets={facets}
            onPendingChange={setFiltersPending}
          />
        </aside>

        <div
          className={cn(
            "relative flex flex-col gap-4 transition-opacity duration-150",
            filtersPending && "pointer-events-none opacity-50",
          )}
          aria-busy={filtersPending || undefined}
        >
          {filtersPending && (
            <div
              role="status"
              aria-label="Filtrage en cours"
              className="absolute top-0 right-0 left-0 z-10 flex justify-center pt-8"
            >
              <Spinner className="h-5 w-5 text-gold" />
            </div>
          )}

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
          ) : density === "cards" && groupedByCategory ? (
            <div className="flex flex-col gap-4">
              {groupedByCategory.map((group) => (
                <details key={group.categoryId} open className="group/details">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-2">
                    <ChevronRight
                      className="h-4 w-4 text-ink-faint transition-transform duration-150 group-open/details:rotate-90"
                      strokeWidth={1.5}
                    />
                    <CategoryBadge
                      name={group.categoryName}
                      colorToken={group.categoryColorToken}
                    />
                    <span className="text-12 text-ink-faint">
                      {group.items.length} question{group.items.length > 1 ? "s" : ""}
                    </span>
                  </summary>
                  <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((q) => (
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
                </details>
              ))}
            </div>
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

"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { LibraryClient } from "@/components/library/LibraryClient";
import { CategoriesTab } from "@/components/categories/CategoriesTab";
import { ReviewQueueTab } from "@/components/library/ReviewQueueTab";
import type { QuestionLibraryQuery } from "@/lib/schemas/library";
import type { CategoryOption } from "@/components/authoring/types";
import type {
  LibraryQuestionItem,
  LibraryFacets,
  QuestionAuthorOption,
} from "@/server/questions/library";
import type { AdminCategoryRow } from "@/server/admin/queries";

export function CreerPageShell({
  query,
  initialItems,
  total,
  facets,
  hasMore,
  categoryOptions,
  categoryRows,
  authors,
  reviewQueueItems,
  viewerId,
  isAdmin,
}: {
  query: QuestionLibraryQuery;
  initialItems: LibraryQuestionItem[];
  total: number;
  facets: LibraryFacets;
  hasMore: boolean;
  categoryOptions: CategoryOption[];
  categoryRows: AdminCategoryRow[];
  authors: QuestionAuthorOption[];
  reviewQueueItems: LibraryQuestionItem[];
  viewerId: string;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState("library");

  const tabs = [
    { id: "library", label: "Bibliothèque" },
    { id: "categories", label: "Catégories" },
    {
      id: "review",
      label: reviewQueueItems.length > 0 ? `À relire (${reviewQueueItems.length})` : "À relire",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "library" && (
        <LibraryClient
          query={query}
          initialItems={initialItems}
          total={total}
          facets={facets}
          hasMore={hasMore}
          categories={categoryOptions}
          authors={authors}
          viewerId={viewerId}
          isAdmin={isAdmin}
        />
      )}
      {tab === "categories" && <CategoriesTab categories={categoryRows} isAdmin={isAdmin} />}
      {tab === "review" && (
        <ReviewQueueTab items={reviewQueueItems} viewerId={viewerId} isAdmin={isAdmin} />
      )}
    </div>
  );
}

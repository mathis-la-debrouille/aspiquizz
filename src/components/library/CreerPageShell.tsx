"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { LibraryClient } from "@/components/library/LibraryClient";
import { CategoriesTab } from "@/components/categories/CategoriesTab";
import type { QuestionLibraryQuery } from "@/lib/schemas/library";
import type { CategoryOption } from "@/components/authoring/types";
import type {
  LibraryQuestionItem,
  LibraryFacets,
  QuestionAuthorOption,
} from "@/server/questions/library";
import type { AdminCategoryRow } from "@/server/admin/queries";

const TABS = [
  { id: "library", label: "Bibliothèque" },
  { id: "categories", label: "Catégories" },
];

export function CreerPageShell({
  query,
  initialItems,
  total,
  facets,
  hasMore,
  categoryOptions,
  categoryRows,
  authors,
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
  viewerId: string;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState("library");

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "library" ? (
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
      ) : (
        <CategoriesTab categories={categoryRows} isAdmin={isAdmin} />
      )}
    </div>
  );
}

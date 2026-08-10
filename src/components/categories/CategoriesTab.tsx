"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryBadge } from "@/components/ui/Badge";
import { CategoryCreateModal } from "@/components/categories/CategoryCreateModal";
import { CategoryEditModal, type EditableCategory } from "@/components/categories/CategoryEditModal";
import { DeleteCategoryModal, type CategoryRef } from "@/components/categories/DeleteCategoryModal";
import { moveCategoryAction } from "@/server/categories/actions";
import type { AdminCategoryRow } from "@/server/admin/queries";

/**
 * Addendum B.5 — folded into /creer as a tab beside the library, not a separate page.
 * Non-admins get a read-only list plus "+ Nouvelle catégorie" (creation is open to everyone,
 * B.1); admins additionally get inline edit, delete-with-reassignment, and reorder.
 */
export function CategoriesTab({
  categories,
  isAdmin,
}: {
  categories: AdminCategoryRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EditableCategory | null>(null);
  const [deleting, setDeleting] = useState<CategoryRef | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleMove(categoryId: string, direction: "up" | "down") {
    setMovingId(categoryId);
    await moveCategoryAction(categoryId, direction);
    setMovingId(null);
    refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-20 text-ink-high">Catégories</h2>
        <Button size="sm" leadingIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={() => setCreateOpen(true)}>
          Nouvelle catégorie
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState title="Aucune catégorie." description="Créez la première." />
      ) : (
        <div className="flex flex-col divide-y divide-border-soft rounded-lg border border-border-soft">
          {categories.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="w-36 shrink-0">
                <CategoryBadge name={c.name} colorToken={c.colorToken} />
              </div>
              <span className="flex-1 truncate text-12 text-ink-faint">{c.description}</span>
              <span className="font-numeral text-12 tabular-nums text-ink-faint">
                {c.questionCount} question{c.questionCount > 1 ? "s" : ""}
              </span>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Monter"
                    disabled={i === 0 || movingId === c.id}
                    onClick={() => handleMove(c.id, "up")}
                    className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    aria-label="Descendre"
                    disabled={i === categories.length - 1 || movingId === c.id}
                    onClick={() => handleMove(c.id, "down")}
                    className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    aria-label="Modifier"
                    onClick={() => setEditing(c)}
                    className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-ink-high"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    aria-label="Supprimer"
                    onClick={() => setDeleting({ id: c.id, name: c.name })}
                    className="rounded-sm p-1.5 text-ink-faint hover:bg-bg-surface hover:text-clay-soft"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CategoryCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refresh} />
      <CategoryEditModal open={editing !== null} onClose={() => setEditing(null)} category={editing} onSaved={refresh} />
      <DeleteCategoryModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        category={deleting}
        otherCategories={categories.map((c) => ({ id: c.id, name: c.name }))}
        onDeleted={refresh}
      />
    </div>
  );
}

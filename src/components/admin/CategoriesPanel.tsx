"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { CategoryBadge } from "@/components/ui/Badge";
import { CategoryFormModal } from "@/components/admin/CategoryFormModal";
import { DeleteCategoryModal, type CategoryRef } from "@/components/categories/DeleteCategoryModal";
import type { AdminCategoryRow } from "@/server/admin/queries";

export function CategoriesPanel({ categories }: { categories: AdminCategoryRow[] }) {
  // undefined = modal closed, null = create, a row = edit — mirrors CategoryFormModal's prop.
  const [editing, setEditing] = useState<AdminCategoryRow | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<CategoryRef | null>(null);

  return (
    <Panel
      title="Catégories"
      eyebrow={String(categories.length)}
      action={
        <Button size="sm" onClick={() => setEditing(null)}>
          + Catégorie
        </Button>
      }
    >
      <div className="flex flex-col divide-y divide-border-soft">
        {categories.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="w-36 shrink-0">
              <CategoryBadge name={c.name} colorToken={c.colorToken} />
            </div>
            <span className="text-12 text-ink-faint">/{c.slug}</span>
            <span className="flex-1 truncate text-12 text-ink-faint">{c.description}</span>
            <span className="font-numeral text-12 tabular-nums text-ink-faint">
              {c.questionCount} question{c.questionCount > 1 ? "s" : ""}
            </span>
            <Button variant="ghost" size="sm" aria-label="Modifier" onClick={() => setEditing(c)}>
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Supprimer"
              onClick={() => setDeleting({ id: c.id, name: c.name })}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        ))}
      </div>
      <CategoryFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        category={editing ?? null}
      />
      <DeleteCategoryModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        category={deleting}
        otherCategories={categories.map((c) => ({ id: c.id, name: c.name }))}
        onDeleted={() => setDeleting(null)}
      />
    </Panel>
  );
}

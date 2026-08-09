"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { CategoryBadge } from "@/components/ui/Badge";
import { CategoryFormModal } from "@/components/admin/CategoryFormModal";
import { deleteCategoryAction } from "@/server/admin/actions";
import type { AdminCategoryRow } from "@/server/admin/queries";

export function CategoriesPanel({ categories }: { categories: AdminCategoryRow[] }) {
  // undefined = modal closed, null = create, a row = edit — mirrors CategoryFormModal's prop.
  const [editing, setEditing] = useState<AdminCategoryRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleDelete(cat: AdminCategoryRow) {
    if (!confirm(`Supprimer la catégorie « ${cat.name} » ?`)) return;
    setPendingId(cat.id);
    setError(null);
    const result = await deleteCategoryAction(cat.id);
    setPendingId(null);
    if (!result.ok) setError(result.error);
  }

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
      {error && <p className="mb-3 text-14 text-clay-soft">{error}</p>}
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
              loading={pendingId === c.id}
              onClick={() => handleDelete(c)}
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
    </Panel>
  );
}

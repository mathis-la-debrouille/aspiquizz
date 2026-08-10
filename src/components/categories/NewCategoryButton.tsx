"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CategoryCreateModal } from "@/components/categories/CategoryCreateModal";
import type { CategoryOption } from "@/components/authoring/types";

/**
 * The same inline-create affordance as CategoryPicker, but for checkbox/chip-based category
 * filters (the room-creation modal, the quiz builder's pool filter, the library's filter rail)
 * rather than a single <Select> — there's no natural "last option" to repurpose there, so this
 * is a small standalone button instead.
 */
export function NewCategoryButton({
  categories,
  onCategoriesChange,
  onCreated,
}: {
  categories: CategoryOption[];
  onCategoriesChange: (next: CategoryOption[]) => void;
  /** Optional extra hook — e.g. auto-checking the new category in a filter's selection. */
  onCreated?: (category: { id: string; name: string; colorToken: CategoryOption["colorToken"] }) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-12 font-medium text-gold-soft hover:text-gold"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        Nouvelle catégorie
      </button>
      <CategoryCreateModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(category) => {
          if (!categories.some((c) => c.id === category.id)) {
            onCategoriesChange([...categories, category]);
          }
          onCreated?.(category);
          setOpen(false);
        }}
      />
    </>
  );
}

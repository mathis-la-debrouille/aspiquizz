"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { CategoryCreateModal } from "@/components/categories/CategoryCreateModal";
import type { CategoryOption } from "@/components/authoring/types";

const NEW_CATEGORY_VALUE = "__new__";

/**
 * Drop-in replacement for a plain category <Select> — gains a permanent last entry,
 * "+ Nouvelle catégorie", visually separated and gold-tinted (Addendum B.1). Selecting it opens
 * the creation modal instead of selecting a category; on save the new category is appended to
 * the list and auto-selected. `categories`/`onCategoriesChange` must be lifted state in the
 * caller (not just the initial server-fetched prop) so the new entry actually shows up without
 * remounting the surrounding form.
 */
export function CategoryPicker({
  label = "Catégorie",
  categories,
  onCategoriesChange,
  value,
  onChange,
}: {
  label?: string;
  categories: CategoryOption[];
  onCategoriesChange: (next: CategoryOption[]) => void;
  value: string;
  onChange: (id: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Select
        label={label}
        value={value}
        onChange={(e) => {
          if (e.target.value === NEW_CATEGORY_VALUE) {
            setModalOpen(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">Choisir…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option disabled>──────────</option>
        <option value={NEW_CATEGORY_VALUE} className="text-gold">
          + Nouvelle catégorie
        </option>
      </Select>
      <CategoryCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(category) => {
          if (!categories.some((c) => c.id === category.id)) {
            onCategoriesChange([...categories, category]);
          }
          onChange(category.id);
          setModalOpen(false);
        }}
      />
    </>
  );
}

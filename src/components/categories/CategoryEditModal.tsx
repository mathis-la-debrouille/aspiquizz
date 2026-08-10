"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { updateCategoryAction } from "@/server/admin/actions";
import type { ColorToken } from "@/server/db/schema";

const COLOR_OPTIONS: ColorToken[] = ["moss", "gold", "clay", "plum"];
const COLOR_LABELS_FR: Record<ColorToken, string> = {
  moss: "Mousse",
  gold: "Or",
  clay: "Argile",
  plum: "Prune",
};

export interface EditableCategory {
  id: string;
  name: string;
  slug: string;
  colorToken: ColorToken;
  description: string | null;
  position: number;
}

/**
 * The Catégories tab's lighter-weight admin edit (Addendum B.5) — name/colour/description only,
 * unlike /admin's own CategoryFormModal which also exposes slug/position directly. Still calls
 * the same admin/actions.ts updateCategoryAction, just always resubmitting the existing
 * slug/position unchanged (the schema requires them; this UI doesn't surface them).
 */
export function CategoryEditModal({
  open,
  onClose,
  category,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  category: EditableCategory | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [colorToken, setColorToken] = useState<ColorToken>("moss");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && category) {
      setName(category.name);
      setColorToken(category.colorToken);
      setDescription(category.description ?? "");
      setError(null);
    }
  }, [open, category]);

  async function handleSave() {
    if (!category) return;
    setPending(true);
    setError(null);
    const result = await updateCategoryAction(category.id, {
      name,
      slug: category.slug,
      colorToken,
      description: description || undefined,
      position: category.position,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  }

  if (!category) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier la catégorie"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} disabled={name.trim().length < 2} onClick={handleSave}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />

        <div className="flex flex-col gap-1.5">
          <span className="text-14 font-medium text-ink-mid">Couleur</span>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((token) => (
              <button
                key={token}
                type="button"
                aria-label={COLOR_LABELS_FR[token]}
                aria-pressed={colorToken === token}
                onClick={() => setColorToken(token)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform duration-150",
                  colorToken === token ? "scale-110 border-ink-high" : "border-transparent",
                )}
                style={{ backgroundColor: `var(--color-${token})` }}
              />
            ))}
          </div>
        </div>

        <Textarea
          label="Description (optionnelle)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          rows={2}
        />

        {error && <p className="text-14 text-clay-soft">{error}</p>}
      </div>
    </Modal>
  );
}

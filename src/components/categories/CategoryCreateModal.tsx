"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { createCategoryAction, type CategorySummary } from "@/server/categories/actions";
import type { ColorToken } from "@/server/db/schema";

const COLOR_OPTIONS: ColorToken[] = ["moss", "gold", "clay", "plum"];
const COLOR_LABELS_FR: Record<ColorToken, string> = {
  moss: "Mousse",
  gold: "Or",
  clay: "Argile",
  plum: "Prune",
};

// U+0300-U+036F, the Unicode combining-marks block — via RegExp(string) rather than a /[...]/
// literal so the range is unambiguous escaped source text, not literal glyphs in a char class.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Cosmetic-only preview — the server always derives the real slug (never trust a client-sent
 *  one), this just shows the author what to expect before they save. */
function previewSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(COMBINING_MARKS, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "…"
  );
}

/**
 * The "+ Nouvelle catégorie" affordance (Addendum B.1) — open to any logged-in user, appears
 * anywhere a category is picked (the question form, quiz builder, room-creation filter, and
 * B.5's Catégories tab). On save, hands the new (or, on a name clash, the existing) category
 * back to the caller so it can auto-select it without remounting whatever form is open.
 */
export function CategoryCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (category: CategorySummary) => void;
}) {
  const [name, setName] = useState("");
  const [colorToken, setColorToken] = useState<ColorToken>("moss");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setColorToken("moss");
      setDescription("");
      setError(null);
      setExistingId(null);
    }
  }, [open]);

  async function handleSave() {
    setPending(true);
    setError(null);
    setExistingId(null);
    const result = await createCategoryAction({ name, colorToken, description: description || undefined });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setExistingId(result.existingCategoryId ?? null);
      return;
    }
    onCreated(result.category);
  }

  function useExisting() {
    if (!existingId) return;
    onCreated({ id: existingId, name, colorToken });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle catégorie"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} disabled={name.trim().length < 2} onClick={handleSave}>
            Créer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
          {name.trim().length >= 2 && (
            <p className="text-12 text-ink-faint">Identifiant : {previewSlug(name)}</p>
          )}
        </div>

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

        {error && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-clay-deep/60 bg-clay-deep/10 px-3 py-2">
            <p className="text-14 text-clay-soft">{error}</p>
            {existingId && (
              <Button size="sm" variant="secondary" onClick={useExisting}>
                Utiliser celle-ci
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createCategoryAction, updateCategoryAction } from "@/server/admin/actions";
import type { AdminCategoryRow } from "@/server/admin/queries";
import type { ColorToken } from "@/server/db/schema";

const COLOR_OPTIONS: ColorToken[] = ["moss", "gold", "clay", "plum"];
const COLOR_LABELS_FR: Record<ColorToken, string> = {
  moss: "Mousse",
  gold: "Or",
  clay: "Argile",
  plum: "Prune",
};

export function CategoryFormModal({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  /** null (create) vs a row to edit — reused for both, matching CreateRoomModal's shape. */
  category: AdminCategoryRow | null;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [colorToken, setColorToken] = useState<ColorToken>("moss");
  const [description, setDescription] = useState("");
  const [position, setPosition] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setSlug(category?.slug ?? "");
      setColorToken(category?.colorToken ?? "moss");
      setDescription(category?.description ?? "");
      setPosition(category?.position ?? 0);
      setError(null);
    }
  }, [open, category]);

  async function handleSave() {
    setPending(true);
    setError(null);
    const input = { name, slug, colorToken, description: description || undefined, position };
    const result = category
      ? await updateCategoryAction(category.id, input)
      : await createCategoryAction(input);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Modifier la catégorie" : "Nouvelle catégorie"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} disabled={!name || !slug} onClick={handleSave}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          hint="Minuscules, chiffres, tirets."
        />
        <Select
          label="Couleur"
          value={colorToken}
          onChange={(e) => setColorToken(e.target.value as ColorToken)}
        >
          {COLOR_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {COLOR_LABELS_FR[c]}
            </option>
          ))}
        </Select>
        <Textarea
          label="Description (optionnelle)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          label="Position"
          type="number"
          min={0}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
        />
        {error && <p className="text-14 text-clay-soft">{error}</p>}
      </div>
    </Modal>
  );
}

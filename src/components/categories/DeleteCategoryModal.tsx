"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { deleteCategoryAction } from "@/server/categories/actions";

export interface CategoryRef {
  id: string;
  name: string;
}

/**
 * Shared between /admin's Categories tab and /creer's (Addendum B.5) — a category with
 * questions can't be deleted outright, so this always attempts a plain delete first and, if
 * the server reports it's in use, transitions in place to "Déplacer les N questions vers…"
 * rather than asking the admin to reopen the dialog. Never orphans a question.
 */
export function DeleteCategoryModal({
  open,
  onClose,
  category,
  otherCategories,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  category: CategoryRef | null;
  otherCategories: CategoryRef[];
  onDeleted: () => void;
}) {
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuestionCount(null);
      setReassignTo("");
      setError(null);
    }
  }, [open, category]);

  async function handleConfirm() {
    if (!category) return;
    setPending(true);
    setError(null);
    const result = await deleteCategoryAction(
      category.id,
      questionCount !== null ? reassignTo : undefined,
    );
    setPending(false);
    if (!result.ok) {
      if (result.questionCount) {
        setQuestionCount(result.questionCount);
        return;
      }
      setError(result.error);
      return;
    }
    onDeleted();
    onClose();
  }

  if (!category) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Supprimer « ${category.name} »`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            loading={pending}
            disabled={questionCount !== null && !reassignTo}
            onClick={handleConfirm}
          >
            {questionCount !== null ? "Déplacer et supprimer" : "Supprimer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {questionCount !== null ? (
          <>
            <p className="text-14 text-ink-mid">
              {questionCount} question{questionCount > 1 ? "s utilisent" : " utilise"} encore cette
              catégorie — choisissez où les déplacer avant de la supprimer.
            </p>
            <Select
              label={`Déplacer ${questionCount > 1 ? "les" : "la"} ${questionCount} question${questionCount > 1 ? "s" : ""} vers…`}
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
            >
              <option value="">Choisir…</option>
              {otherCategories
                .filter((c) => c.id !== category.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </>
        ) : (
          <p className="text-14 text-ink-mid">Cette action est définitive.</p>
        )}
        {error && <p className="text-14 text-clay-soft">{error}</p>}
      </div>
    </Modal>
  );
}

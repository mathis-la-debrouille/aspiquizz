"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { bulkSetQuestionStatus } from "@/server/questions/library-actions";

/**
 * Admin only (A.7), simplified to publish/archive — see DECISIONS.md for why "changer de
 * catégorie" / "ajouter à un quiz" weren't built here.
 */
export function BulkActionBar({
  selectedIds,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState<"published" | "archived" | null>(null);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    if (!confirming) return;
    setPending(true);
    await bulkSetQuestionStatus(selectedIds, confirming);
    setPending(false);
    setConfirming(null);
    onDone();
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-lg border border-border-hard bg-bg-raised px-4 py-3 shadow-[var(--shadow-lift)]">
        <span className="text-14 text-ink-mid">
          {selectedIds.length} sélectionnée{selectedIds.length > 1 ? "s" : ""}
        </span>
        <Button size="sm" variant="secondary" onClick={() => setConfirming("published")}>
          Publier
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setConfirming("archived")}>
          Archiver
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Annuler
        </Button>
      </div>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === "published" ? "Publier ces questions ?" : "Archiver ces questions ?"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={handleConfirm}>
              Confirmer
            </Button>
          </>
        }
      >
        <p className="text-14 text-ink-mid">
          {selectedIds.length} question{selectedIds.length > 1 ? "s seront" : " sera"}{" "}
          {confirming === "published" ? "publiée" : "archivée"}
          {selectedIds.length > 1 ? "s" : ""}.
        </p>
      </Modal>
    </div>
  );
}

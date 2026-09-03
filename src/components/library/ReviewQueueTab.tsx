"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Pencil, Check, X as XIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CategoryBadge,
  DifficultyBadge,
  QuestionTypeBadge,
  SourceBadge,
} from "@/components/ui/Badge";
import { PreviewPanel } from "@/components/library/PreviewPanel";
import {
  publishDraftAction,
  rejectDraftAction,
  bulkPublishDraftsAction,
  bulkRejectDraftsAction,
} from "@/server/questions/review";
import type { LibraryQuestionItem } from "@/server/questions/library";

const NUDGE_SESSION_KEY = "aspiquiz:review-nudge-shown";
const NUDGE_DISMISSED_KEY = "aspiquiz:review-nudge-dismissed";

/** The "relire d'abord" reminder — once per browser session (not every publish, which just gets
 *  ignored, per Addendum C.7), unless the user permanently dismissed it. */
function useReviewNudge() {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  function guardPublish(action: () => void) {
    const dismissed = window.localStorage.getItem(NUDGE_DISMISSED_KEY) === "1";
    const shownThisSession = window.sessionStorage.getItem(NUDGE_SESSION_KEY) === "1";
    if (dismissed || shownThisSession) {
      action();
      return;
    }
    window.sessionStorage.setItem(NUDGE_SESSION_KEY, "1");
    setPendingAction(() => action);
  }

  return { pendingAction, setPendingAction, guardPublish };
}

function NudgeModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Relire avant de publier"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              window.localStorage.setItem(NUDGE_DISMISSED_KEY, "1");
              onConfirm();
            }}
          >
            Ne plus afficher
          </Button>
          <Button onClick={onConfirm}>Publier</Button>
        </>
      }
    >
      <p className="text-14 text-ink-mid">
        Cette question a été rédigée avec l&apos;aide d&apos;un modèle — vérifiez les faits avant de
        la publier auprès du groupe.
      </p>
    </Modal>
  );
}

function RejectModal({
  open,
  onClose,
  onConfirm,
  pending,
  count,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
  count: number;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={count > 1 ? `Rejeter ${count} brouillons ?` : "Rejeter ce brouillon ?"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" loading={pending} onClick={() => onConfirm(reason)}>
            Rejeter
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-14 text-ink-mid">
          {count > 1 ? `${count} brouillons seront archivés.` : "Ce brouillon sera archivé."}
        </p>
        <Textarea
          label="Raison (facultatif)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex. « fait inexact », « doublon »…"
        />
      </div>
    </Modal>
  );
}

export function ReviewQueueTab({
  items: initialItems,
  viewerId,
  isAdmin,
}: {
  items: LibraryQuestionItem[];
  viewerId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<"single" | "bulk" | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { pendingAction, setPendingAction, guardPublish } = useReviewNudge();

  function removeFromList(ids: string[]) {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePublishOne(id: string) {
    guardPublish(async () => {
      setPending(true);
      await publishDraftAction(id);
      setPending(false);
      removeFromList([id]);
    });
  }

  function handlePublishSelection() {
    guardPublish(async () => {
      setPending(true);
      await bulkPublishDraftsAction([...selected]);
      setPending(false);
      removeFromList([...selected]);
    });
  }

  async function handleRejectConfirm(reason: string) {
    setPending(true);
    if (rejecting === "single" && rejectTargetId) {
      await rejectDraftAction(rejectTargetId, reason);
      removeFromList([rejectTargetId]);
    } else if (rejecting === "bulk") {
      await bulkRejectDraftsAction([...selected], reason);
      removeFromList([...selected]);
    }
    setPending(false);
    setRejecting(null);
    setRejectTargetId(null);
  }

  const previewIndex = previewId ? items.findIndex((i) => i.id === previewId) : -1;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Rien à relire pour le moment."
        description="Les questions créées par un modèle via MCP (ou par un futur import) apparaîtront ici, à l'état de brouillon, en attente de relecture."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((q) => (
        <Card key={q.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
          <Checkbox
            label=""
            aria-label="Sélectionner"
            checked={selected.has(q.id)}
            onChange={() => toggleSelect(q.id)}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceBadge source={q.source} />
              <QuestionTypeBadge type={q.type} />
              <CategoryBadge name={q.categoryName} colorToken={q.categoryColorToken} />
              <DifficultyBadge level={q.difficulty as 1 | 2 | 3 | 4 | 5} />
            </div>
            <p className="line-clamp-2 text-14 text-ink-high">{q.prompt}</p>
            <div className="flex items-center gap-1.5 text-12 text-ink-faint">
              <Avatar seed={q.authorAvatarSeed} size="xs" />@{q.authorUsername}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<Eye className="h-4 w-4" strokeWidth={1.5} />}
              onClick={() => setPreviewId(q.id)}
            >
              Aperçu
            </Button>
            {q.type !== "geo" && (
              <Link href={`/creer/question/${q.id}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<Pencil className="h-4 w-4" strokeWidth={1.5} />}
                >
                  Modifier
                </Button>
              </Link>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              leadingIcon={<Check className="h-4 w-4" strokeWidth={1.5} />}
              onClick={() => handlePublishOne(q.id)}
            >
              Publier
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              leadingIcon={<XIcon className="h-4 w-4" strokeWidth={1.5} />}
              onClick={() => {
                setRejecting("single");
                setRejectTargetId(q.id);
              }}
            >
              Rejeter
            </Button>
          </div>
        </Card>
      ))}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-lg border border-border-hard bg-bg-raised px-4 py-3 shadow-[var(--shadow-lift)]">
            <span className="text-14 text-ink-mid">
              {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
            </span>
            <Button size="sm" onClick={handlePublishSelection}>
              Publier la sélection
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRejecting("bulk")}>
              Rejeter la sélection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      <NudgeModal
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          action?.();
        }}
      />

      <RejectModal
        open={rejecting !== null}
        onClose={() => {
          setRejecting(null);
          setRejectTargetId(null);
        }}
        onConfirm={handleRejectConfirm}
        pending={pending}
        count={rejecting === "bulk" ? selected.size : 1}
      />

      {previewId && (
        <PreviewPanel
          questionId={previewId}
          onClose={() => setPreviewId(null)}
          onNavigate={(dir) => {
            const next = items[previewIndex + dir];
            if (next) setPreviewId(next.id);
          }}
          canGoPrev={previewIndex > 0}
          canGoNext={previewIndex >= 0 && previewIndex < items.length - 1}
          viewerId={viewerId}
          isAdmin={isAdmin}
          onChanged={() => {
            /* preview's own duplicate/archive actions don't apply to review-queue rows in a way
             * that needs a special refresh here — publish/reject happen from this list's own
             * buttons, not the preview panel's, so there's nothing to reconcile. */
          }}
        />
      )}
    </div>
  );
}

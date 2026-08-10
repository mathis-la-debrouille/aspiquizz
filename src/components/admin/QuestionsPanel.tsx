"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { CategoryBadge, QuestionTypeBadge, Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { setQuestionStatusAction } from "@/server/admin/actions";
import type { QuestionListItem } from "@/server/questions/queries";
import type { QuestionStatus } from "@/server/db/schema";

const STATUS_LABELS_FR: Record<QuestionStatus, string> = {
  draft: "Brouillon",
  published: "Publiée",
  archived: "Archivée",
};

export function QuestionsPanel({ questions }: { questions: QuestionListItem[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [neverReviewedOnly, setNeverReviewedOnly] = useState(false);

  async function handleStatusChange(questionId: string, status: QuestionStatus) {
    setPendingId(questionId);
    setError(null);
    const result = await setQuestionStatusAction(questionId, status);
    setPendingId(null);
    if (!result.ok) setError(result.error);
  }

  const visible = useMemo(
    () => (neverReviewedOnly ? questions.filter((q) => !q.reviewedAt) : questions),
    [questions, neverReviewedOnly],
  );

  return (
    <Panel
      title="Questions"
      eyebrow={String(visible.length)}
      action={
        <Toggle
          label="Jamais relue"
          checked={neverReviewedOnly}
          onChange={(e) => setNeverReviewedOnly(e.target.checked)}
        />
      }
    >
      {error && <p className="mb-3 text-14 text-clay-soft">{error}</p>}
      {visible.length === 0 ? (
        <EmptyState title="Aucune question." />
      ) : (
        <div className="flex flex-col divide-y divide-border-soft">
          {visible.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-48 flex-1 truncate text-14 text-ink-high">{q.prompt}</span>
              <QuestionTypeBadge type={q.type} />
              <CategoryBadge name={q.categoryName} colorToken={q.categoryColorToken} />
              {!q.reviewedAt && <Badge tone="neutral">Jamais relue</Badge>}
              <span className="text-12 text-ink-faint">@{q.authorUsername}</span>
              <Select
                value={q.status}
                disabled={pendingId === q.id}
                onChange={(e) => handleStatusChange(q.id, e.target.value as QuestionStatus)}
                className="w-32"
              >
                {(Object.keys(STATUS_LABELS_FR) as QuestionStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS_FR[s]}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

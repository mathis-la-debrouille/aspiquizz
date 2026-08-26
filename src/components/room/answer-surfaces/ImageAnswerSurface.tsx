"use client";

import { OpenAnswerSurface } from "@/components/room/answer-surfaces/OpenAnswerSurface";
import { McqAnswerSurface } from "@/components/room/answer-surfaces/McqAnswerSurface";
import type { AnswerPayload } from "@/components/room/QuestionScreen";
import type { SanitisedQuestion } from "@/server/game/sanitize";

export function ImageAnswerSurface({
  question,
  disabled,
  committed,
  onSubmit,
  onDraft,
}: {
  question: SanitisedQuestion;
  disabled: boolean;
  committed: boolean;
  onSubmit: (payload: AnswerPayload) => void;
  onDraft: (payload: AnswerPayload) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-h-[42vh] items-center justify-center overflow-hidden rounded-md border border-border-soft bg-bg-inset">
        {question.mediaId && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated /media/[id] route, not an optimizable static asset
          <img
            src={`/media/${question.mediaId}`}
            alt=""
            className="max-h-[42vh] w-full object-contain"
          />
        )}
      </div>
      {question.answerMode === "mcq" ? (
        <McqAnswerSurface
          choices={question.choices ?? []}
          multiSelect={question.multiSelect ?? false}
          disabled={disabled}
          committed={committed}
          onSubmit={onSubmit}
          onDraft={onDraft}
        />
      ) : (
        <OpenAnswerSurface
          disabled={disabled}
          committed={committed}
          onSubmit={onSubmit}
          onDraft={onDraft}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { CategoryBadge, DifficultyBadge } from "@/components/ui/Badge";
import { Timer } from "@/components/ui/Timer";
import { OpenAnswerSurface } from "@/components/room/answer-surfaces/OpenAnswerSurface";
import { McqAnswerSurface } from "@/components/room/answer-surfaces/McqAnswerSurface";
import { ImageAnswerSurface } from "@/components/room/answer-surfaces/ImageAnswerSurface";
import { GeoAnswerSurface } from "@/components/room/answer-surfaces/GeoAnswerSurface";
import { SortAnswerSurface } from "@/components/room/answer-surfaces/SortAnswerSurface";
import { EstimationAnswerSurface } from "@/components/room/answer-surfaces/EstimationAnswerSurface";
import { FlagQuestionButton } from "@/components/room/FlagQuestionButton";
import type { GameSocket } from "@/lib/socket/client";
import type { QuestionShowPayload } from "@/server/socket/events";

export interface AnswerPayload {
  text?: string;
  choiceIds?: string[];
  iso3?: string;
  /** sort — item ids, top to bottom, in the order the player currently has them. */
  order?: string[];
  /** estimation — the player's numeric guess. */
  value?: number;
}

export function QuestionScreen({
  socket,
  code,
  active,
  answeredCount,
  totalPlayers,
  locked,
  clockOffset,
  showDifficulty,
}: {
  socket: GameSocket;
  code: string;
  active: QuestionShowPayload;
  answeredCount: number;
  totalPlayers: number;
  locked: boolean;
  clockOffset: number;
  /** Room setting — the host can turn the difficulty badge off in the salon. */
  showDifficulty: boolean;
}) {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSubmitted(false);
  }, [active.position]);

  /**
   * Remounts the answer surface on every question. Resetting `submitted` was not
   * enough: each surface holds its own state — the typed text, the selected country,
   * the pending draft timer — and React keeps the same instance across questions
   * because it sits in the same place in the tree. So the previous answer stayed in
   * the field, and worse, a debounced draft from the last question could fire after
   * the next one had started and be recorded as the answer to it (draft() reads
   * active.position when it fires, not when it was scheduled).
   *
   * One key does all of it, including running each surface's unmount cleanup, which
   * is what actually clears that timer.
   */
  const surfaceKey = `q-${active.position}`;

  /** A draft: keeps the server's copy current without committing. Not gated on
   *  `submitted`, only on the question being locked. */
  function draft(payload: AnswerPayload) {
    if (submitted || locked) return;
    socket.emit("answer:submit", { code, position: active.position, payload, final: false });
  }

  function submit(payload: AnswerPayload) {
    if (submitted || locked) return;
    setSubmitted(true);
    socket.emit("answer:submit", { code, position: active.position, payload });
  }

  const q = active.question;
  // Countdowns render as deadlineMs - (Date.now() + offset), brief §11.3 — equivalent to
  // shifting the deadline itself by -offset and letting Timer compare against local Date.now().
  const adjustedDeadlineMs = active.deadlineMs - clockOffset;
  const adjustedStartedAtMs = adjustedDeadlineMs - q.timeLimitS * 1000;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">
        <div className="flex items-center gap-2">
          <CategoryBadge name={q.categoryName} colorToken={q.categoryColorToken} />
          {showDifficulty && (
            <>
              <DifficultyBadge level={Math.max(1, Math.min(5, q.difficulty)) as 1 | 2 | 3 | 4 | 5} />
              <span className="font-numeral text-12 text-gold">
                {q.pointsBase} {q.pointsBase > 1 ? "points" : "point"}
              </span>
            </>
          )}
          <span className="font-numeral text-14 tabular-nums text-ink-faint">
            {active.position + 1} / {active.total}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Timer deadlineMs={adjustedDeadlineMs} startedAtMs={adjustedStartedAtMs} />
          <FlagQuestionButton key={q.id} questionId={q.id} roomCode={code} />
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-6" elevation="lifted">
        <h1 className="font-display text-26 text-ink-high">{q.prompt}</h1>
        {q.hint && <p className="text-12 text-ink-faint">Indice : {q.hint}</p>}

        {q.type === "open" && (
          <OpenAnswerSurface
            key={surfaceKey}
            disabled={locked}
            committed={submitted}
            onSubmit={submit}
            onDraft={draft}
          />
        )}
        {q.type === "mcq" && (
          <McqAnswerSurface
            key={surfaceKey}
            choices={q.choices ?? []}
            multiSelect={q.multiSelect ?? false}
            disabled={locked}
            committed={submitted}
            onSubmit={submit}
            onDraft={draft}
          />
        )}
        {q.type === "image" && (
          <ImageAnswerSurface
            key={surfaceKey}
            question={q}
            disabled={locked}
            committed={submitted}
            onSubmit={submit}
            onDraft={draft}
          />
        )}
        {q.type === "geo" && (
          <GeoAnswerSurface
            key={surfaceKey}
            question={q}
            disabled={locked}
            committed={submitted}
            onSubmit={submit}
            onDraft={draft}
          />
        )}
        {q.type === "sort" && (
          <SortAnswerSurface
            key={surfaceKey}
            question={q}
            disabled={locked}
            committed={submitted}
            onSubmit={submit}
            onDraft={draft}
          />
        )}
        {q.type === "estimation" && (
          <EstimationAnswerSurface
            key={surfaceKey}
            question={q}
            disabled={locked}
            committed={submitted}
            onSubmit={submit}
            onDraft={draft}
          />
        )}

        {!submitted && !locked && (
          <p className="text-12 text-ink-faint">
            Ta réponse compte sans valider : c&apos;est ce qui est à l&apos;écran à la fin du
            temps qui est pris. Valider la verrouille et fait passer à la suite dès que tout le
            monde a validé.
          </p>
        )}

        {submitted && !locked && (
          <p className="text-14 text-moss-glow" role="status">
            Réponse envoyée — en attente des autres joueurs…
          </p>
        )}
      </Card>

      <p className="text-14 text-ink-faint">
        {answeredCount}/{totalPlayers} ont répondu
      </p>
    </div>
  );
}

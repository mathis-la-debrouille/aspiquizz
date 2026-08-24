"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { CategoryBadge } from "@/components/ui/Badge";
import { Timer } from "@/components/ui/Timer";
import { OpenAnswerSurface } from "@/components/room/answer-surfaces/OpenAnswerSurface";
import { McqAnswerSurface } from "@/components/room/answer-surfaces/McqAnswerSurface";
import { ImageAnswerSurface } from "@/components/room/answer-surfaces/ImageAnswerSurface";
import { GeoAnswerSurface } from "@/components/room/answer-surfaces/GeoAnswerSurface";
import { FlagQuestionButton } from "@/components/room/FlagQuestionButton";
import type { GameSocket } from "@/lib/socket/client";
import type { QuestionShowPayload } from "@/server/socket/events";

export interface AnswerPayload {
  text?: string;
  choiceIds?: string[];
  iso3?: string;
}

export function QuestionScreen({
  socket,
  code,
  active,
  answeredCount,
  totalPlayers,
  locked,
  clockOffset,
}: {
  socket: GameSocket;
  code: string;
  active: QuestionShowPayload;
  answeredCount: number;
  totalPlayers: number;
  locked: boolean;
  clockOffset: number;
}) {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSubmitted(false);
  }, [active.position]);

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CategoryBadge name={q.categoryName} colorToken={q.categoryColorToken} />
          <span className="font-numeral text-14 tabular-nums text-ink-faint">
            {active.position + 1} / {active.total}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Timer deadlineMs={adjustedDeadlineMs} startedAtMs={adjustedStartedAtMs} />
          <FlagQuestionButton questionId={q.id} roomCode={code} />
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-6" elevation="lifted">
        <h1 className="font-display text-26 text-ink-high">{q.prompt}</h1>
        {q.hint && <p className="text-12 text-ink-faint">Indice : {q.hint}</p>}

        {q.type === "open" && (
          <OpenAnswerSurface disabled={submitted || locked} onSubmit={submit} />
        )}
        {q.type === "mcq" && (
          <McqAnswerSurface
            choices={q.choices ?? []}
            multiSelect={q.multiSelect ?? false}
            disabled={submitted || locked}
            onSubmit={submit}
          />
        )}
        {q.type === "image" && (
          <ImageAnswerSurface question={q} disabled={submitted || locked} onSubmit={submit} />
        )}
        {q.type === "geo" && (
          <GeoAnswerSurface question={q} disabled={submitted || locked} onSubmit={submit} />
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

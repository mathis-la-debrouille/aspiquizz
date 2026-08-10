"use client";

import { useState } from "react";
import { Copy, Check, Play } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { PlayerChip } from "@/components/ui/PlayerChip";
import { Badge } from "@/components/ui/Badge";
import { ChatPanel } from "@/components/room/ChatPanel";
import { RhythmSection, type RhythmValue } from "@/components/room/RhythmSection";
import type { GameSocket } from "@/lib/socket/client";
import type { RoomStateView, ChatMessagePayload } from "@/server/socket/events";

export function WaitingRoom({
  state,
  socket,
  code,
  currentUserId,
  chatMessages,
}: {
  state: RoomStateView;
  socket: GameSocket;
  code: string;
  currentUserId: string;
  chatMessages: ChatMessagePayload[];
}) {
  const [copied, setCopied] = useState(false);
  const isHost = state.hostId === currentUserId;
  const me = state.players.find((p) => p.userId === currentUserId);

  // Local edit buffer — applied to the room only on demand (see handleApplyRhythm), not synced
  // on every slider tick, so dragging doesn't spam room:update_config.
  const [rhythm, setRhythm] = useState<RhythmValue>({
    timeLimitS: state.config.timeLimitS,
    timeLimitByType: state.config.timeLimitByType,
  });
  const rhythmDirty =
    rhythm.timeLimitS !== state.config.timeLimitS ||
    JSON.stringify(rhythm.timeLimitByType ?? {}) !==
      JSON.stringify(state.config.timeLimitByType ?? {});

  function copyCode() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // room:update_config has no ack (see events.ts) — the confirmation is the fresh room:state
  // broadcast every client in the channel receives, which flows back into `state.config` here.
  function handleApplyRhythm() {
    socket.emit("room:update_config", { code, config: { ...state.config, ...rhythm } });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel eyebrow="Salle d'attente" title={state.name}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-numeral rounded-md border border-border-hard bg-bg-inset px-4 py-2 text-26 tracking-[0.2em] text-gold">
              {code}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Copier le code"
              onClick={copyCode}
              leadingIcon={
                copied ? (
                  <Check className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.5} />
                )
              }
            >
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>
          <Badge tone="neutral">{state.config.questionCount} questions</Badge>
          <Badge tone="neutral">{state.config.timeLimitS}s / question</Badge>
          <Badge tone="neutral">
            {state.config.scoringMode === "speed" ? "Notation rapidité" : "Notation fixe"}
          </Badge>
        </div>
      </Panel>

      {isHost && (
        <Panel
          title="Rythme"
          action={
            rhythmDirty && (
              <Button size="sm" onClick={handleApplyRhythm}>
                Appliquer
              </Button>
            )
          }
        >
          <RhythmSection value={rhythm} onChange={setRhythm} />
        </Panel>
      )}

      <Panel title={`Joueurs (${state.players.length}/${state.config.maxPlayers})`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {state.players.map((p) => (
            <PlayerChip
              key={p.userId}
              displayName={p.displayName}
              seed={p.avatarSeed}
              isHost={p.isHost}
              ready={p.ready}
              connected={p.connected}
            />
          ))}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        {!isHost && (
          <Button
            variant="secondary"
            onClick={() => socket.emit("player:ready", { code, ready: !me?.ready })}
          >
            {me?.ready ? "Je ne suis plus prêt" : "Je suis prêt"}
          </Button>
        )}
        {isHost && (
          <Button
            leadingIcon={<Play className="h-4 w-4" strokeWidth={1.5} />}
            disabled={state.players.length < 1}
            onClick={() => socket.emit("room:start", { code })}
          >
            Lancer la partie
          </Button>
        )}
      </div>

      <ChatPanel socket={socket} code={code} messages={chatMessages} />
    </div>
  );
}

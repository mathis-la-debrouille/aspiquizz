"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { GameSocket } from "@/lib/socket/client";
import type { ChatMessagePayload } from "@/server/socket/events";

export function ChatPanel({
  socket,
  code,
  messages,
}: {
  socket: GameSocket;
  code: string;
  messages: ChatMessagePayload[];
}) {
  const [text, setText] = useState("");

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit("chat:send", { code, text: trimmed.slice(0, 200) });
    setText("");
  }

  return (
    <Panel title="Discussion" className="flex flex-col gap-3">
      <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-14 text-ink-faint">Aucun message pour l&apos;instant.</p>
        )}
        {messages.map((m, i) => (
          <p key={i} className="text-14 text-ink-mid">
            <span className="font-medium text-ink-high">{m.displayName}</span> — {m.text}
          </p>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Écrire un message…"
          maxLength={200}
          className="flex-1"
        />
        <Button variant="secondary" size="sm" aria-label="Envoyer" onClick={send}>
          <Send className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
    </Panel>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { AnswerPayload } from "@/components/room/QuestionScreen";

export function OpenAnswerSurface({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (payload: AnswerPayload) => void;
}) {
  const [text, setText] = useState("");

  function submit() {
    if (!text.trim()) return;
    onSubmit({ text: text.trim() });
  }

  return (
    <div className="flex gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={disabled}
        placeholder="Votre réponse…"
        className="flex-1"
        autoFocus
      />
      <Button disabled={disabled || !text.trim()} onClick={submit}>
        Valider
      </Button>
    </div>
  );
}

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
    <div className="flex items-stretch gap-2">
      {/* The flex-1 has to sit on a wrapper, not on <Input>: Input forwards its
       *  className to the inner <input> while wrapping it in a plain flex-col div,
       *  so `<Input className="flex-1">` never stretched anything and the field came
       *  out barely wide enough for a short city name — long answers like
       *  "Sri Jayawardenepura Kotte" were cut off mid-word while typing. */}
      <div className="min-w-0 flex-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={disabled}
          placeholder="Votre réponse…"
          className="w-full"
          autoFocus
        />
      </div>
      <Button disabled={disabled || !text.trim()} onClick={submit}>
        Valider
      </Button>
    </div>
  );
}

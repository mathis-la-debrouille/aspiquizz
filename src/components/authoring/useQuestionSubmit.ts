"use client";

import { useState } from "react";
import type { ActionResult } from "@/server/questions/actions";

/**
 * The save cycle shared by every authoring form: flip pending, clear the last error, run the
 * server action, and either surface its error or hand the new id up. Six forms each carried
 * their own `pending`/`error` pair and the same eight lines around the action call.
 *
 * `setError` is exposed for the forms that can fail before the save — the image and sort forms
 * upload media first, and an upload error belongs in the same slot.
 */
export function useQuestionSubmit(onSaved: (id: string) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(run: () => Promise<ActionResult>): Promise<void> {
    setPending(true);
    setError(null);
    const result = await run();
    setPending(false);
    if (!result.ok) setError(result.error);
    else onSaved(result.id);
  }

  return { pending, error, setError, submit };
}

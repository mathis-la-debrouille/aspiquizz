"use server";

/**
 * Web entry point for question reports. Thin wrapper over `flags.ts` — the split
 * exists per CLAUDE.md so `flags.ts` stays importable outside a Next request
 * context (the MCP transport reaches that far).
 *
 * The viewer is resolved from the session here and never accepted as an argument:
 * exports of a `"use server"` file are client-callable RPCs, so a caller-supplied
 * userId would let anyone file a report as anyone else.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { rooms } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { requireAdmin } from "@/server/admin/guard";
import { flagQuestion, resolveFlagsForQuestion, type FlagResult } from "@/server/questions/flags";
import type { FlagResolution } from "@/server/db/schema";

const flagInputSchema = z.object({
  questionId: z.string().min(1),
  /** The public join code, not the DB id — resolved below. */
  roomCode: z.string().trim().min(1).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export async function flagQuestionAction(input: unknown): Promise<FlagResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expirée." };

  const parsed = flagInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Requête invalide." };

  // code -> DB id. A missing or stale code is not an error: the report is about
  // the question, and an empty room is deleted two minutes after it empties.
  let roomId: string | null = null;
  if (parsed.data.roomCode) {
    const [room] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.code, parsed.data.roomCode));
    roomId = room?.id ?? null;
  }

  return flagQuestion(parsed.data.questionId, session.user.id, {
    roomId,
    reason: parsed.data.reason ?? null,
  });
}

export async function resolveFlagsAction(
  questionId: string,
  resolution: FlagResolution,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const result = await resolveFlagsForQuestion(questionId, resolution, admin.id);
  revalidatePath("/admin");
  return result;
}

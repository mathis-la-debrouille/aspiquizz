import { z } from "zod";
import { FLAG_REASON_MAX } from "@/lib/flags";

/** A player's report. `roomCode` is the public join code, never the DB room id. */
export const flagQuestionInputSchema = z.object({
  questionId: z.string().trim().min(1),
  roomCode: z.string().trim().min(1).nullable().optional(),
  reason: z.string().trim().max(FLAG_REASON_MAX).nullable().optional(),
});

export type FlagQuestionInput = z.infer<typeof flagQuestionInputSchema>;

export const flagResolutionSchema = z.enum(["fixed", "removed", "kept"]);

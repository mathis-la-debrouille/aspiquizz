import { z } from "zod";

/**
 * Every client->server socket event payload, validated here — sockets are a
 * trust boundary exactly like a server action or route handler (CLAUDE.md
 * conventions). Server->client payloads are typed (src/server/socket/events.ts)
 * but not Zod-validated: the server is the trusted party there.
 */

const roomCodeSchema = z.string().length(6);

export const lobbySubscribeSchema = z.object({});

/** Explicit keys (not z.record with an enum key) so this stays a genuinely partial map across
 *  Zod versions — see DECISIONS.md, Addendum B.2. */
const timeLimitByTypeSchema = z
  .object({
    open: z.number().int().min(5).max(120),
    mcq: z.number().int().min(5).max(120),
    image: z.number().int().min(5).max(120),
    geo: z.number().int().min(5).max(120),
  })
  .partial()
  .optional();

export const roomConfigSchema = z.object({
  questionCount: z.number().int().min(1).max(50),
  timeLimitS: z.number().int().min(5).max(120),
  timeLimitByType: timeLimitByTypeSchema,
  categoryIds: z.array(z.string()).default([]),
  difficultyMin: z.number().int().min(1).max(5),
  difficultyMax: z.number().int().min(1).max(5),
  allowLateJoin: z.boolean().default(true),
  maxPlayers: z.number().int().min(2).max(50),
  revealDurationS: z.number().int().min(2).max(20),
  scoringMode: z.enum(["speed", "flat"]),
  /**
   * Not in the brief's §5 config literal, but §11.1's host:next event is
   * explicitly documented as "advance during a reveal, if manualAdvance" —
   * the config shape needs this flag for that event to mean anything. See
   * DECISIONS.md.
   */
  manualAdvance: z.boolean().default(false),
});

export const roomCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  source: z.enum(["quiz", "random"]),
  quizId: z.string().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  config: roomConfigSchema,
});

export const roomJoinSchema = z.object({ code: roomCodeSchema });
export const roomLeaveSchema = z.object({ code: roomCodeSchema });
export const roomKickSchema = z.object({ code: roomCodeSchema, userId: z.string() });
export const roomUpdateConfigSchema = z.object({ code: roomCodeSchema, config: roomConfigSchema });
export const roomStartSchema = z.object({ code: roomCodeSchema });
export const hostSkipSchema = z.object({ code: roomCodeSchema });
export const hostNextSchema = z.object({ code: roomCodeSchema });

/** Correction phase — the host ruling on one player's answer. */
export const correctionSetSchema = z.object({
  code: roomCodeSchema,
  position: z.number().int().min(0),
  userId: z.string().min(1),
  /** Upper bound is the question's difficulty tier; clamped server-side against the
   *  real question, since a client could otherwise claim any number here. */
  awarded: z.number().int().min(0).max(5),
});
export const correctionNextSchema = z.object({ code: roomCodeSchema });

export const playerReadySchema = z.object({ code: roomCodeSchema, ready: z.boolean() });

const answerPayloadSchema = z.object({
  text: z.string().max(200).optional(),
  choiceIds: z.array(z.string()).max(6).optional(),
  iso3: z.string().length(3).optional(),
});

export const answerSubmitSchema = z.object({
  code: roomCodeSchema,
  position: z.number().int().min(0),
  payload: answerPayloadSchema,
  /** False for a keystroke-by-keystroke draft, true when the player commits.
   *  Defaults to true so an older client, or any caller that omits it, keeps the
   *  previous commit-on-submit behaviour rather than silently sending drafts. */
  final: z.boolean().optional().default(true),
});

export const chatSendSchema = z.object({
  code: roomCodeSchema,
  text: z.string().trim().min(1).max(200),
});

export const REACTION_EMOJIS = ["👏", "😂", "😮", "❤️", "🔥", "😢"] as const;
export const reactionSendSchema = z.object({
  code: roomCodeSchema,
  emoji: z.enum(REACTION_EMOJIS),
});

export const timeSyncSchema = z.object({ clientTime: z.number() });

export type RoomConfigInput = z.infer<typeof roomConfigSchema>;
export type RoomCreateInput = z.infer<typeof roomCreateSchema>;
export type AnswerPayloadInput = z.infer<typeof answerPayloadSchema>;

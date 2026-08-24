import type { SanitisedQuestion } from "@/server/game/sanitize";
import type { RoomConfigInput } from "@/lib/schemas/socket";
import type { RoomStatus, RoomVisibility } from "@/server/db/schema";
import type { SocketUser } from "@/server/socket/auth";

/** Populated by the auth middleware (server/socket/index.ts) before any handler runs. */
export interface SocketData {
  user: SocketUser;
}

/** brief §11.2 — server->client event payloads. */

export interface LobbyRoomSummary {
  code: string;
  name: string;
  hostDisplayName: string;
  playerCount: number;
  maxPlayers: number;
  categoryNames: string[];
  status: RoomStatus;
  visibility: RoomVisibility;
}

export interface RoomPlayerView {
  userId: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  score: number;
  streak: number;
}

export type RoomPhase =
  | "lobby"
  | "countdown"
  | "question"
  | "locked"
  /** Post-run correction: the host rules on every answer, question by question,
   *  with the whole room watching. Nothing is scored before this. */
  | "correction"
  | "reveal"
  | "scoreboard"
  | "finished";

export interface RoomStateView {
  code: string;
  name: string;
  hostId: string;
  config: RoomConfigInput;
  status: RoomStatus;
  visibility: RoomVisibility;
  phase: RoomPhase;
  players: RoomPlayerView[];
  currentQuestion: SanitisedQuestion | null;
  position: number;
  total: number;
  deadlineMs: number | null;
  /** Set only when the room has zero connected players and the empty-room deletion timer
   *  (Addendum B.4) is armed — lets a client that reconnects mid-countdown show why. */
  closesAtMs: number | null;
  serverNowMs: number;
}

export interface QuestionShowPayload {
  position: number;
  total: number;
  question: SanitisedQuestion;
  deadlineMs: number;
  serverNowMs: number;
}

export interface PerPlayerReveal {
  userId: string;
  isCorrect: boolean;
  msTaken: number;
  pointsAwarded: number;
  newScore: number;
  streak: number;
}

export interface QuestionRevealPayload {
  position: number;
  correct: string;
  explanation: string | null;
  perPlayer: PerPlayerReveal[];
  nextInMs: number;
}

export interface ScoreboardEntry {
  userId: string;
  score: number;
  rank: number;
  delta: number;
  streak: number;
}

export interface PodiumEntry {
  userId: string;
  displayName: string;
  avatarSeed: string;
  score: number;
  rank: number;
}

export interface QuestionHistoryEntry {
  position: number;
  prompt: string;
}

export interface AnswerLogEntry {
  position: number;
  userId: string;
  isCorrect: boolean;
  pointsAwarded: number;
  msTaken: number;
}

export interface RoomFinishedPayload {
  podium: PodiumEntry[];
  fullScoreboard: ScoreboardEntry[];
  highlights: string[];
  /** Every question the room actually played, in order — the final screen's "who answered
   *  what" breakdown. Populated from `answers`/`room_questions` at finishGame, not accumulated
   *  during the loop, since the between-questions scoreboard no longer shows after every
   *  question (every SCOREBOARD_INTERVAL-th one) and this is the one place a player can still
   *  see the full per-question record. */
  questionHistory: QuestionHistoryEntry[];
  answerLog: AnswerLogEntry[];
}

/** One player's raw answer to one question, as typed, for the correction phase. */
export interface CorrectionAnswer {
  userId: string;
  displayName: string;
  /** Exactly what the player submitted — never normalised, so the room can judge it. */
  text: string;
  /** iso3 for click-to-answer geo modes, where there is no text to show. */
  iso3?: string;
  /** What the grader concluded, used to pre-fill the host's toggles. A suggestion,
   *  never the verdict: 40 questions times six players is too many decisions to
   *  make from scratch, and the machine is right most of the time. */
  suggested: boolean;
  /** The host's ruling. Starts equal to `suggested`. */
  verdict: boolean;
  msTaken: number;
}

export interface CorrectionShowPayload {
  position: number;
  total: number;
  prompt: string;
  /** The accepted answer(s), joined — what the room is judging against. */
  correct: string;
  explanation: string | null;
  difficulty: number;
  answers: CorrectionAnswer[];
}

export interface ChatMessagePayload {
  userId: string;
  displayName: string;
  text: string;
  sentAt: number;
}

export interface ReactionBurstPayload {
  userId: string;
  emoji: string;
}

export interface ErrorPayload {
  code: string;
  messageFr: string;
}

export interface ServerToClientEvents {
  "lobby:rooms": (rooms: LobbyRoomSummary[]) => void;
  "lobby:room_added": (room: LobbyRoomSummary) => void;
  "lobby:room_removed": (code: string) => void;
  "lobby:room_updated": (room: LobbyRoomSummary) => void;
  "room:state": (state: RoomStateView) => void;
  "room:player_joined": (player: RoomPlayerView) => void;
  "room:player_left": (payload: { userId: string }) => void;
  "room:player_kicked": (payload: { userId: string }) => void;
  "room:host_changed": (payload: { hostId: string }) => void;
  "question:show": (payload: QuestionShowPayload) => void;
  "question:answered": (payload: { userId: string }) => void;
  "question:lock": (payload: { position: number }) => void;
  "question:reveal": (payload: QuestionRevealPayload) => void;
  "correction:show": (payload: CorrectionShowPayload) => void;
  /** Broadcast so every player sees the host flip a verdict live, not just the host. */
  "correction:verdict": (payload: { position: number; userId: string; verdict: boolean }) => void;
  "scoreboard:update": (entries: ScoreboardEntry[]) => void;
  "room:finished": (payload: RoomFinishedPayload) => void;
  "chat:message": (payload: ChatMessagePayload) => void;
  "reaction:burst": (payload: ReactionBurstPayload) => void;
  error: (payload: ErrorPayload) => void;
}

export interface ClientToServerEvents {
  "lobby:subscribe": () => void;
  "room:create": (
    payload: {
      name: string;
      source: "quiz" | "random";
      quizId?: string;
      visibility: "public" | "private";
      config: RoomConfigInput;
    },
    ack: (result: { code: string } | { error: string }) => void,
  ) => void;
  "room:join": (
    payload: { code: string },
    ack: (result: { ok: true } | { error: string }) => void,
  ) => void;
  "room:leave": (payload: { code: string }) => void;
  "room:kick": (payload: { code: string; userId: string }) => void;
  "room:update_config": (payload: { code: string; config: RoomConfigInput }) => void;
  "room:start": (payload: { code: string }) => void;
  "player:ready": (payload: { code: string; ready: boolean }) => void;
  "answer:submit": (payload: {
    code: string;
    position: number;
    payload: { text?: string; choiceIds?: string[]; iso3?: string };
  }) => void;
  "host:skip": (payload: { code: string }) => void;
  "host:next": (payload: { code: string }) => void;
  /** Host flips one player's verdict during the correction phase. */
  "correction:set": (payload: {
    code: string;
    position: number;
    userId: string;
    verdict: boolean;
  }) => void;
  /** Host commits the current question's verdicts and moves to the next one. */
  "correction:next": (payload: { code: string }) => void;
  "chat:send": (payload: { code: string; text: string }) => void;
  "reaction:send": (payload: { code: string; emoji: string }) => void;
  "time:sync": (
    payload: { clientTime: number },
    ack: (result: { serverTime: number }) => void,
  ) => void;
}

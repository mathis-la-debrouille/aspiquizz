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
  "lobby" | "countdown" | "question" | "locked" | "reveal" | "scoreboard" | "finished";

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

export interface RoomFinishedPayload {
  podium: PodiumEntry[];
  fullScoreboard: ScoreboardEntry[];
  highlights: string[];
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
  "chat:send": (payload: { code: string; text: string }) => void;
  "reaction:send": (payload: { code: string; emoji: string }) => void;
  "time:sync": (
    payload: { clientTime: number },
    ack: (result: { serverTime: number }) => void,
  ) => void;
}

import { eq, and } from "drizzle-orm";
import type { Server } from "socket.io";
import { db } from "@/server/db";
import { rooms as roomsTable, roomPlayers, roomQuestions, answers } from "@/server/db/schema";
import type { RoomStatus, RoomVisibility } from "@/server/db/schema";
import type { RoomConfigInput, AnswerPayloadInput } from "@/lib/schemas/socket";
import { gradeAnswer } from "@/server/game/grading";
import { computePoints } from "@/server/game/scoring";
import {
  getFullQuestionDetail,
  toSanitised,
  toGradable,
  type FullQuestionDetail,
} from "@/server/game/question-detail";
import { selectQuestionsForRoom } from "@/server/game/question-selection";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  LobbyRoomSummary,
  RoomPlayerView,
  RoomStateView,
  RoomPhase,
  ScoreboardEntry,
  PodiumEntry,
} from "@/server/socket/events";

const COUNTDOWN_MS = 3_000;
const ANSWER_GRACE_MS = 300;
const SCOREBOARD_HOLD_MS = 3_000;
const EMPTY_ROOM_TIMEOUT_MS = 60_000;

export interface ConnectedPlayer {
  userId: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  socketIds: Set<string>;
  ready: boolean;
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  joinedAt: number;
  isSpectator: boolean;
}

interface FrozenQuestion {
  position: number;
  questionId: string;
  timeLimitS: number;
}

interface PendingAnswer {
  payload: AnswerPayloadInput;
  submittedAt: number;
}

export interface RoomState {
  /** The rooms.id ULID — the actual foreign-key value for room_players/room_questions/answers.
   *  `code` is only the public-facing 6-char lookup string (channel name, join code). */
  id: string;
  code: string;
  name: string;
  hostId: string;
  quizId: string | null;
  source: "quiz" | "random";
  visibility: RoomVisibility;
  config: RoomConfigInput;
  status: RoomStatus;
  players: Map<string, ConnectedPlayer>;
  frozenQuestions: FrozenQuestion[];
  currentIndex: number;
  phase: RoomPhase;
  deadlineMs: number | null;
  currentDetail: FullQuestionDetail | null;
  pendingAnswers: Map<string, PendingAnswer>;
  emptyTimer: ReturnType<typeof setTimeout> | null;
  loopCancelled: boolean;
  createdAt: number;
}

const rooms = new Map<string, RoomState>();

export function getRoom(code: string): RoomState | undefined {
  return rooms.get(code);
}

export function allRooms(): RoomState[] {
  return [...rooms.values()];
}

export function createRoomState(params: {
  id: string;
  code: string;
  name: string;
  hostId: string;
  quizId: string | null;
  source: "quiz" | "random";
  visibility: RoomVisibility;
  config: RoomConfigInput;
}): RoomState {
  const state: RoomState = {
    id: params.id,
    code: params.code,
    name: params.name,
    hostId: params.hostId,
    quizId: params.quizId,
    source: params.source,
    visibility: params.visibility,
    config: params.config,
    status: "lobby",
    players: new Map(),
    frozenQuestions: [],
    currentIndex: -1,
    phase: "lobby",
    deadlineMs: null,
    currentDetail: null,
    pendingAnswers: new Map(),
    emptyTimer: null,
    loopCancelled: false,
    createdAt: Date.now(),
  };
  rooms.set(params.code, state);
  return state;
}

export function deleteRoomState(code: string): void {
  const room = rooms.get(code);
  if (room?.emptyTimer) clearTimeout(room.emptyTimer);
  rooms.delete(code);
}

export function toLobbySummary(room: RoomState, categoryNames: string[]): LobbyRoomSummary {
  const host = room.players.get(room.hostId);
  return {
    code: room.code,
    name: room.name,
    hostDisplayName: host?.displayName ?? "?",
    playerCount: room.players.size,
    maxPlayers: room.config.maxPlayers,
    categoryNames,
    status: room.status,
    visibility: room.visibility,
  };
}

function toPlayerView(room: RoomState, player: ConnectedPlayer): RoomPlayerView {
  return {
    userId: player.userId,
    username: player.username,
    displayName: player.displayName,
    avatarSeed: player.avatarSeed,
    isHost: player.userId === room.hostId,
    ready: player.ready,
    connected: player.socketIds.size > 0,
    score: player.score,
    streak: player.streak,
  };
}

export function toRoomStateView(room: RoomState): RoomStateView {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    config: room.config,
    status: room.status,
    visibility: room.visibility,
    phase: room.phase,
    players: [...room.players.values()].map((p) => toPlayerView(room, p)),
    currentQuestion: room.currentDetail ? toSanitised(room.currentDetail) : null,
    position: room.currentIndex,
    total: room.frozenQuestions.length,
    deadlineMs: room.deadlineMs,
    serverNowMs: Date.now(),
  };
}

/** Host migrates to the longest-present connected player — brief §11.3. */
export function migrateHostIfNeeded(room: RoomState): boolean {
  const currentHost = room.players.get(room.hostId);
  if (currentHost && currentHost.socketIds.size > 0) return false;

  const candidates = [...room.players.values()]
    .filter((p) => p.socketIds.size > 0)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const next = candidates[0];
  if (!next) return false;

  room.hostId = next.userId;
  return true;
}

export function scheduleEmptyRoomCheck(room: RoomState, onAbandon: (code: string) => void): void {
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  const anyConnected = [...room.players.values()].some((p) => p.socketIds.size > 0);
  if (anyConnected) return;

  room.emptyTimer = setTimeout(() => {
    const stillEmpty = ![...room.players.values()].some((p) => p.socketIds.size > 0);
    if (stillEmpty) onAbandon(room.code);
  }, EMPTY_ROOM_TIMEOUT_MS);
}

/** Rooms left 'running' at process boot are stale — brief §11.3. */
export async function abandonStaleRunningRooms(): Promise<void> {
  await db
    .update(roomsTable)
    .set({ status: "abandoned", endedAt: new Date() })
    .where(eq(roomsTable.status, "running"));
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;

function roomChannel(code: string): string {
  return `room:${code}`;
}

export async function startGame(io: GameIo, room: RoomState): Promise<void> {
  const selected = await selectQuestionsForRoom(room.source, room.quizId, room.config);
  if (selected.length === 0) {
    io.to(roomChannel(room.code)).emit("error", {
      code: "no_questions",
      messageFr: "Aucune question ne correspond à la configuration du salon.",
    });
    return;
  }

  room.frozenQuestions = selected.map((s, position) => ({
    position,
    questionId: s.questionId,
    timeLimitS: s.timeLimitS || room.config.defaultTimeLimitS,
  }));
  room.status = "running";

  await db
    .update(roomsTable)
    .set({ status: "running", startedAt: new Date(), currentIndex: -1 })
    .where(eq(roomsTable.code, room.code));
  await db.insert(roomQuestions).values(
    room.frozenQuestions.map((q) => ({
      roomId: room.id,
      position: q.position,
      questionId: q.questionId,
      timeLimitS: q.timeLimitS,
    })),
  );

  void runGameLoop(io, room);
}

async function runGameLoop(io: GameIo, room: RoomState): Promise<void> {
  const channel = roomChannel(room.code);

  for (const frozen of room.frozenQuestions) {
    if (room.loopCancelled) return;

    room.currentIndex = frozen.position;
    room.phase = "countdown";
    await sleep(COUNTDOWN_MS);
    if (room.loopCancelled) return;

    const detail = await getFullQuestionDetail(frozen.questionId);
    if (!detail) continue; // question was deleted mid-flight — skip rather than crash the room
    room.currentDetail = detail;
    room.pendingAnswers.clear();

    const startedAt = Date.now();
    const deadlineMs = startedAt + frozen.timeLimitS * 1000;
    room.deadlineMs = deadlineMs;
    room.phase = "question";

    io.to(channel).emit("question:show", {
      position: frozen.position,
      total: room.frozenQuestions.length,
      question: toSanitised(detail),
      deadlineMs,
      serverNowMs: Date.now(),
    });

    await waitForAnswersOrDeadline(room, deadlineMs);
    if (room.loopCancelled) return;

    room.phase = "locked";
    io.to(channel).emit("question:lock", { position: frozen.position });

    const gradable = toGradable(detail);
    const perPlayer: {
      userId: string;
      isCorrect: boolean;
      msTaken: number;
      pointsAwarded: number;
      newScore: number;
      streak: number;
    }[] = [];

    for (const player of room.players.values()) {
      if (player.isSpectator) continue;
      const pending = room.pendingAnswers.get(player.userId);
      const msTaken = pending ? pending.submittedAt - startedAt : frozen.timeLimitS * 1000;
      const graded = pending ? gradeAnswer(gradable, pending.payload) : { isCorrect: false };

      player.streak = graded.isCorrect ? player.streak + 1 : 0;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      if (graded.isCorrect) player.correctCount += 1;

      const { points } = computePoints({
        isCorrect: graded.isCorrect,
        msTaken,
        timeLimitMs: frozen.timeLimitS * 1000,
        pointsBase: detail.pointsBase,
        streak: player.streak,
        scoringMode: room.config.scoringMode,
      });
      player.score += points;

      perPlayer.push({
        userId: player.userId,
        isCorrect: graded.isCorrect,
        msTaken,
        pointsAwarded: points,
        newScore: player.score,
        streak: player.streak,
      });

      await db.insert(answers).values({
        roomId: room.id,
        questionId: frozen.questionId,
        userId: player.userId,
        position: frozen.position,
        payload: pending?.payload ?? { text: "" },
        isCorrect: graded.isCorrect,
        msTaken,
        pointsAwarded: points,
      });
      await db
        .update(roomPlayers)
        .set({ score: player.score, streak: player.streak, correctCount: player.correctCount })
        .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.userId, player.userId)));
    }

    room.phase = "reveal";
    const correctAnswerLabel = describeCorrectAnswer(detail);
    io.to(channel).emit("question:reveal", {
      position: frozen.position,
      correct: correctAnswerLabel,
      explanation: detail.explanation,
      perPlayer,
      nextInMs: room.config.revealDurationS * 1000,
    });

    await sleep(room.config.revealDurationS * 1000);
    if (room.loopCancelled) return;

    const isLast = frozen.position === room.frozenQuestions.length - 1;
    if (!isLast) {
      room.phase = "scoreboard";
      io.to(channel).emit("scoreboard:update", buildScoreboard(room));
      await sleep(SCOREBOARD_HOLD_MS);
      if (room.loopCancelled) return;
    }

    room.currentDetail = null;
    room.deadlineMs = null;
  }

  await finishGame(io, room);
}

async function waitForAnswersOrDeadline(room: RoomState, deadlineMs: number): Promise<void> {
  const totalMs = deadlineMs - Date.now() + ANSWER_GRACE_MS;
  const pollMs = 150;
  let elapsed = 0;
  while (elapsed < totalMs) {
    if (room.loopCancelled) return;
    const activePlayers = [...room.players.values()].filter((p) => !p.isSpectator);
    const allAnswered =
      activePlayers.length > 0 && activePlayers.every((p) => room.pendingAnswers.has(p.userId));
    if (allAnswered) return;
    const step = Math.min(pollMs, totalMs - elapsed);
    await sleep(step);
    elapsed += step;
  }
}

function describeCorrectAnswer(detail: FullQuestionDetail): string {
  switch (detail.type) {
    case "open":
      return detail.openAnswers[0] ?? "";
    case "mcq":
      return detail.choices
        .filter((c) => c.isCorrect)
        .map((c) => c.label)
        .join(", ");
    case "image":
      return detail.answerMode === "mcq"
        ? detail.choices
            .filter((c) => c.isCorrect)
            .map((c) => c.label)
            .join(", ")
        : (detail.openAnswers[0] ?? "");
    case "geo":
      return detail.geo?.targetIso3 ?? "";
  }
}

function buildScoreboard(room: RoomState): ScoreboardEntry[] {
  const sorted = [...room.players.values()]
    .filter((p) => !p.isSpectator)
    .sort((a, b) => b.score - a.score);
  return sorted.map((p, i) => ({
    userId: p.userId,
    score: p.score,
    rank: i + 1,
    delta: 0,
    streak: p.streak,
  }));
}

async function finishGame(io: GameIo, room: RoomState): Promise<void> {
  room.phase = "finished";
  room.status = "finished";
  room.currentDetail = null;
  room.deadlineMs = null;

  const sorted = [...room.players.values()]
    .filter((p) => !p.isSpectator)
    .sort((a, b) => b.score - a.score);

  for (let i = 0; i < sorted.length; i++) {
    await db
      .update(roomPlayers)
      .set({ finalRank: i + 1 })
      .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.userId, sorted[i]!.userId)));
  }
  await db
    .update(roomsTable)
    .set({ status: "finished", endedAt: new Date() })
    .where(eq(roomsTable.code, room.code));

  const podium: PodiumEntry[] = sorted.slice(0, 3).map((p, i) => ({
    userId: p.userId,
    displayName: p.displayName,
    avatarSeed: p.avatarSeed,
    score: p.score,
    rank: i + 1,
  }));

  io.to(roomChannel(room.code)).emit("room:finished", {
    podium,
    fullScoreboard: buildScoreboard(room),
    // User-stats/XP/badge highlights are Phase 9's job — see DECISIONS.md.
    highlights: [],
  });
}

export function recordAnswer(
  room: RoomState,
  userId: string,
  payload: AnswerPayloadInput,
): boolean {
  if (room.phase !== "question") return false;
  if (room.pendingAnswers.has(userId)) return false;
  room.pendingAnswers.set(userId, { payload, submittedAt: Date.now() });
  return true;
}

export function cancelLoop(room: RoomState): void {
  room.loopCancelled = true;
}

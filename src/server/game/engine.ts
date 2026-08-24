import { eq, and, sql, inArray } from "drizzle-orm";
import type { Server } from "socket.io";
import { db } from "@/server/db";
import {
  rooms as roomsTable,
  roomPlayers,
  roomQuestions,
  answers,
  userCategoryStats,
  questionStats,
} from "@/server/db/schema";
import type { RoomStatus, RoomVisibility } from "@/server/db/schema";
import type { RoomConfigInput, AnswerPayloadInput } from "@/lib/schemas/socket";
import { gradeAnswer } from "@/server/game/grading";
import { computePoints, pointsForDifficulty } from "@/server/game/scoring";
import {
  getFullQuestionDetail,
  toSanitised,
  toGradable,
  type FullQuestionDetail,
} from "@/server/game/question-detail";
import { selectQuestionsForRoom } from "@/server/game/question-selection";
import { awardProgression } from "@/server/progression/award";
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
/** The between-questions scoreboard interrupts the game's pace — show it every Nth question,
 *  not after every single one. */
const SCOREBOARD_INTERVAL = 5;
/** Addendum B.4 — supersedes brief §11.3's 60s "abandoned after 60s empty" figure. */
const EMPTY_ROOM_TIMEOUT_MS = 120_000;
export const SWEEP_INTERVAL_MS = 60_000;

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
  /** Questions this player was actually present (non-spectator) for — the denominator for
   *  "sans-faute" and the per-game questionsAnswered stat. Late joiners are spectators for the
   *  questions they missed, so this can be less than the room's total question count. */
  questionsSeen: number;
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
  /** When the empty-room deletion timer will fire, if one is armed — surfaced to clients as
   *  `RoomStateView.closesAtMs` (Addendum B.4) so a player who reconnects mid-countdown sees
   *  why. Null whenever the room has at least one connected player. */
  emptyDeadlineMs: number | null;
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
    emptyDeadlineMs: null,
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
    currentQuestion: room.currentDetail
      ? toSanitised(room.currentDetail, room.frozenQuestions[room.currentIndex]?.timeLimitS ?? 0)
      : null,
    position: room.currentIndex,
    total: room.frozenQuestions.length,
    deadlineMs: room.deadlineMs,
    closesAtMs: room.emptyDeadlineMs,
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

// Duplicated from socket/handlers.ts's own copy (that file can't import from here without a
// circular dependency the other way) — must stay in sync if either channel name ever changes.
const LOBBY_CHANNEL = "lobby";

/** Addendum B.4 — (re)arms the 2-minute empty-room timer whenever the room has zero connected
 *  players, and cancels it the moment anyone (re)joins. `io` is only needed for the deletion
 *  callback itself, not the scheduling. */
export function scheduleEmptyRoomCheck(room: RoomState, io: GameIo): void {
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  const anyConnected = [...room.players.values()].some((p) => p.socketIds.size > 0);
  if (anyConnected) {
    room.emptyDeadlineMs = null;
    return;
  }

  room.emptyDeadlineMs = Date.now() + EMPTY_ROOM_TIMEOUT_MS;
  room.emptyTimer = setTimeout(() => {
    const stillEmpty = ![...room.players.values()].some((p) => p.socketIds.size > 0);
    if (stillEmpty) void deleteEmptyRoom(io, room);
  }, EMPTY_ROOM_TIMEOUT_MS);
}

/** Cancel-only counterpart, for the join/reconnect path — doesn't need `io` (nothing gets
 *  deleted here), unlike scheduleEmptyRoomCheck's re-arm branch. Without this, a rejoining
 *  player's very first `room:state` snapshot could still carry a stale `closesAtMs`: the armed
 *  setTimeout already no-ops correctly on its own (it re-checks emptiness when it fires), but
 *  the deadline shown to clients wouldn't clear until that timer actually fired. */
export function cancelEmptyRoomCheck(room: RoomState): void {
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  room.emptyDeadlineMs = null;
}

/** The actual deletion (Addendum B.4) — never runs for a `finished` room's DB row (those hold
 *  permanent history), but still frees the in-memory RoomState either way so a room nobody's
 *  looked at since the podium screen doesn't sit in memory for the rest of the process's life.
 *  For `lobby`/`running` rooms: detaches (nulls, doesn't delete) any recorded `answers` rows
 *  before dropping room_questions/room_players/rooms, so question_stats and every per-user
 *  aggregate already derived from those answers stays intact — see DECISIONS.md for why nulling
 *  the FK was chosen over cascading the delete. */
export async function deleteEmptyRoom(io: GameIo, room: RoomState): Promise<void> {
  deleteRoomState(room.code);
  if (room.status === "finished") return;

  cancelLoop(room);
  await db.update(answers).set({ roomId: null }).where(eq(answers.roomId, room.id));
  await db.delete(roomQuestions).where(eq(roomQuestions.roomId, room.id));
  await db.delete(roomPlayers).where(eq(roomPlayers.roomId, room.id));
  await db.delete(roomsTable).where(eq(roomsTable.id, room.id));

  io.to(LOBBY_CHANNEL).emit("lobby:room_removed", room.code);
}

/** Safety-net sweep (Addendum B.4: "on boot and every 60s") for any in-memory room whose
 *  per-room `emptyTimer` should have fired by now but somehow didn't — in normal operation this
 *  is a no-op every time, since `scheduleEmptyRoomCheck`'s own `setTimeout` already handles it.
 *  Deliberately doesn't touch the DB directly for rooms with no in-memory entry at all (a
 *  process restart's worth of orphans): that's `abandonStaleRooms`'s job, which runs once at
 *  boot before this sweeper's interval is even registered — see server.ts/socket/index.ts. */
export function sweepEmptyRooms(io: GameIo): void {
  const now = Date.now();
  for (const room of allRooms()) {
    if (room.emptyDeadlineMs !== null && room.emptyDeadlineMs <= now) {
      void deleteEmptyRoom(io, room);
    }
  }
}

/** Rooms left 'lobby' or 'running' at process boot are stale — the in-memory `rooms` Map that
 *  made them real is gone with the previous process, so their DB row is now just orphaned
 *  bookkeeping (brief §11.3). Covers both statuses, not just 'running': a 'lobby' room the
 *  previous process crashed before anyone started is exactly as stale, even though it never
 *  had a running game loop to interrupt. */
export async function abandonStaleRooms(): Promise<void> {
  await db
    .update(roomsTable)
    .set({ status: "abandoned", endedAt: new Date() })
    .where(inArray(roomsTable.status, ["lobby", "running"]));
}

/** Graceful-shutdown counterpart to abandonStaleRooms — called once, deliberately, instead of
 *  waiting for the next boot to notice. Cancels every in-flight game loop (so no `finishGame`/
 *  progression-award runs on a half-delivered game), tells every currently-connected client why
 *  they're about to be dropped, and marks every non-terminal room abandoned immediately rather
 *  than leaving the DB saying "running" for however long the process takes to actually restart. */
export async function prepareForShutdown(io: GameIo): Promise<void> {
  for (const room of allRooms()) {
    cancelLoop(room);
  }
  io.emit("error", {
    code: "server_shutdown",
    messageFr: "Le serveur redémarre — reconnectez-vous dans un instant.",
  });
  await abandonStaleRooms();
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
    // Resolution order per Addendum B.2: an explicit per-type override wins, else the room's
    // flat default. Written once here into room_questions.time_limit_s below and never
    // re-read from config afterwards.
    timeLimitS: room.config.timeLimitByType?.[s.type] ?? room.config.timeLimitS,
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
      question: toSanitised(detail, frozen.timeLimitS),
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
      player.questionsSeen += 1;
      if (graded.isCorrect) player.correctCount += 1;

      const { points } = computePoints({
        isCorrect: graded.isCorrect,
        msTaken,
        timeLimitMs: frozen.timeLimitS * 1000,
        // Difficulty is the multiplier — see pointsForDifficulty. Not read off
        // detail.pointsBase, which is 1000 for every question ever created.
        pointsBase: pointsForDifficulty(detail.difficulty),
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

      // Live per-category running total — feeds the profile's category breakdown and the
      // geography-themed badges (globe-trotteur/cartographe) without a separate aggregation pass.
      await db
        .insert(userCategoryStats)
        .values({
          userId: player.userId,
          categoryId: detail.categoryId,
          answered: 1,
          correct: graded.isCorrect ? 1 : 0,
        })
        .onConflictDoUpdate({
          target: [userCategoryStats.userId, userCategoryStats.categoryId],
          set: {
            answered: sql`${userCategoryStats.answered} + 1`,
            correct: sql`${userCategoryStats.correct} + ${graded.isCorrect ? 1 : 0}`,
          },
        });

      // Library play-stats (Addendum A.8) — one row per question, incremented per player-answer
      // right here rather than aggregated from `answers` on every library page load (that query
      // would grow unbounded as the pool gets played). "posée Nx" / success rate / avg time all
      // share this same per-answer denominator, not a per-room-occurrence one.
      await db
        .insert(questionStats)
        .values({
          questionId: frozen.questionId,
          timesAsked: 1,
          timesCorrect: graded.isCorrect ? 1 : 0,
          totalMs: msTaken,
        })
        .onConflictDoUpdate({
          target: questionStats.questionId,
          set: {
            timesAsked: sql`${questionStats.timesAsked} + 1`,
            timesCorrect: sql`${questionStats.timesCorrect} + ${graded.isCorrect ? 1 : 0}`,
            totalMs: sql`${questionStats.totalMs} + ${msTaken}`,
            updatedAt: new Date(),
          },
        });
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
    // 1-indexed question number — the scoreboard lands every SCOREBOARD_INTERVAL-th question
    // (5, 10, 15…), not after each one; the podium at finishGame already covers the last
    // question regardless of where it falls in that cadence.
    const questionNumber = frozen.position + 1;
    if (!isLast && questionNumber % SCOREBOARD_INTERVAL === 0) {
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

  // Cross-game stats/XP/badges — a real, if 0-question, game (i.e. someone stuck around long
  // enough to be non-spectator) still counts toward gamesPlayed, so this runs even for `sorted`
  // entries with questionsSeen === 0 rather than being skipped.
  const highlights = await awardProgression(
    sorted.map((p, i) => ({
      userId: p.userId,
      displayName: p.displayName,
      score: p.score,
      correctCount: p.correctCount,
      totalQuestions: p.questionsSeen,
      bestStreakThisGame: p.bestStreak,
      isWinner: i === 0 && p.score > 0,
    })),
  );

  const displayNameByUserId = new Map(sorted.map((p) => [p.userId, p.displayName]));
  io.to(roomChannel(room.code)).emit("room:finished", {
    podium,
    fullScoreboard: buildScoreboard(room),
    highlights: highlights.map((h) => `${displayNameByUserId.get(h.userId) ?? "?"} — ${h.label}`),
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

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
  questions as questionsTable,
} from "@/server/db/schema";
import type { RoomStatus, RoomVisibility } from "@/server/db/schema";
import type { RoomConfigInput, AnswerPayloadInput } from "@/lib/schemas/socket";
import { gradeAnswer } from "@/server/game/grading";
import { computePoints, pointsForDifficulty, maxPointsFor } from "@/server/game/scoring";
import { COUNTRY_NAME_FR } from "@/lib/geo/country-names";
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
  QuestionHistoryEntry,
  AnswerLogEntry,
  CorrectionShowPayload,
} from "@/server/socket/events";

const COUNTDOWN_MS = 3_000;
const ANSWER_GRACE_MS = 300;
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
  /** True once the player commits (Valider / Enter / a map click). Until then this
   *  is a draft that keeps updating as they type, and it is what gets graded if the
   *  timer runs out — pressing a button should not be what makes an answer count. */
  locked: boolean;
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
  /** Set once the answer run ends. Nothing is scored before this exists. */
  correction: CorrectionState | null;
}

export interface CorrectionEntry {
  payload: AnswerPayloadInput;
  msTaken: number;
  /** Full marks if the grader accepted the answer, 0 if not — a pre-fill only. */
  suggested: number;
  /** Points the host has awarded, 0..the question's difficulty tier. */
  awarded: number;
}

export interface CorrectionState {
  /** Which question the room is currently ruling on. */
  index: number;
  /** position -> userId -> ruling */
  entries: Map<number, Map<string, CorrectionEntry>>;
  /** Resolver the loop parks on while waiting for the host to advance. */
  advance: (() => void) | null;
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
    correction: null,
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
  room.correction = { index: 0, entries: new Map(), advance: null };

  for (const frozen of room.frozenQuestions) {
    if (room.loopCancelled) return;

    room.currentIndex = frozen.position;
    // Countdown before the first question only. Between questions the run must not
    // stop — no reveal, no scoreboard, no "get ready": that pause is exactly what
    // this format removes.
    if (frozen.position === 0) {
      room.phase = "countdown";
      io.to(channel).emit("room:countdown", {
        startsInMs: COUNTDOWN_MS,
        total: room.frozenQuestions.length,
      });
      await sleep(COUNTDOWN_MS);
      if (room.loopCancelled) return;
    }

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

    // NOTHING is graded or scored here. The run goes straight from one question to
    // the next, and every ruling happens afterwards in the correction phase with
    // the room watching (KCulture's shape: answer everything, then correct
    // together). The grader still runs — its verdict is stored as `suggested` and
    // pre-fills the host's toggles, because 40 questions times six players is far
    // too many decisions to make from a blank slate.
    const gradable = toGradable(detail);
    const ledger = new Map<string, CorrectionEntry>();

    for (const player of room.players.values()) {
      if (player.isSpectator) continue;
      const pending = room.pendingAnswers.get(player.userId);
      const msTaken = pending ? pending.submittedAt - startedAt : frozen.timeLimitS * 1000;
      const graded = pending ? gradeAnswer(gradable, pending.payload) : { isCorrect: false };
      const accepted = graded.isCorrect;
      // The grader is all-or-nothing for every type but estimation ("nearest earns most
      // points" — grading.ts's distance-based suggestedFraction), so this defaults to the old
      // binary behaviour (1 when accepted) and only estimation ever supplies something between.
      // Partial marks are still a human judgement in the end, which is the point of the slider —
      // this only decides where it starts.
      const suggested = accepted
        ? Math.round(maxPointsFor(detail.difficulty) * (graded.suggestedFraction ?? 1))
        : 0;
      const payload = pending?.payload ?? { text: "" };

      ledger.set(player.userId, { payload, msTaken, suggested, awarded: suggested });
      player.questionsSeen += 1;

      // Persisted now, with isCorrect/pointsAwarded provisional: an answer typed
      // into a live game should survive a server restart, and the correction phase
      // updates these rows in place (there's a unique index on
      // room_id/position/user_id). The per-question aggregates deliberately wait
      // for the real verdict.
      await db
        .insert(answers)
        .values({
          roomId: room.id,
          questionId: frozen.questionId,
          userId: player.userId,
          position: frozen.position,
          payload,
          isCorrect: false,
          msTaken,
          pointsAwarded: 0,
        })
        .onConflictDoNothing();
    }
    room.correction!.entries.set(frozen.position, ledger);

    room.currentDetail = null;
    room.deadlineMs = null;
  }

  await runCorrectionPhase(io, room);
  await finishGame(io, room);
}

async function waitForAnswersOrDeadline(room: RoomState, deadlineMs: number): Promise<void> {
  const totalMs = deadlineMs - Date.now() + ANSWER_GRACE_MS;
  const pollMs = 150;
  let elapsed = 0;
  while (elapsed < totalMs) {
    if (room.loopCancelled) return;
    const activePlayers = [...room.players.values()].filter((p) => !p.isSpectator);
    // Only a COMMITTED answer counts toward ending the question early. Keying off
    // mere presence would end it on the first keystroke, now that typing alone
    // registers a draft.
    const allCommitted =
      activePlayers.length > 0 &&
      activePlayers.every((p) => room.pendingAnswers.get(p.userId)?.locked === true);
    if (allCommitted) return;
    const step = Math.min(pollMs, totalMs - elapsed);
    await sleep(step);
    elapsed += step;
  }
}

/**
 * The correction phase. One question at a time, the room sees the accepted answer
 * and what everyone typed, the host rules on each, and only then are points
 * awarded. Modelled on KCulture: the run is uninterrupted, the judging is
 * collective, and a human always has the last word over the grader.
 *
 * Scoring stays exactly the same formula as before — speed and streak included —
 * it just runs here instead of at lock time. `msTaken` was recorded during the
 * run, so answering fast still pays.
 */
async function runCorrectionPhase(io: GameIo, room: RoomState): Promise<void> {
  const channel = roomChannel(room.code);
  const correction = room.correction;
  if (!correction) return;

  // Streaks have to be rebuilt in question order, so they are reset once here
  // rather than carried over from the run (where nothing was graded).
  for (const player of room.players.values()) {
    player.streak = 0;
    player.bestStreak = 0;
    player.correctCount = 0;
    player.score = 0;
  }

  for (const frozen of room.frozenQuestions) {
    if (room.loopCancelled) return;
    const ledger = correction.entries.get(frozen.position);
    if (!ledger) continue;

    const detail = await getFullQuestionDetail(frozen.questionId);
    if (!detail) continue;

    correction.index = frozen.position;
    room.phase = "correction";
    room.currentDetail = detail;
    io.to(channel).emit("correction:show", buildCorrectionPayload(room, frozen, detail, ledger));

    // Park until the host advances. No deadline: the room is reading answers out
    // loud and arguing about them, which takes as long as it takes.
    await new Promise<void>((resolve) => {
      correction.advance = resolve;
    });
    correction.advance = null;
    if (room.loopCancelled) return;

    // Deliberately no scoreboard:update here. Emitting one would flip every client
    // out of the correction phase, which is the interruption this whole redesign
    // removes; scores land on the podium.
    await applyCorrectionForQuestion(room, frozen, detail, ledger);
  }

  room.currentDetail = null;
}

export function buildCorrectionPayload(
  room: RoomState,
  frozen: FrozenQuestion,
  detail: FullQuestionDetail,
  ledger: Map<string, CorrectionEntry>,
): CorrectionShowPayload {
  // sort only — id -> label, so a submitted `order` (item ids) resolves to something the room
  // can actually read without also shipping the whole item list down this payload.
  const sortLabelById = new Map(detail.sortItems.map((i) => [i.id, i.label]));

  const answersView = [...ledger.entries()].map(([userId, entry]) => {
    const player = room.players.get(userId);
    const payload = entry.payload as {
      text?: string;
      iso3?: string;
      choiceIds?: string[];
      order?: string[];
      value?: number;
    };
    return {
      userId,
      displayName: player?.displayName ?? userId,
      text: payload.text ?? "",
      iso3: payload.iso3,
      orderedLabels: payload.order?.map((id) => sortLabelById.get(id) ?? "?"),
      value: payload.value,
      suggested: entry.suggested,
      awarded: entry.awarded,
      msTaken: entry.msTaken,
    };
  });
  return {
    position: frozen.position,
    total: room.frozenQuestions.length,
    prompt: detail.prompt,
    correct: describeCorrectAnswer(detail),
    explanation: detail.explanation,
    difficulty: detail.difficulty,
    maxPoints: maxPointsFor(detail.difficulty),
    answers: answersView,
  };
}

/** Turns one question's rulings into points, streaks and the durable aggregates. */
async function applyCorrectionForQuestion(
  room: RoomState,
  frozen: FrozenQuestion,
  detail: FullQuestionDetail,
  ledger: Map<string, CorrectionEntry>,
): Promise<void> {
  const maxPoints = maxPointsFor(detail.difficulty);

  // Scores and streaks are computed for everyone first, then written. A player's
  // streak depends only on their own previous answer, never on another player's, so
  // the writes are independent — and doing them one player at a time was four
  // sequential round trips each, twenty-four for a room of six, all of it between
  // the host's click and the next question appearing.
  const writes: Array<Promise<unknown>> = [];

  for (const [userId, entry] of ledger) {
    const player = room.players.get(userId);
    if (!player) continue;

    // Any credit at all counts as "got it" for streaks, the correct-count and the
    // per-category/per-question stats. A half-right answer earning 1 of 3 shouldn't
    // break a streak the way a blank would — the host gave it something.
    const scored = entry.awarded > 0;
    player.streak = scored ? player.streak + 1 : 0;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    if (scored) player.correctCount += 1;

    const { points } = computePoints({
      isCorrect: scored,
      msTaken: entry.msTaken,
      timeLimitMs: frozen.timeLimitS * 1000,
      // The awarded fraction scales the tier's base points, so the host thinks in
      // "2 out of 5" while the score keeps the calibration the speed and streak
      // multipliers were tuned against.
      pointsBase: Math.round(
        pointsForDifficulty(detail.difficulty) * (entry.awarded / Math.max(1, maxPoints)),
      ),
      streak: player.streak,
      scoringMode: room.config.scoringMode,
    });
    player.score += points;

    writes.push(
      db
        .update(answers)
        .set({ isCorrect: scored, pointsAwarded: points })
      .where(
        and(
          eq(answers.roomId, room.id),
          eq(answers.position, frozen.position),
            eq(answers.userId, userId),
          ),
        ),
    );
    writes.push(
      db
        .update(roomPlayers)
        .set({ score: player.score, streak: player.streak, correctCount: player.correctCount })
        .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.userId, userId))),
    );
    writes.push(
      db
        .insert(userCategoryStats)
        .values({
          userId,
          categoryId: detail.categoryId,
          answered: 1,
          correct: scored ? 1 : 0,
        })
        .onConflictDoUpdate({
          target: [userCategoryStats.userId, userCategoryStats.categoryId],
          set: {
            answered: sql`${userCategoryStats.answered} + 1`,
            correct: sql`${userCategoryStats.correct} + ${scored ? 1 : 0}`,
          },
        }),
    );
    writes.push(
      db
        .insert(questionStats)
        .values({
          questionId: frozen.questionId,
          timesAsked: 1,
          timesCorrect: scored ? 1 : 0,
          totalMs: entry.msTaken,
        })
        .onConflictDoUpdate({
          target: questionStats.questionId,
          set: {
            timesAsked: sql`${questionStats.timesAsked} + 1`,
            timesCorrect: sql`${questionStats.timesCorrect} + ${scored ? 1 : 0}`,
            totalMs: sql`${questionStats.totalMs} + ${entry.msTaken}`,
            updatedAt: new Date(),
          },
        }),
    );
  }

  await Promise.all(writes);
}

/**
 * Host awards points to one answer. Returns the clamped value actually stored, or
 * null when the room isn't correcting or the target doesn't exist.
 *
 * The clamp is here rather than only in the zod schema because the real ceiling is
 * the question's own difficulty tier: a client could otherwise send 5 on a tier-1
 * question and quietly award five times what it's worth.
 */
export function setCorrectionAward(
  room: RoomState,
  position: number,
  userId: string,
  awarded: number,
): number | null {
  if (room.phase !== "correction" || !room.correction) return null;
  // Only the question currently on screen can be ruled on. The ceiling comes from
  // that question's own difficulty, and `currentDetail` is the only thing that
  // reliably holds it — accepting a stale position would clamp against the wrong
  // tier and could award five points on a one-point question.
  if (room.correction.index !== position) return null;
  const difficulty = room.currentDetail?.difficulty;
  if (difficulty === undefined) return null;
  const entry = room.correction.entries.get(position)?.get(userId);
  if (!entry) return null;
  const clamped = Math.max(0, Math.min(maxPointsFor(difficulty), Math.round(awarded)));
  entry.awarded = clamped;
  return clamped;
}


/**
 * Host commits the current question and moves on.
 *
 * `position` is checked against the one on screen. Applying a question's verdicts
 * means a few database round trips per player, and during those the advance handle
 * is null — so a second click is already harmless. A third, landing after the next
 * question has armed its own handle, would otherwise skip that question outright.
 * Which is exactly what someone does when a button gives no feedback: they click it
 * four times.
 */
export function advanceCorrection(room: RoomState, position: number): boolean {
  if (room.phase !== "correction" || !room.correction?.advance) return false;
  if (room.correction.index !== position) return false;
  room.correction.advance();
  return true;
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
    case "geo": {
      // Never the iso3. The reveal used to print "JPN" for « Quelle est la capitale
      // du Japon ? » and "LKA" for Sri Lanka — a country code is not an answer to
      // anything a player was asked.
      //
      // find_capital / name_country / name_from_shape carry their accepted text in
      // openAnswers, and ALL of it is shown: a Bolivia reveal reading "Sucre ou
      // La Paz" is the whole point of accepting both. The two click-to-answer modes
      // (locate_country, capital_of) store no text, so the country's French name
      // stands in — from the generated lookup, no DB round-trip.
      const shown = detail.primaryAnswers.length > 0 ? detail.primaryAnswers : detail.openAnswers;
      if (shown.length > 0) return shown.join(" ou ");
      const iso3 = detail.geo?.targetIso3 ?? "";
      return COUNTRY_NAME_FR[iso3] ?? iso3;
    }
    case "sort":
      // detail.sortItems is already position-asc, i.e. already the correct order.
      return detail.sortItems.map((item, i) => `${i + 1}. ${item.label}`).join(" → ");
    case "estimation": {
      if (!detail.estimation) return "";
      const { correctValue, toleranceType, toleranceValue, unit } = detail.estimation;
      const value = `${correctValue}${unit ? ` ${unit}` : ""}`;
      const tolerance =
        toleranceType === "percentage" ? `± ${toleranceValue} %` : `± ${toleranceValue}`;
      return `${value} (${tolerance})`;
    }
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

  // The final screen's "who answered what" breakdown — built here from the durable `answers`/
  // `room_questions` rows rather than accumulated during the loop. Still the one persistent
  // per-question record: correction:show is transient (gone once the host advances past that
  // question) and the run itself shows nothing between questions at all. `room.id` is still
  // valid at this point: a `finished` room's DB rows are never touched by the empty-room
  // deletion sweep (Addendum B.4), only a still-`lobby`/`running` room's are.
  const questionHistory: QuestionHistoryEntry[] = await db
    .select({ position: roomQuestions.position, prompt: questionsTable.prompt })
    .from(roomQuestions)
    .innerJoin(questionsTable, eq(roomQuestions.questionId, questionsTable.id))
    .where(eq(roomQuestions.roomId, room.id))
    .orderBy(roomQuestions.position);

  const answerLog: AnswerLogEntry[] = await db
    .select({
      position: answers.position,
      userId: answers.userId,
      isCorrect: answers.isCorrect,
      pointsAwarded: answers.pointsAwarded,
      msTaken: answers.msTaken,
    })
    .from(answers)
    .where(eq(answers.roomId, room.id));

  io.to(roomChannel(room.code)).emit("room:finished", {
    podium,
    fullScoreboard: buildScoreboard(room),
    highlights: highlights.map((h) => `${displayNameByUserId.get(h.userId) ?? "?"} — ${h.label}`),
    questionHistory,
    answerLog,
  });
}

/**
 * Records or updates a player's answer for the question in flight.
 *
 * Drafts overwrite freely: what a player has typed when time runs out is their
 * answer, so nothing is lost by not pressing a button. `submittedAt` moves with
 * each edit on purpose — speed should measure when someone settled on an answer,
 * not when they typed their first letter and then spent nine seconds hesitating.
 *
 * Committing (`final`) locks the row: further keystrokes are ignored, which is
 * what makes an early advance safe.
 */
export function recordAnswer(
  room: RoomState,
  userId: string,
  payload: AnswerPayloadInput,
  final: boolean,
): boolean {
  if (room.phase !== "question") return false;
  const existing = room.pendingAnswers.get(userId);
  if (existing?.locked) return false;
  room.pendingAnswers.set(userId, { payload, submittedAt: Date.now(), locked: final });
  return true;
}

export function cancelLoop(room: RoomState): void {
  room.loopCancelled = true;
}

import type { Server, Socket } from "socket.io";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { rooms as roomsTable, roomPlayers, categories } from "@/server/db/schema";
import {
  roomCreateSchema,
  roomJoinSchema,
  roomLeaveSchema,
  roomKickSchema,
  roomUpdateConfigSchema,
  roomStartSchema,
  hostSkipSchema,
  hostNextSchema,
  playerReadySchema,
  answerSubmitSchema,
  chatSendSchema,
  reactionSendSchema,
  timeSyncSchema,
} from "@/lib/schemas/socket";
import { generateUniqueRoomCode } from "@/server/game/room-code";
import {
  allRooms,
  createRoomState,
  deleteRoomState,
  getRoom,
  migrateHostIfNeeded,
  recordAnswer,
  scheduleEmptyRoomCheck,
  startGame,
  toLobbySummary,
  toRoomStateView,
  cancelLoop,
  type RoomState,
} from "@/server/game/engine";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/server/socket/events";

type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const LOBBY_CHANNEL = "lobby";
const chatLastSentAt = new Map<string, number>();

function roomChannel(code: string): string {
  return `room:${code}`;
}

async function categoryNamesFor(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ name: categories.name })
    .from(categories)
    .where(inArray(categories.id, ids));
  return rows.map((r) => r.name);
}

async function broadcastLobbyRooms(io: GameServer): Promise<void> {
  const publicRooms = allRooms().filter((r) => r.visibility === "public" && r.status === "lobby");
  const summaries = await Promise.all(
    publicRooms.map(async (r) => toLobbySummary(r, await categoryNamesFor(r.config.categoryIds))),
  );
  io.to(LOBBY_CHANNEL).emit("lobby:rooms", summaries);
}

async function broadcastRoomUpdated(io: GameServer, room: RoomState): Promise<void> {
  if (room.visibility !== "public") return;
  io.to(LOBBY_CHANNEL).emit(
    "lobby:room_updated",
    toLobbySummary(room, await categoryNamesFor(room.config.categoryIds)),
  );
}

function emitError(socket: GameSocket, code: string, messageFr: string): void {
  socket.emit("error", { code, messageFr });
}

function addOrReconnectPlayer(room: RoomState, socket: GameSocket): void {
  const user = socket.data.user;
  const existing = room.players.get(user.id);
  if (existing) {
    existing.socketIds.add(socket.id);
    return;
  }
  const isSpectator = room.status === "running";
  room.players.set(user.id, {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarSeed: user.avatarSeed,
    socketIds: new Set([socket.id]),
    ready: false,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    questionsSeen: 0,
    joinedAt: Date.now(),
    isSpectator,
  });
}

export function registerSocketHandlers(io: GameServer, socket: GameSocket): void {
  const user = socket.data.user;
  socket.join(LOBBY_CHANNEL);

  socket.on("lobby:subscribe", () => {
    void broadcastLobbyRooms(io);
  });

  socket.on("room:create", (payload, ack) => {
    void (async () => {
      const parsed = roomCreateSchema.safeParse(payload);
      if (!parsed.success) return ack({ error: "Configuration de salon invalide." });
      const input = parsed.data;

      const code = await generateUniqueRoomCode(async (c) => {
        if (getRoom(c)) return true;
        const rows = await db.select().from(roomsTable).where(eq(roomsTable.code, c)).limit(1);
        return rows.length > 0;
      });

      const [insertedRoom] = await db
        .insert(roomsTable)
        .values({
          code,
          name: input.name,
          hostId: user.id,
          quizId: input.quizId ?? null,
          source: input.source,
          config: input.config,
          status: "lobby",
          visibility: input.visibility,
        })
        .returning({ id: roomsTable.id });

      const room = createRoomState({
        id: insertedRoom!.id,
        code,
        name: input.name,
        hostId: user.id,
        quizId: input.quizId ?? null,
        source: input.source,
        visibility: input.visibility,
        config: input.config,
      });
      addOrReconnectPlayer(room, socket);
      await db
        .insert(roomPlayers)
        .values({ roomId: room.id, userId: user.id })
        .onConflictDoUpdate({
          target: [roomPlayers.roomId, roomPlayers.userId],
          set: { isConnected: true, leftAt: null },
        });

      socket.join(roomChannel(code));
      ack({ code });
      socket.emit("room:state", toRoomStateView(room));
      if (input.visibility === "public") {
        io.to(LOBBY_CHANNEL).emit(
          "lobby:room_added",
          toLobbySummary(room, await categoryNamesFor(input.config.categoryIds)),
        );
      }
    })();
  });

  socket.on("room:join", (payload, ack) => {
    void (async () => {
      const parsed = roomJoinSchema.safeParse(payload);
      if (!parsed.success) return ack({ error: "Code de salon invalide." });
      const { code } = parsed.data;

      const room = getRoom(code);
      if (!room) return ack({ error: "Ce salon n'existe pas." });
      if (room.status === "finished" || room.status === "abandoned") {
        return ack({ error: "Cette partie est terminée." });
      }
      if (room.status === "running" && !room.config.allowLateJoin) {
        return ack({ error: "La partie a déjà commencé." });
      }
      if (!room.players.has(user.id) && room.players.size >= room.config.maxPlayers) {
        return ack({ error: "Ce salon est complet." });
      }

      if (room.emptyTimer) {
        clearTimeout(room.emptyTimer);
        room.emptyTimer = null;
      }
      addOrReconnectPlayer(room, socket);
      await db
        .insert(roomPlayers)
        .values({ roomId: room.id, userId: user.id })
        .onConflictDoUpdate({
          target: [roomPlayers.roomId, roomPlayers.userId],
          set: { isConnected: true, leftAt: null },
        });

      socket.join(roomChannel(code));
      ack({ ok: true });
      socket.emit("room:state", toRoomStateView(room));
      // A concurrent room:leave (e.g. a fast reconnect race) can remove this player between the
      // await above and here — never assume a Map lookup still holds after an await.
      const player = room.players.get(user.id);
      if (!player) return;
      io.to(roomChannel(code)).emit("room:player_joined", {
        userId: player.userId,
        username: player.username,
        displayName: player.displayName,
        avatarSeed: player.avatarSeed,
        isHost: player.userId === room.hostId,
        ready: player.ready,
        connected: true,
        score: player.score,
        streak: player.streak,
      });
      await broadcastRoomUpdated(io, room);
    })();
  });

  socket.on("room:leave", (payload) => {
    void handleLeave(io, socket, payload.code, false);
  });

  socket.on("room:kick", (payload) => {
    void (async () => {
      const parsed = roomKickSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = getRoom(parsed.data.code);
      if (!room || room.hostId !== user.id)
        return emitError(socket, "forbidden", "Action réservée à l'hôte.");
      const target = room.players.get(parsed.data.userId);
      if (!target) return;
      for (const sid of target.socketIds) {
        io.sockets.sockets.get(sid)?.leave(roomChannel(room.code));
      }
      room.players.delete(parsed.data.userId);
      io.to(roomChannel(room.code)).emit("room:player_kicked", { userId: parsed.data.userId });
      await broadcastRoomUpdated(io, room);
    })();
  });

  socket.on("room:update_config", (payload) => {
    void (async () => {
      const parsed = roomUpdateConfigSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = getRoom(parsed.data.code);
      if (!room || room.hostId !== user.id)
        return emitError(socket, "forbidden", "Action réservée à l'hôte.");
      if (room.phase !== "lobby")
        return emitError(socket, "invalid_phase", "La partie a déjà commencé.");
      room.config = parsed.data.config;
      await db
        .update(roomsTable)
        .set({ config: room.config })
        .where(eq(roomsTable.code, room.code));
      io.to(roomChannel(room.code)).emit("room:state", toRoomStateView(room));
      await broadcastRoomUpdated(io, room);
    })();
  });

  socket.on("player:ready", (payload) => {
    const parsed = playerReadySchema.safeParse(payload);
    if (!parsed.success) return;
    const room = getRoom(parsed.data.code);
    const player = room?.players.get(user.id);
    if (!room || !player) return;
    player.ready = parsed.data.ready;
    io.to(roomChannel(room.code)).emit("room:state", toRoomStateView(room));
  });

  socket.on("room:start", (payload) => {
    void (async () => {
      const parsed = roomStartSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = getRoom(parsed.data.code);
      if (!room || room.hostId !== user.id)
        return emitError(socket, "forbidden", "Action réservée à l'hôte.");
      if (room.players.size < 1)
        return emitError(socket, "not_enough_players", "Au moins un joueur requis.");
      if (room.phase !== "lobby") return;
      await startGame(io, room);
      await broadcastLobbyRooms(io); // running rooms drop off the public list
    })();
  });

  socket.on("answer:submit", (payload) => {
    const parsed = answerSubmitSchema.safeParse(payload);
    if (!parsed.success) return;
    const room = getRoom(parsed.data.code);
    if (!room || room.currentIndex !== parsed.data.position) return;
    const accepted = recordAnswer(room, user.id, parsed.data.payload);
    if (accepted) {
      io.to(roomChannel(room.code)).emit("question:answered", { userId: user.id });
    }
  });

  socket.on("host:skip", (payload) => {
    const parsed = hostSkipSchema.safeParse(payload);
    if (!parsed.success) return;
    const room = getRoom(parsed.data.code);
    if (!room || room.hostId !== user.id) return;
    if (room.phase !== "question" || !room.deadlineMs) return;
    room.deadlineMs = Date.now(); // the loop's poll picks this up within one tick
  });

  socket.on("host:next", (payload) => {
    const parsed = hostNextSchema.safeParse(payload);
    if (!parsed.success) return;
    const room = getRoom(parsed.data.code);
    if (!room || room.hostId !== user.id || !room.config.manualAdvance) return;
    // Manual-advance is a config opt-in the host can use to skip the automatic reveal/scoreboard
    // hold; the loop's sleep() calls are the only synchronisation point, so this is best-effort
    // (advances on the next natural tick) rather than an instant cut — acceptable for the cosmetic
    // pacing this controls.
  });

  socket.on("chat:send", (payload) => {
    const parsed = chatSendSchema.safeParse(payload);
    if (!parsed.success) return;
    const room = getRoom(parsed.data.code);
    if (!room) return;
    if (room.phase !== "lobby" && room.phase !== "reveal" && room.phase !== "scoreboard") return;
    const last = chatLastSentAt.get(user.id) ?? 0;
    if (Date.now() - last < 1000) return;
    chatLastSentAt.set(user.id, Date.now());
    io.to(roomChannel(room.code)).emit("chat:message", {
      userId: user.id,
      displayName: user.displayName,
      text: parsed.data.text,
      sentAt: Date.now(),
    });
  });

  socket.on("reaction:send", (payload) => {
    const parsed = reactionSendSchema.safeParse(payload);
    if (!parsed.success) return;
    const room = getRoom(parsed.data.code);
    if (!room) return;
    io.to(roomChannel(room.code)).emit("reaction:burst", {
      userId: user.id,
      emoji: parsed.data.emoji,
    });
  });

  socket.on("time:sync", (payload, ack) => {
    const parsed = timeSyncSchema.safeParse(payload);
    if (!parsed.success) return;
    ack({ serverTime: Date.now() });
  });

  socket.on("disconnect", () => {
    void handleDisconnect(io, socket);
  });
}

async function handleLeave(
  io: GameServer,
  socket: GameSocket,
  code: string,
  isDisconnect: boolean,
): Promise<void> {
  const parsed = roomLeaveSchema.safeParse({ code });
  if (!parsed.success) return;
  const room = getRoom(code);
  const user = socket.data.user;
  const player = room?.players.get(user.id);
  if (!room || !player) return;

  player.socketIds.delete(socket.id);
  socket.leave(roomChannel(code));

  if (player.socketIds.size === 0) {
    if (room.phase === "lobby") {
      room.players.delete(user.id);
    }
    await db
      .update(roomPlayers)
      .set({ isConnected: false, leftAt: new Date() })
      .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.userId, user.id)));

    if (!isDisconnect) {
      io.to(roomChannel(code)).emit("room:player_left", { userId: user.id });
    }

    const migrated = migrateHostIfNeeded(room);
    if (migrated) {
      io.to(roomChannel(code)).emit("room:host_changed", { hostId: room.hostId });
    }

    scheduleEmptyRoomCheck(room, (abandonedCode) => {
      const stale = getRoom(abandonedCode);
      if (!stale) return;
      cancelLoop(stale);
      deleteRoomState(abandonedCode);
      void db
        .update(roomsTable)
        .set({ status: "abandoned", endedAt: new Date() })
        .where(eq(roomsTable.code, abandonedCode));
      void broadcastLobbyRoomsSafe(io);
    });

    await broadcastRoomUpdated(io, room);
  }
}

async function broadcastLobbyRoomsSafe(io: GameServer): Promise<void> {
  await broadcastLobbyRooms(io);
}

async function handleDisconnect(io: GameServer, socket: GameSocket): Promise<void> {
  const user = socket.data.user;
  for (const room of allRooms()) {
    if (room.players.has(user.id) && room.players.get(user.id)!.socketIds.has(socket.id)) {
      await handleLeave(io, socket, room.code, true);
    }
  }
}

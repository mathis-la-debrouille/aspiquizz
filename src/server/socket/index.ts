import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { authenticateHandshake } from "@/server/socket/auth";
import { registerSocketHandlers } from "@/server/socket/handlers";
import { recoverInterruptedGames, sweepEmptyRooms, SWEEP_INTERVAL_MS } from "@/server/game/engine";
import { db } from "@/server/db";
import { rooms as roomsTable } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/server/socket/events";

export async function attachSocketServer(httpServer: HttpServer): Promise<Server> {
  // A 'lobby' room from a previous process holds nothing, so it goes. A 'running' one holds an
  // evening's worth of answers, so it gets picked up instead — but only once `io` exists, since
  // the recovered game needs somewhere to broadcast.
  await db
    .update(roomsTable)
    .set({ status: "abandoned", endedAt: new Date() })
    .where(eq(roomsTable.status, "lobby"));

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, { path: "/ws" });

  io.use((socket, next) => {
    void (async () => {
      const user = await authenticateHandshake(socket.handshake.headers.cookie);
      if (!user) {
        next(new Error("unauthenticated"));
        return;
      }
      socket.data.user = user;
      next();
    })();
  });

  io.on("connection", (socket) => {
    registerSocketHandlers(io, socket);
  });

  // After `io` exists and handlers are registered, so a recovered game can broadcast and the
  // players reconnecting into it are handled normally. Fire-and-forget: a game that fails to
  // come back must not stop the server from starting.
  void recoverInterruptedGames(io);

  // Addendum B.4's "sweeper on boot and every 60s" — a safety net for the (in normal operation,
  // never-hit) case of a room's own per-room deletion timer not firing. Boot-time orphans from a
  // previous process are handled above (abandoned if a lobby, recovered if a running game), not
  // by this sweep, which reads an in-memory Map that is empty at this exact point.
  sweepEmptyRooms(io);
  setInterval(() => sweepEmptyRooms(io), SWEEP_INTERVAL_MS);

  return io;
}

import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { authenticateHandshake } from "@/server/socket/auth";
import { registerSocketHandlers } from "@/server/socket/handlers";
import { abandonStaleRooms, sweepEmptyRooms, SWEEP_INTERVAL_MS } from "@/server/game/engine";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/server/socket/events";

export async function attachSocketServer(httpServer: HttpServer): Promise<Server> {
  // Rooms left 'lobby'/'running' from a previous process (crash/redeploy) are stale — brief §11.3.
  await abandonStaleRooms();

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

  // Addendum B.4's "sweeper on boot and every 60s" — a safety net for the (in normal operation,
  // never-hit) case of a room's own per-room deletion timer not firing. Boot-time orphans from a
  // previous process are abandonStaleRooms()'s job above, not this: the in-memory `rooms` Map
  // this sweep reads is always empty at this exact point in a fresh process.
  sweepEmptyRooms(io);
  setInterval(() => sweepEmptyRooms(io), SWEEP_INTERVAL_MS);

  return io;
}

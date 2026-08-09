import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { authenticateHandshake } from "@/server/socket/auth";
import { registerSocketHandlers } from "@/server/socket/handlers";
import { abandonStaleRunningRooms } from "@/server/game/engine";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/server/socket/events";

export async function attachSocketServer(httpServer: HttpServer): Promise<Server> {
  // Rooms left 'running' from a previous process (crash/redeploy) are stale — brief §11.3.
  await abandonStaleRunningRooms();

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

  return io;
}

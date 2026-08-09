"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/server/socket/events";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let sharedSocket: GameSocket | null = null;

/**
 * One Socket.IO connection per browser tab, shared across every component
 * that needs it — the cookie is sent automatically (same-origin), so no
 * client-side auth wiring is needed beyond just connecting.
 */
function getSharedSocket(): GameSocket {
  sharedSocket ??= io({ path: "/ws", autoConnect: true });
  return sharedSocket;
}

export function useSocket(): { socket: GameSocket; connected: boolean } {
  const socketRef = useRef<GameSocket>(getSharedSocket());
  const [connected, setConnected] = useState(socketRef.current.connected);

  useEffect(() => {
    const socket = socketRef.current;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) {
      // The connection can complete between this component's first render (which captured
      // `connected` via useState's initializer) and this effect subscribing the listeners
      // above — in which case the 'connect' event already fired into the void and never
      // arrives again. Re-check synchronously rather than only reacting to future events.
      setConnected(true);
    } else {
      socket.connect();
    }
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, connected };
}

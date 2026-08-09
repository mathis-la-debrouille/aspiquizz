"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSocket } from "@/lib/socket/client";
import type { LobbyRoomSummary } from "@/server/socket/events";

export function RoomList() {
  const { socket, connected } = useSocket();
  const [rooms, setRooms] = useState<LobbyRoomSummary[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!connected) return;
    socket.emit("lobby:subscribe");

    const onRooms = (list: LobbyRoomSummary[]) => setRooms(list);
    const onAdded = (room: LobbyRoomSummary) =>
      setRooms((prev) => [...prev.filter((r) => r.code !== room.code), room]);
    const onRemoved = (code: string) => setRooms((prev) => prev.filter((r) => r.code !== code));
    const onUpdated = (room: LobbyRoomSummary) =>
      setRooms((prev) => prev.map((r) => (r.code === room.code ? room : r)));

    socket.on("lobby:rooms", onRooms);
    socket.on("lobby:room_added", onAdded);
    socket.on("lobby:room_removed", onRemoved);
    socket.on("lobby:room_updated", onUpdated);

    return () => {
      socket.off("lobby:rooms", onRooms);
      socket.off("lobby:room_added", onAdded);
      socket.off("lobby:room_removed", onRemoved);
      socket.off("lobby:room_updated", onUpdated);
    };
  }, [socket, connected]);

  function join(code: string) {
    socket.emit("room:join", { code }, (result) => {
      if ("ok" in result) router.push(`/salon/${code}`);
    });
  }

  if (!connected) {
    return <p className="text-14 text-ink-faint">Connexion en cours…</p>;
  }

  if (rooms.length === 0) {
    return (
      <EmptyState
        title="Aucun salon ouvert pour l'instant."
        description="Créez-en un pour inviter le reste du groupe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rooms.map((room) => (
        <Card key={room.code} className="flex items-center gap-4 p-4" elevation="raised">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-20 text-ink-high">{room.name}</h3>
              {room.visibility === "private" && (
                <Lock aria-label="Privé" strokeWidth={1.5} className="h-3.5 w-3.5 text-ink-faint" />
              )}
            </div>
            <p className="text-12 text-ink-faint">Hôte : {room.hostDisplayName}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {room.categoryNames.map((name) => (
                <Badge key={name} tone="neutral">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 text-14 text-ink-mid">
            <Users strokeWidth={1.5} className="h-4 w-4" />
            {room.playerCount}/{room.maxPlayers}
          </div>
          <Button
            size="sm"
            onClick={() => join(room.code)}
            disabled={room.playerCount >= room.maxPlayers}
          >
            Rejoindre
          </Button>
        </Card>
      ))}
    </div>
  );
}

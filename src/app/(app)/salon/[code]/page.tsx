import type { Metadata } from "next";
import { getSession } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { RoomClient } from "@/components/room/RoomClient";

export const metadata: Metadata = { title: "Salon — ASPI Quiz" };

export default async function SalonPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSession();
  if (!session) redirect("/connexion");

  return (
    <div className="mx-auto max-w-3xl">
      <RoomClient code={code.toUpperCase()} currentUserId={session.user.id} />
    </div>
  );
}

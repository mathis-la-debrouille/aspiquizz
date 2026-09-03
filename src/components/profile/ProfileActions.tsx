"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Shuffle, Plug } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { rerollAvatarAction } from "@/server/progression/actions";

export function ProfileActions({ displayName, bio }: { displayName: string; bio: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [rerolling, setRerolling] = useState(false);

  async function handleReroll() {
    setRerolling(true);
    await rerollAvatarAction();
    setRerolling(false);
  }

  return (
    <div className="flex shrink-0 items-start gap-2">
      <Button
        variant="ghost"
        size="sm"
        loading={rerolling}
        leadingIcon={<Shuffle className="h-4 w-4" strokeWidth={1.5} />}
        onClick={handleReroll}
      >
        Nouvel avatar
      </Button>
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Pencil className="h-4 w-4" strokeWidth={1.5} />}
        onClick={() => setEditOpen(true)}
      >
        Modifier
      </Button>
      <Link href="/profil/parametres/mcp">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Plug className="h-4 w-4" strokeWidth={1.5} />}
        >
          Accès MCP
        </Button>
      </Link>
      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialDisplayName={displayName}
        initialBio={bio}
      />
    </div>
  );
}

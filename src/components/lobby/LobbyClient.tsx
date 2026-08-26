"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RoomList } from "@/components/lobby/RoomList";
import { CreateRoomModal } from "@/components/lobby/CreateRoomModal";
import type { CategoryOption } from "@/components/authoring/types";
import type { QuizListItem } from "@/server/questions/queries";

export function LobbyClient({
  categories,
  questionCounts,
  quizzes,
}: {
  categories: CategoryOption[];
  /** Published questions per category id, for the selectability threshold. */
  questionCounts: Record<string, number>;
  quizzes: QuizListItem[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-26 text-ink-high">Salons ouverts</h2>
        <Button
          leadingIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />}
          onClick={() => setModalOpen(true)}
        >
          Créer un salon
        </Button>
      </div>
      <RoomList />
      <CreateRoomModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        categories={categories}
        questionCounts={questionCounts}
        quizzes={quizzes}
      />
    </div>
  );
}

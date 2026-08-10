"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioCard } from "@/components/ui/RadioCard";
import { RhythmSection, type RhythmValue } from "@/components/room/RhythmSection";
import { useSocket } from "@/lib/socket/client";
import type { CategoryOption } from "@/components/authoring/types";
import type { QuizListItem } from "@/server/questions/queries";

export function CreateRoomModal({
  open,
  onClose,
  categories,
  quizzes,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  quizzes: QuizListItem[];
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const [name, setName] = useState("");
  const [source, setSource] = useState<"quiz" | "random">("random");
  const [quizId, setQuizId] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [rhythm, setRhythm] = useState<RhythmValue>({ timeLimitS: 20 });
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [scoringMode, setScoringMode] = useState<"speed" | "flat">("speed");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(id: string) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handleCreate() {
    setPending(true);
    setError(null);
    socket.emit(
      "room:create",
      {
        name: name || "Salon sans nom",
        source,
        quizId: source === "quiz" ? quizId : undefined,
        visibility,
        config: {
          questionCount,
          timeLimitS: rhythm.timeLimitS,
          timeLimitByType: rhythm.timeLimitByType,
          categoryIds: source === "random" ? categoryIds : [],
          difficultyMin: 1,
          difficultyMax: 5,
          allowLateJoin: true,
          maxPlayers,
          revealDurationS: 6,
          scoringMode,
          manualAdvance: false,
        },
      },
      (result) => {
        setPending(false);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.push(`/salon/${result.code}`);
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Créer un salon"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={pending}
            disabled={!name || (source === "quiz" && !quizId)}
            onClick={handleCreate}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nom du salon" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <RadioCard
            name="source"
            value="random"
            label="Questions aléatoires"
            checked={source === "random"}
            onChange={() => setSource("random")}
          />
          <RadioCard
            name="source"
            value="quiz"
            label="Quiz existant"
            checked={source === "quiz"}
            onChange={() => setSource("quiz")}
          />
        </div>

        {source === "quiz" ? (
          <Select label="Quiz" value={quizId} onChange={(e) => setQuizId(e.target.value)}>
            <option value="">Choisir…</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title} — @{q.authorUsername}
              </option>
            ))}
          </Select>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-14 font-medium text-ink-mid">
              Catégories (toutes si aucune choisie)
            </span>
            <div className="flex flex-wrap gap-3">
              {categories.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={categoryIds.includes(c.id)}
                  onChange={() => toggleCategory(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nombre de questions"
            type="number"
            min={1}
            max={50}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          />
          <Input
            label="Joueurs max"
            type="number"
            min={2}
            max={50}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
        </div>

        <RhythmSection value={rhythm} onChange={setRhythm} />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Visibilité"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "public" | "private")}
          >
            <option value="public">Public</option>
            <option value="private">Privé</option>
          </Select>
          <Select
            label="Notation"
            value={scoringMode}
            onChange={(e) => setScoringMode(e.target.value as "speed" | "flat")}
          >
            <option value="speed">Rapidité</option>
            <option value="flat">Fixe</option>
          </Select>
        </div>

        {error && <p className="text-14 text-clay-soft">{error}</p>}
      </div>
    </Modal>
  );
}

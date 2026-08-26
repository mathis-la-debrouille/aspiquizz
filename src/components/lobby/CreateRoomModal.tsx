"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tooltip } from "@/components/ui/Tooltip";
import { RadioCard } from "@/components/ui/RadioCard";
import { RhythmSection, type RhythmValue } from "@/components/room/RhythmSection";
import { NewCategoryButton } from "@/components/categories/NewCategoryButton";
import { useSocket } from "@/lib/socket/client";
import { MIN_QUESTIONS_PER_CATEGORY } from "@/lib/game-rules";
import type { CategoryOption } from "@/components/authoring/types";
import type { QuizListItem } from "@/server/questions/queries";

export function CreateRoomModal({
  open,
  onClose,
  categories: initialCategories,
  questionCounts,
  quizzes,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  /** Published questions per category id. A category absent from the map counts as zero — which
   *  is what a category created inline from this very modal genuinely has. */
  questionCounts: Record<string, number>;
  quizzes: QuizListItem[];
}) {
  const router = useRouter();
  const { socket } = useSocket();
  // Lifted (not just the server-fetched prop) so a category created inline (Addendum B.1) shows
  // up immediately in this filter.
  const [categories, setCategories] = useState(initialCategories);
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

  const isSelectable = (id: string) => (questionCounts[id] ?? 0) >= MIN_QUESTIONS_PER_CATEGORY;

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
          // Filtered again here, not just in the checkbox list: a category can fall under the
          // threshold between the page render and this click (someone archives a question), and
          // sending it would quietly reintroduce the over-served thin category.
          categoryIds: source === "random" ? categoryIds.filter(isSelectable) : [],
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
            <div className="flex items-center justify-between">
              <span className="text-14 font-medium text-ink-mid">
                Catégories (toutes si aucune choisie)
              </span>
              <NewCategoryButton categories={categories} onCategoriesChange={setCategories} />
            </div>
            <div className="flex flex-wrap gap-3">
              {categories.map((c) => {
                const count = questionCounts[c.id] ?? 0;
                const selectable = isSelectable(c.id);
                const checkbox = (
                  <Checkbox
                    label={c.name}
                    checked={selectable && categoryIds.includes(c.id)}
                    disabled={!selectable}
                    onChange={() => toggleCategory(c.id)}
                  />
                );
                return (
                  <span key={c.id}>
                    {selectable ? (
                      checkbox
                    ) : (
                      <Tooltip
                        content={`Pas assez de questions — ${count}/${MIN_QUESTIONS_PER_CATEGORY}`}
                      >
                        {checkbox}
                      </Tooltip>
                    )}
                  </span>
                );
              })}
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

        {/* Two binary choices, so both are laid out rather than hidden behind a
         *  dropdown each — and the selected option explains itself underneath,
         *  which "Rapidité" on its own never did. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <SegmentedControl
            label="Visibilité"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "public", label: "Public", hint: "Visible dans la liste des salons." },
              { value: "private", label: "Privé", hint: "Accessible uniquement avec le code." },
            ]}
          />
          <SegmentedControl
            label="Notation"
            value={scoringMode}
            onChange={setScoringMode}
            options={[
              {
                value: "speed",
                label: "Rapidité",
                hint: "Répondre vite rapporte plus de points.",
              },
              {
                value: "flat",
                label: "Fixe",
                hint: "Le temps n'a aucun effet sur les points.",
              },
            ]}
          />
        </div>

        {error && <p className="text-14 text-clay-soft">{error}</p>}
      </div>
    </Modal>
  );
}

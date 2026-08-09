"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TypePicker } from "@/components/authoring/TypePicker";
import { OpenForm } from "@/components/authoring/OpenForm";
import { McqForm } from "@/components/authoring/McqForm";
import { ImageForm } from "@/components/authoring/ImageForm";
import { GeoForm } from "@/components/authoring/GeoForm";
import type { CategoryOption } from "@/components/authoring/types";
import type { QuestionType } from "@/server/db/schema";

export function QuestionComposer({ categories }: { categories: CategoryOption[] }) {
  const [type, setType] = useState<QuestionType | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  if (createdId) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-moss-deep bg-moss-deep/10 px-6 py-10 text-center">
        <CheckCircle2 strokeWidth={1.5} className="h-10 w-10 text-moss-glow" />
        <h2 className="font-display text-26 text-ink-high">Question enregistrée</h2>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setCreatedId(null);
              setType(null);
            }}
          >
            Créer une autre question
          </Button>
          <Link href="/creer/quiz">
            <Button variant="secondary">Construire un quiz</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!type) {
    return <TypePicker onPick={setType} />;
  }

  const back = (
    <button
      type="button"
      onClick={() => setType(null)}
      className="text-14 text-ink-faint hover:text-ink-high"
    >
      ← Changer de type
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {back}
      {type === "open" && <OpenForm categories={categories} onCreated={setCreatedId} />}
      {type === "mcq" && <McqForm categories={categories} onCreated={setCreatedId} />}
      {type === "image" && <ImageForm categories={categories} onCreated={setCreatedId} />}
      {type === "geo" && <GeoForm categories={categories} onCreated={setCreatedId} />}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { Sparkles, ListChecks, Image as ImageIcon, MapPinned } from "lucide-react";
import { RadioCard } from "@/components/ui/RadioCard";
import type { QuestionType } from "@/server/db/schema";

const TYPES: {
  value: QuestionType;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: "open",
    label: "Réponse libre",
    description: "Le joueur tape sa réponse.",
    icon: <Sparkles className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    value: "mcq",
    label: "QCM",
    description: "2 à 6 options, une ou plusieurs correctes.",
    icon: <ListChecks className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    value: "image",
    label: "Image",
    description: "Une image, réponse libre ou QCM.",
    icon: <ImageIcon className="h-5 w-5" strokeWidth={1.5} />,
  },
  {
    value: "geo",
    label: "Géographie",
    description: "Carte vectorielle, cinq sous-modes.",
    icon: <MapPinned className="h-5 w-5" strokeWidth={1.5} />,
  },
];

export function TypePicker({ onPick }: { onPick: (type: QuestionType) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TYPES.map((t) => (
        <RadioCard
          key={t.value}
          name="question-type"
          value={t.value}
          label={t.label}
          description={t.description}
          icon={t.icon}
          onChange={() => onPick(t.value)}
        />
      ))}
    </div>
  );
}

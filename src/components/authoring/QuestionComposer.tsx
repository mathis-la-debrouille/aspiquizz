"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TypePicker } from "@/components/authoring/TypePicker";
import { OpenForm, type OpenFormInitial } from "@/components/authoring/OpenForm";
import { McqForm, type McqFormInitial } from "@/components/authoring/McqForm";
import { ImageForm, type ImageFormInitial } from "@/components/authoring/ImageForm";
import { GeoForm } from "@/components/authoring/GeoForm";
import { SortForm, type SortFormInitial } from "@/components/authoring/SortForm";
import type { CategoryOption } from "@/components/authoring/types";
import type { QuestionType } from "@/server/db/schema";

/** Present only in edit mode (/creer/question/[id]) — geo isn't supported here yet, its editor
 *  is being rebuilt from the ground up (Addendum B.3) and gains edit support as part of that,
 *  rather than wiring it twice against a form about to be replaced. sort has the same gap,
 *  new rather than rebuilt: /creer/question/[id] isn't wired for it yet either. */
export interface EditingQuestion {
  id: string;
  type: QuestionType;
  open?: OpenFormInitial;
  mcq?: McqFormInitial;
  image?: ImageFormInitial;
  sort?: SortFormInitial;
}

export function QuestionComposer({
  categories: initialCategories,
  editing,
}: {
  categories: CategoryOption[];
  editing?: EditingQuestion;
}) {
  const [type, setType] = useState<QuestionType | null>(editing?.type ?? null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Lifted here (not just the server-fetched prop) so a category created inline from any of the
  // four forms below (Addendum B.1) shows up immediately without remounting the form.
  const [categories, setCategories] = useState(initialCategories);

  if (createdId) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-moss-deep bg-moss-deep/10 px-6 py-10 text-center">
        <CheckCircle2 strokeWidth={1.5} className="h-10 w-10 text-moss-glow" />
        <h2 className="font-display text-26 text-ink-high">
          {editing ? "Modifications enregistrées" : "Question enregistrée"}
        </h2>
        <div className="flex gap-3">
          <Link href={`/creer/question/${createdId}`}>
            <Button>Voir la question</Button>
          </Link>
          {!editing && (
            <Button
              variant="secondary"
              onClick={() => {
                setCreatedId(null);
                setType(null);
              }}
            >
              Créer une autre question
            </Button>
          )}
          <Link href="/creer">
            <Button variant="ghost">Retour à la bibliothèque</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!type) {
    return <TypePicker onPick={setType} />;
  }

  const back = !editing && (
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
      {type === "open" && (
        <OpenForm
          categories={categories}
          onCategoriesChange={setCategories}
          onCreated={setCreatedId}
          initial={editing?.open}
        />
      )}
      {type === "mcq" && (
        <McqForm
          categories={categories}
          onCategoriesChange={setCategories}
          onCreated={setCreatedId}
          initial={editing?.mcq}
        />
      )}
      {type === "image" && (
        <ImageForm
          categories={categories}
          onCategoriesChange={setCategories}
          onCreated={setCreatedId}
          initial={editing?.image}
        />
      )}
      {type === "geo" && (
        <GeoForm categories={categories} onCategoriesChange={setCategories} onCreated={setCreatedId} />
      )}
      {type === "sort" && (
        <SortForm
          categories={categories}
          onCategoriesChange={setCategories}
          onCreated={setCreatedId}
          initial={editing?.sort}
        />
      )}
    </div>
  );
}

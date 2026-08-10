import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { QuestionComposer } from "@/components/authoring/QuestionComposer";

export const metadata: Metadata = { title: "Nouvelle question — ASPI Quiz" };

export default async function CreerQuestionPage() {
  const categoryRows = await db.select().from(categories).orderBy(desc(categories.position));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-34 text-ink-high">Nouvelle question</h1>
        <p className="text-16 text-ink-mid">
          Choisissez un type, remplissez le formulaire — l&apos;aperçu à droite montre exactement ce
          qu&apos;un joueur verra.
        </p>
      </div>

      <QuestionComposer
        categories={categoryRows.map((c) => ({ id: c.id, name: c.name, colorToken: c.colorToken }))}
      />
    </div>
  );
}

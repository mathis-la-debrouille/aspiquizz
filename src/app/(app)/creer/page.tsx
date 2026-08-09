import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { listQuestions } from "@/server/questions/queries";
import { QuestionComposer } from "@/components/authoring/QuestionComposer";
import { QuestionCard } from "@/components/authoring/QuestionCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Créer une question — ASPI Quiz" };

export default async function CreerPage() {
  const session = await getSession();
  const [categoryRows, myDrafts] = await Promise.all([
    db.select().from(categories).orderBy(desc(categories.position)),
    session ? listQuestions({ authorId: session.user.id, status: "draft" }) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-34 text-ink-high">Créer une question</h1>
        <p className="text-16 text-ink-mid">
          Choisissez un type, remplissez le formulaire — l&apos;aperçu à droite montre exactement ce
          qu&apos;un joueur verra.
        </p>
      </div>

      <QuestionComposer
        categories={categoryRows.map((c) => ({ id: c.id, name: c.name, colorToken: c.colorToken }))}
      />

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-26 text-ink-high">Mes brouillons</h2>
        {myDrafts.length === 0 ? (
          <EmptyState
            title="Aucun brouillon."
            description="Les questions enregistrées en brouillon apparaîtront ici."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myDrafts.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

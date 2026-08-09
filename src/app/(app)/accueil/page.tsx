import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { listPublishedQuizzes } from "@/server/questions/queries";
import { LobbyClient } from "@/components/lobby/LobbyClient";

export const metadata: Metadata = {
  title: "Accueil — ASPI Quiz",
};

export default async function AccueilPage() {
  const session = await getSession();
  const displayName = session?.user.displayName ?? "";

  const [categoryRows, quizzes] = await Promise.all([
    db.select().from(categories).orderBy(desc(categories.position)),
    listPublishedQuizzes(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-34 text-ink-high">Bienvenue, {displayName}</h1>
        <p className="text-16 text-ink-mid">Rejoignez un salon ouvert ou créez le vôtre.</p>
      </div>
      <LobbyClient
        categories={categoryRows.map((c) => ({ id: c.id, name: c.name, colorToken: c.colorToken }))}
        quizzes={quizzes}
      />
    </div>
  );
}

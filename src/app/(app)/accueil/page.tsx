import type { Metadata } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { categories, questions } from "@/server/db/schema";
import { listPublishedQuizzes } from "@/server/questions/queries";
import { LobbyClient } from "@/components/lobby/LobbyClient";

export const metadata: Metadata = {
  title: "Accueil — ASPI Quiz",
};

export default async function AccueilPage() {
  const session = await getSession();
  const displayName = session?.user.displayName ?? "";

  const [categoryRows, quizzes] = await Promise.all([
    // The published count per category drives which categories a host may pick — a category
    // under MIN_QUESTIONS_PER_CATEGORY is shown disabled, not hidden, so it's obvious that it
    // exists and why it can't be used yet.
    db
      .select({
        id: categories.id,
        name: categories.name,
        colorToken: categories.colorToken,
        questionCount: sql<number>`count(${questions.id})`,
      })
      .from(categories)
      .leftJoin(
        questions,
        and(eq(questions.categoryId, categories.id), eq(questions.status, "published")),
      )
      .groupBy(categories.id)
      .orderBy(desc(categories.position)),
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
        questionCounts={Object.fromEntries(categoryRows.map((c) => [c.id, c.questionCount]))}
        quizzes={quizzes}
      />
    </div>
  );
}

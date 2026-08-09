import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { listQuestions } from "@/server/questions/queries";
import { QuizBuilder } from "@/components/authoring/QuizBuilder";

export const metadata: Metadata = { title: "Créer un quiz — ASPI Quiz" };

export default async function CreerQuizPage() {
  const [categoryRows, pool] = await Promise.all([
    db.select().from(categories).orderBy(desc(categories.position)),
    listQuestions({ status: "published" }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-34 text-ink-high">Créer un quiz</h1>
        <p className="text-16 text-ink-mid">
          Assemblez un ensemble ordonné de questions à partir du vivier partagé.
        </p>
      </div>
      <QuizBuilder
        categories={categoryRows.map((c) => ({ id: c.id, name: c.name, colorToken: c.colorToken }))}
        pool={pool}
      />
    </div>
  );
}

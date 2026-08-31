import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { db, client } from "@/server/db";
import { questions, questionChoices, questionOpenAnswers, categories } from "@/server/db/schema";

async function main() {
  const wanted = process.argv[2];
  const rows = await db
    .select({
      id: questions.id,
      prompt: questions.prompt,
      type: questions.type,
      diff: questions.difficulty,
      cat: categories.name,
    })
    .from(questions)
    .innerJoin(categories, eq(categories.id, questions.categoryId))
    .where(
      and(
        eq(questions.status, "published"),
        or(isNull(questions.explanation), eq(questions.explanation, "")),
        inArray(questions.type, ["mcq", "open"]),
        wanted ? eq(categories.name, wanted) : undefined,
      ),
    );

  const out: unknown[] = [];
  for (const r of rows) {
    const ch = await db.select().from(questionChoices).where(eq(questionChoices.questionId, r.id));
    const oa = await db
      .select()
      .from(questionOpenAnswers)
      .where(eq(questionOpenAnswers.questionId, r.id));
    out.push({
      id: r.id,
      cat: r.cat,
      d: r.diff,
      q: r.prompt,
      ok: [...ch.filter((c) => c.isCorrect).map((c) => c.label), ...oa.filter((o) => o.isPrimary).map((o) => o.value)],
      no: ch.filter((c) => !c.isCorrect).map((c) => c.label),
    });
  }
  console.error("---dump---");
  console.log(JSON.stringify(out, null, 0).replace(/\},\{/g, "},\n{"));
  console.error(`${out.length} sans explication${wanted ? ` dans ${wanted}` : ""}`);
  client.close();
}
void main();

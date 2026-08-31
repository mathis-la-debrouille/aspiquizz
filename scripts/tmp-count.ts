import { and, eq, isNull, or, sql, inArray } from "drizzle-orm";
import { db, client } from "@/server/db";
import { questions, categories } from "@/server/db/schema";
async function main() {
  const rows = await db
    .select({ cat: categories.name, n: sql<number>`count(*)` })
    .from(questions)
    .innerJoin(categories, eq(categories.id, questions.categoryId))
    .where(and(eq(questions.status, "published"), or(isNull(questions.explanation), eq(questions.explanation, "")), inArray(questions.type, ["mcq","open"])))
    .groupBy(categories.name);
  for (const r of rows.sort((a,b)=>b.n-a.n)) console.log(String(r.n).padStart(5), r.cat);
  client.close();
}
void main();

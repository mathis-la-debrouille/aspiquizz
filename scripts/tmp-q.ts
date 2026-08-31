import { inArray, eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { questions, questionChoices } from "@/server/db/schema";
async function main() {
  const ids = process.argv.slice(2);
  for (const id of ids) {
    const [q] = await db.select().from(questions).where(eq(questions.id, id));
    if (!q) { console.error("introuvable", id); continue; }
    console.error(`\n${q.id} [${q.type}] ${q.prompt}`);
    const ch = await db.select().from(questionChoices).where(eq(questionChoices.questionId, id));
    for (const c of ch) console.error(`   ${c.id} ${c.isCorrect ? "✓" : "·"} ${c.label}`);
  }
  client.close();
}
void main();

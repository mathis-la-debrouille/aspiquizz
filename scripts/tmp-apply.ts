/** One-off: applies {id, e} explanation pairs from a JSON file. Deleted after the pass. */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { questions } from "@/server/db/schema";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tmp-apply.ts <file.json>");
  const rows = JSON.parse(readFileSync(file, "utf8")) as { id: string; e: string }[];
  let done = 0;
  for (const r of rows) {
    if (!r.e || r.e.trim().length < 10) throw new Error(`explication trop courte: ${r.id}`);
    const res = await db
      .update(questions)
      .set({ explanation: r.e.trim(), updatedAt: new Date() })
      .where(eq(questions.id, r.id));
    if (res.rowsAffected !== 1) throw new Error(`introuvable: ${r.id}`);
    done++;
  }
  console.log(`${done} explications écrites`);
  client.close();
}
void main();

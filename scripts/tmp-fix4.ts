/** One-off: one more self-answering prompt, found in Sciences. */
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { questions } from "@/server/db/schema";

async function main() {
  const id = "01M0X1WN6Q98AQ4YSM7MS9RB6J";
  const prompt =
    "Quelle partie du cerveau, indispensable à la formation des souvenirs, porte le nom d'un animal marin en raison de sa forme incurvée ?";
  const [before] = await db.select().from(questions).where(eq(questions.id, id));
  if (!before) throw new Error("introuvable");
  console.log(`AVANT : ${before.prompt}`);
  console.log(`APRÈS : ${prompt}`);
  await db.update(questions).set({ prompt, updatedAt: new Date() }).where(eq(questions.id, id));
  console.log("APPLIQUÉ");
  client.close();
}
void main();

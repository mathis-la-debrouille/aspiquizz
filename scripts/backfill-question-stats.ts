/**
 * One-time backfill for question_stats (Addendum A.8) — aggregates the existing `answers`
 * table into per-question totals. Needed once, for any answers recorded before this table
 * existed; going forward engine.ts increments it live, at question lock, so this never needs
 * to run again in normal operation. Idempotent: safe to re-run, it overwrites rather than adds.
 */
import { sql } from "drizzle-orm";
import { db, client } from "@/server/db";
import { answers, questionStats } from "@/server/db/schema";

export async function backfillQuestionStats(): Promise<number> {
  const rows = await db
    .select({
      questionId: answers.questionId,
      timesAsked: sql<number>`count(*)`,
      timesCorrect: sql<number>`sum(case when ${answers.isCorrect} then 1 else 0 end)`,
      totalMs: sql<number>`sum(${answers.msTaken})`,
    })
    .from(answers)
    .groupBy(answers.questionId);

  for (const row of rows) {
    await db
      .insert(questionStats)
      .values({
        questionId: row.questionId,
        timesAsked: Number(row.timesAsked),
        timesCorrect: Number(row.timesCorrect),
        totalMs: Number(row.totalMs),
      })
      .onConflictDoUpdate({
        target: questionStats.questionId,
        set: {
          timesAsked: Number(row.timesAsked),
          timesCorrect: Number(row.timesCorrect),
          totalMs: Number(row.totalMs),
          updatedAt: new Date(),
        },
      });
  }

  return rows.length;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  backfillQuestionStats()
    .then((count) => {
      console.log(JSON.stringify({ event: "backfill_question_stats_complete", count }));
      return client.close();
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({ event: "backfill_question_stats_failed", error: String(error) }));
      process.exit(1);
    });
}

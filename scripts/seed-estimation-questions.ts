/**
 * Creates questions from scripts/data/estimation-questions.fr.json — 50 "estimation" questions
 * (guess a number, closeness scores — the type added just before this file), deliberately wide
 * and playful in topic (bananas and potassium poisoning next to France's public debt next to
 * WW2's death toll), difficulty 1-4, hand authored for this project (not sourced from an
 * external, independently-vetted dataset the way imported-questions.fr.json is).
 *
 * Because of that, this script uses `source: "import"` rather than `"manual"` — ingest.ts forces
 * `status: "draft"` for any non-"manual" source unconditionally, so every question lands in the
 * review queue (review.ts's listReviewQueue filters `ne(questions.source, "manual")`) for a human
 * to check and publish, rather than going live unreviewed. See CLAUDE.md's Addendum C section.
 *
 * Goes through createQuestionFromDraft like everything else, so these get the same validation,
 * the same duplicate-prompt warning and the same single insert path as an MCP or web-authored
 * question. Nothing here writes to `questions` (or `question_sort_items`) directly.
 *
 * Idempotent by prompt: re-running skips what already exists rather than creating a second copy.
 *
 * Run: pnpm tsx scripts/seed-estimation-questions.ts [--author alex] [--dry-run]
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { users, questions } from "@/server/db/schema";
import { createQuestionFromDraft } from "@/server/questions/ingest";
import type { QuestionDraft } from "@/lib/schemas/ingest";

type IncomingQuestion = QuestionDraft;

async function main() {
  const argv = process.argv;
  const authorIdx = argv.indexOf("--author");
  const username = (authorIdx > -1 ? argv[authorIdx + 1] : undefined) ?? "alex";
  const dryRun = argv.includes("--dry-run");

  const file = JSON.parse(
    readFileSync(new URL("./data/estimation-questions.fr.json", import.meta.url), "utf-8"),
  ) as { questions: IncomingQuestion[] };
  const incoming = file.questions;

  const byCategory = incoming.reduce<Record<string, number>>((acc, q) => {
    acc[q.categorie] = (acc[q.categorie] ?? 0) + 1;
    return acc;
  }, {});
  const byTier = incoming.reduce<Record<number, number>>((acc, q) => {
    acc[q.difficulte] = (acc[q.difficulte] ?? 0) + 1;
    return acc;
  }, {});
  const byType = incoming.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[info] ${incoming.length} questions in file`);
  console.log(`[info] categories: ${JSON.stringify(byCategory)}`);
  console.log(`[info] tiers: ${JSON.stringify(byTier)}`);
  console.log(`[info] types: ${JSON.stringify(byType)}`);

  if (dryRun) {
    for (const q of incoming.slice(0, 15)) {
      console.log(`  d${q.difficulte} [${q.categorie}] (${q.type}) ${q.enonce}`);
    }
    console.log("[info] --dry-run, nothing written");
    client.close();
    return;
  }

  const [author] = await db.select().from(users).where(eq(users.username, username));
  if (!author) throw new Error(`No such user: ${username}`);

  const existing = new Set(
    (await db.select({ prompt: questions.prompt }).from(questions)).map((q) => q.prompt),
  );

  let created = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const q of incoming) {
    if (existing.has(q.enonce)) {
      skipped += 1;
      continue;
    }
    const result = await createQuestionFromDraft(q, {
      authorId: author.id,
      source: "import",
    });
    if (result.ok) created += 1;
    else failures.push(`${q.enonce} :: ${result.errors.map((e) => e.message).join("; ")}`);
  }

  console.log(
    JSON.stringify({
      event: "seed_estimation_questions_complete",
      created,
      skipped,
      failed: failures.length,
    }),
  );
  for (const f of failures.slice(0, 30)) console.log(`  FAIL ${f}`);
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

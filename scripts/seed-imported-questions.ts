/**
 * Creates questions from scripts/data/imported-questions.fr.json — the translated,
 * vetted output of the Open Trivia DB pipeline (see fetch-opentdb.ts).
 *
 * Goes through createQuestionFromDraft like everything else, so these questions get
 * the same validation, the same duplicate-prompt warning and the same single insert
 * path as an MCP or web-authored one. Nothing here writes to `questions` directly.
 *
 * Idempotent by prompt: re-running skips what already exists rather than creating a
 * second copy. Unlike the geo generator there is no (country, mode) key to match
 * on, so the prompt is the identity — which is fine here because these prompts are
 * hand-written and stable, not generated from data that might be corrected later.
 *
 * Run: pnpm tsx scripts/seed-imported-questions.ts [--author alex] [--dry-run]
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { users, questions } from "@/server/db/schema";
import { createQuestionFromDraft } from "@/server/questions/ingest";
import type { QuestionDraft } from "@/lib/schemas/ingest";

interface ImportedQuestion {
  categorie: string;
  difficulte: 1 | 2 | 3 | 4 | 5;
  enonce: string;
  /** Absent means published. Present only for a question somebody took out of rotation —
   *  honoured here so a restore doesn't quietly republish it. */
  statut?: "draft" | "archived";
  /** mcq only. First entry is the correct one; order is shuffled at play time by the engine. */
  choix?: Array<{ texte: string; correct: boolean }>;
  /** open only. First entry is the canonical answer, the rest are accepted variants. */
  reponses?: string[];
  explication?: string;
  /** Kept for traceability back to the source row, not shown to players. */
  source?: string;
}

async function main() {
  const argv = process.argv;
  const authorIdx = argv.indexOf("--author");
  const username = (authorIdx > -1 ? argv[authorIdx + 1] : undefined) ?? "alex";
  const dryRun = argv.includes("--dry-run");

  const file = JSON.parse(
    readFileSync(new URL("./data/imported-questions.fr.json", import.meta.url), "utf-8"),
  ) as { questions: ImportedQuestion[] };
  const incoming = file.questions;

  const byCategory = incoming.reduce<Record<string, number>>((acc, q) => {
    acc[q.categorie] = (acc[q.categorie] ?? 0) + 1;
    return acc;
  }, {});
  const byTier = incoming.reduce<Record<number, number>>((acc, q) => {
    acc[q.difficulte] = (acc[q.difficulte] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[info] ${incoming.length} questions in file`);
  console.log(`[info] categories: ${JSON.stringify(byCategory)}`);
  console.log(`[info] tiers: ${JSON.stringify(byTier)}`);

  // The file holds both shapes, because export-questions.ts writes both: `choix` for mcq,
  // `reponses` for open. Reading only the first one is how this script used to crash on the
  // first open question anybody exported — an export the same repo produces has to be
  // re-importable, or the file isn't a backup of anything.
  const neither = incoming.filter((q) => !q.choix && !q.reponses);
  if (neither.length > 0) {
    console.error(`[fail] ${neither.length} questions have neither "choix" nor "reponses":`);
    for (const q of neither.slice(0, 10)) console.error(`         ${q.enonce}`);
    process.exit(1);
  }

  // Exactly one correct choice — a silent second one would make the question ungradeable
  // rather than merely wrong.
  const malformed = incoming.filter(
    (q) => q.choix && q.choix.filter((c) => c.correct).length !== 1,
  );
  if (malformed.length > 0) {
    console.error(`[fail] ${malformed.length} questions do not have exactly one correct choice:`);
    for (const q of malformed.slice(0, 10)) console.error(`         ${q.enonce}`);
    process.exit(1);
  }
  const tooFew = incoming.filter((q) => q.choix && q.choix.length < 2);
  if (tooFew.length > 0) {
    console.error(`[fail] ${tooFew.length} questions have fewer than 2 choices`);
    process.exit(1);
  }
  const noAnswer = incoming.filter((q) => q.reponses && q.reponses.length === 0);
  if (noAnswer.length > 0) {
    console.error(`[fail] ${noAnswer.length} open questions have no accepted answer`);
    process.exit(1);
  }

  if (dryRun) {
    for (const q of incoming.slice(0, 15)) {
      console.log(`  d${q.difficulte} [${q.categorie}] ${q.enonce}`);
      console.log(
        `      ${
          q.choix
            ? q.choix.map((c) => (c.correct ? `**${c.texte}**` : c.texte)).join(" | ")
            : (q.reponses ?? []).join(" / ")
        }`,
      );
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
    const common = {
      enonce: q.enonce,
      categorie: q.categorie,
      difficulte: q.difficulte,
      ...(q.explication ? { explication: q.explication } : {}),
    };
    const draft: QuestionDraft = q.choix
      ? { type: "mcq", ...common, choix: q.choix }
      : { type: "open", ...common, reponses: q.reponses! };
    const result = await createQuestionFromDraft(draft, {
      authorId: author.id,
      source: "manual",
      initialStatus: q.statut ?? "published",
    });
    if (result.ok) created += 1;
    else failures.push(`${q.enonce} :: ${result.errors.map((e) => e.message).join("; ")}`);
  }

  console.log(
    JSON.stringify({
      event: "seed_imported_questions_complete",
      created,
      skipped,
      failed: failures.length,
    }),
  );
  for (const f of failures.slice(0, 20)) console.log(`  FAIL ${f}`);
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

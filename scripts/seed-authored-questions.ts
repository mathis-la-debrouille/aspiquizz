/**
 * Creates questions from one of the hand-authored batches under scripts/data/ — the JSON files
 * of `QuestionDraft`s written for this project rather than pulled from an external, vetted
 * dataset the way imported-questions.fr.json was:
 *
 *   economy-questions.fr.json     economy & finance, difficulty 1-5
 *   history-questions.fr.json     French/Russian revolutions, WW1, WW2, Germany 1900-1950
 *   politics-questions.fr.json    French and European institutions, treaties, enlargements
 *   estimation-questions.fr.json  "estimation" type — guess a number, closeness scores
 *
 * One script, because there used to be four copies of it differing only in the file name.
 *
 * Because these are not independently vetted, questions go in with `source: "import"` —
 * ingest.ts forces `status: "draft"` for any non-"manual" source unconditionally, so every one
 * lands in the review queue (review.ts's listReviewQueue filters `ne(questions.source,
 * "manual")`) for a human to check and publish, rather than going live unreviewed. See
 * CLAUDE.md's Addendum C section.
 *
 * Goes through createQuestionFromDraft like everything else, so these get the same validation,
 * the same duplicate-prompt warning and the same single insert path as an MCP or web-authored
 * question. Nothing here writes to `questions` (or `question_sort_items`) directly.
 *
 * Idempotent by prompt: re-running skips what already exists rather than creating a second copy.
 *
 * Run: pnpm tsx scripts/seed-authored-questions.ts <file> [--author alex] [--dry-run]
 *      <file> is a path, or a bare name resolved under scripts/data/ (e.g. economy-questions.fr.json)
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { users, questions } from "@/server/db/schema";
import { createQuestionFromDraft } from "@/server/questions/ingest";
import type { QuestionDraft } from "@/lib/schemas/ingest";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");

function resolveDataFile(arg: string | undefined): string {
  if (!arg) {
    throw new Error(
      "usage: pnpm tsx scripts/seed-authored-questions.ts <file> [--author alex] [--dry-run]",
    );
  }
  const candidates = [arg, path.join(DATA_DIR, arg)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`No such file: ${arg} (tried ${candidates.join(", ")})`);
  return found;
}

async function main() {
  const argv = process.argv.slice(2);
  const authorIdx = argv.indexOf("--author");
  const username = (authorIdx > -1 ? argv[authorIdx + 1] : undefined) ?? "alex";
  const dryRun = argv.includes("--dry-run");
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--author");
  const file = resolveDataFile(positional[0]);

  const parsed = JSON.parse(readFileSync(file, "utf-8")) as { questions: QuestionDraft[] };
  const incoming = parsed.questions;

  const tally = <K extends string | number>(pick: (q: QuestionDraft) => K) =>
    incoming.reduce<Record<K, number>>(
      (acc, q) => {
        acc[pick(q)] = (acc[pick(q)] ?? 0) + 1;
        return acc;
      },
      {} as Record<K, number>,
    );
  console.log(`[info] ${path.basename(file)}: ${incoming.length} questions in file`);
  console.log(`[info] categories: ${JSON.stringify(tally((q) => q.categorie))}`);
  console.log(`[info] tiers: ${JSON.stringify(tally((q) => q.difficulte))}`);
  console.log(`[info] types: ${JSON.stringify(tally((q) => q.type))}`);

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
      event: "seed_authored_questions_complete",
      file: path.basename(file),
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

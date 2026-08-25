/**
 * Rewrites scripts/data/imported-questions.fr.json one question per line.
 *
 * Pretty-printed, each question took 23 lines, so 261 questions were 6 000 lines
 * and a batch of 200 produced a +5 600/-242 diff that nobody can review. The
 * deletions were the worst part: re-serialising the file reformatted questions
 * that hadn't changed at all.
 *
 * One line per question makes the diff exactly as long as the number of questions
 * added, and leaves untouched questions untouched. The file is still valid JSON and
 * still readable — a question is short enough to fit on a line.
 *
 * This file is seed-time input only. Nothing under src/ imports it, so it is never
 * bundled and never read while a game is running; the app reads questions from the
 * `questions` table, same as the geo set. It is committed for the same reason
 * countries.fr.json is: it is the reproducible record of the work, and without it a
 * wiped database means the translations are simply gone.
 *
 * Run: pnpm tsx scripts/format-questions.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, "data/imported-questions.fr.json");

interface Question {
  categorie: string;
  difficulte: number;
  enonce: string;
  choix: Array<{ texte: string; correct: boolean }>;
  explication?: string;
}

function main() {
  const parsed = JSON.parse(readFileSync(FILE, "utf-8")) as Record<string, unknown> & {
    questions: Question[];
  };
  const { questions, ...meta } = parsed;

  const header = Object.entries(meta)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(",\n");

  const lines = questions.map((q) => {
    // Key order is fixed rather than whatever the object happens to carry, so two
    // runs of this script always produce byte-identical output.
    const ordered: Record<string, unknown> = {
      categorie: q.categorie,
      difficulte: q.difficulte,
      enonce: q.enonce,
      choix: q.choix.map((c) => ({ texte: c.texte, correct: c.correct })),
    };
    if (q.explication) ordered.explication = q.explication;
    return `    ${JSON.stringify(ordered)}`;
  });

  const out = `{\n${header},\n  "questions": [\n${lines.join(",\n")}\n  ]\n}\n`;
  writeFileSync(FILE, out);

  const lineCount = out.split("\n").length;
  console.log(
    JSON.stringify({
      event: "format_questions_complete",
      questions: questions.length,
      lines: lineCount,
      lines_per_question: Math.round((lineCount / questions.length) * 10) / 10,
    }),
  );
}

main();

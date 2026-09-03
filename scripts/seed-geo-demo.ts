/**
 * Dev fixture: a playable 15-question geo round, spread across the five
 * difficulty tiers. Not production data — a seed script, per CLAUDE.md's rule
 * that fixtures live only in scripts/.
 *
 * Deliberately includes the awkward cases, because those are the ones worth
 * testing: Bolivia and South Africa (several capitals), Palestine (de jure vs
 * de facto), Taiwan/Niue/Vatican (the non-UN-member states added alongside the
 * 193), and Australia/Myanmar (capitals people reliably guess wrong).
 *
 * Run: pnpm tsx scripts/seed-geo-demo.ts [--author <username>]
 */
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { users } from "@/server/db/schema";
import { createQuestionFromDraft } from "@/server/questions/ingest";

type Mode = "locate_country" | "find_capital" | "name_country" | "name_from_shape";
type Spec = { enonce: string; mode: Mode; pays: string; difficulte: 1 | 2 | 3 | 4 | 5 };

// Shape/locate questions need real geometry at the map's default 110m resolution.
// Vatican, the Cook Islands and Niue have none there and are drawn as fallback
// hit-circles instead (see DECISIONS.md), so they are locate targets, never shapes.
const SPECS: Spec[] = [
  { enonce: "Où se trouve la France ?", mode: "locate_country", pays: "France", difficulte: 1 },
  {
    enonce: "Quelle est la capitale du Japon ?",
    mode: "find_capital",
    pays: "Japon",
    difficulte: 1,
  },
  { enonce: "Où se trouve le Brésil ?", mode: "locate_country", pays: "Brésil", difficulte: 1 },
  { enonce: "Quel pays a cette forme ?", mode: "name_from_shape", pays: "Italie", difficulte: 1 },
  {
    enonce: "Quelle est la capitale de l'Australie ?",
    mode: "find_capital",
    pays: "Australie",
    difficulte: 2,
  },
  { enonce: "Où se trouve la Mongolie ?", mode: "locate_country", pays: "Mongolie", difficulte: 2 },
  {
    enonce: "Quelle est la capitale du Kazakhstan ?",
    mode: "find_capital",
    pays: "Kazakhstan",
    difficulte: 3,
  },
  {
    enonce: "Quelle est la capitale de la Bolivie ?",
    mode: "find_capital",
    pays: "Bolivie",
    difficulte: 3,
  },
  { enonce: "Où se trouve Taïwan ?", mode: "locate_country", pays: "Taïwan", difficulte: 3 },
  {
    enonce: "Quelle est la capitale de l'Afrique du Sud ?",
    mode: "find_capital",
    pays: "Afrique du Sud",
    difficulte: 4,
  },
  {
    enonce: "Quelle est la capitale du Sri Lanka ?",
    mode: "find_capital",
    pays: "Sri Lanka",
    difficulte: 4,
  },
  { enonce: "Où se trouve le Bhoutan ?", mode: "locate_country", pays: "Bhoutan", difficulte: 4 },
  {
    enonce: "Quelle est la capitale de la Palestine ?",
    mode: "find_capital",
    pays: "État de Palestine",
    difficulte: 4,
  },
  {
    enonce: "Quelle est la capitale du Myanmar ?",
    mode: "find_capital",
    pays: "Myanmar",
    difficulte: 5,
  },
  { enonce: "Où se trouve Niue ?", mode: "locate_country", pays: "Niue", difficulte: 5 },
];

async function main() {
  const idx = process.argv.indexOf("--author");
  const username = (idx > -1 ? process.argv[idx + 1] : undefined) ?? "alex";
  const [author] = await db.select().from(users).where(eq(users.username, username));
  if (!author) throw new Error(`No such user: ${username} — run scripts/create-user.ts first.`);

  let created = 0;
  for (const spec of SPECS) {
    const result = await createQuestionFromDraft(
      {
        type: "geo",
        enonce: spec.enonce,
        categorie: "Géographie",
        difficulte: spec.difficulte,
        mode: spec.mode,
        pays: spec.pays,
        afficherNoms: false,
      },
      { authorId: author.id, source: "manual", initialStatus: "published" },
    );
    if (result.ok) {
      created += 1;
      console.log(`  ok   d${spec.difficulte} ${spec.mode.padEnd(16)} ${spec.pays}`);
    } else {
      console.log(
        `  FAIL d${spec.difficulte} ${spec.pays}: ${result.errors.map((e) => e.message).join("; ")}`,
      );
    }
  }
  console.log(JSON.stringify({ event: "seed_geo_demo_complete", created, total: SPECS.length }));
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

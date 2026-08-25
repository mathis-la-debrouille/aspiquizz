/**
 * Pulls raw questions from Open Trivia DB into scripts/data/opentdb-raw.json.
 *
 * This script does NOT create anything in the app. Its output is English, and the
 * app is French-only by design (CLAUDE.md), so the raw dump is an intermediate
 * that has to be translated and vetted by a human before it becomes questions —
 * see scripts/data/imported-questions.fr.json and seed-imported-questions.ts.
 * That review step is not bureaucracy: the source mixes perfectly good questions
 * with Anglo-centric ones ("What is dabbing?") and outright bad ones ("What is
 * H2O?" offering "None" as a distractor).
 *
 * Two API constraints, both handled here rather than discovered in production:
 *   - one request per 5 seconds per IP, so requests are spaced deliberately;
 *   - a session token is required to avoid being served the same questions again
 *     across requests, and it expires after 6 hours of inactivity.
 *
 * Run: pnpm tsx scripts/fetch-opentdb.ts [--per-batch 50] [--categories 9,17,23]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const DEST = path.join(repoRoot, "scripts/data/opentdb-raw.json");

const RATE_LIMIT_MS = 5_200; // the documented limit is 5s; a little margin
const API = "https://opentdb.com";

/**
 * Open Trivia DB category -> the category name in this app. Mapping to existing
 * categories rather than creating 24 new ones: the app has 11, they're the ones
 * players filter by, and "Science: Gadgets" is not a category anybody wants.
 *
 * Geography (22) is deliberately absent — it already holds 500+ curated, sourced
 * questions, and diluting that with translated trivia would undo the work.
 */
const CATEGORY_MAP: Record<number, string> = {
  9: "Culture générale",
  10: "Littérature",
  11: "Cinéma & Séries",
  12: "Musique",
  13: "Musique",
  14: "Cinéma & Séries",
  15: "Jeux vidéo",
  16: "Jeux vidéo",
  17: "Sciences",
  18: "Sciences",
  19: "Sciences",
  20: "Mythologie",
  21: "Sport",
  23: "Histoire",
  24: "Personnalité Politique",
  25: "Culture générale",
  26: "Culture générale",
  27: "Sciences",
  28: "Culture générale",
  29: "Cinéma & Séries",
  30: "Sciences",
  31: "Cinéma & Séries",
  32: "Cinéma & Séries",
};

/** easy/medium/hard -> tiers 1/2/3. Nothing lands on 4 or 5: those stay empty
 *  until there are questions that genuinely earn them. */
const DIFFICULTY_MAP: Record<string, 1 | 2 | 3> = { easy: 1, medium: 2, hard: 3 };

interface RawResult {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface StagedQuestion {
  /** Stable key for dedup across runs: normalised English prompt. */
  key: string;
  opentdbCategory: number;
  categorie: string;
  difficulte: 1 | 2 | 3;
  en: { question: string; correct: string; incorrect: string[] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The API returns HTML entities in every field. Decoded generically rather than
 * from a hand-written list: a partial list is worse than none, because it looks
 * like it works. A first pass here only covered lowercase accents and let
 * `&Eacute;charpe` and `Medell&iacute;n` through into the staged data.
 */
const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  hellip: "\u2026",
  ndash: "\u2013",
  mdash: "\u2014",
  nbsp: " ",
  lt: "<",
  gt: ">",
  amp: "&",
  shy: "",
  deg: "\u00b0",
  divide: "\u00f7",
  times: "\u00d7",
  plusmn: "\u00b1",
  frac12: "\u00bd",
  frac14: "\u00bc",
  frac34: "\u00be",
  sup2: "\u00b2",
  sup3: "\u00b3",
  micro: "\u00b5",
  pound: "\u00a3",
  euro: "\u20ac",
  yen: "\u00a5",
  cent: "\u00a2",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  aacute: "á",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  aring: "å",
  atilde: "ã",
  iacute: "í",
  igrave: "ì",
  icirc: "î",
  iuml: "ï",
  oacute: "ó",
  ograve: "ò",
  ocirc: "ô",
  ouml: "ö",
  otilde: "õ",
  oslash: "ø",
  uacute: "ú",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  yacute: "ý",
  yuml: "ÿ",
  ntilde: "ñ",
  ccedil: "ç",
  szlig: "ß",
  aelig: "æ",
  oelig: "œ",
  thorn: "þ",
  eth: "ð",
};

function decodeEntities(input: string): string {
  return (
    input
      // Numeric, decimal and hex: &#39; &#x27;
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
      // Named, case-insensitively: the feed mixes &eacute; and &Eacute;, and the
      // capitalised form has to come back capitalised.
      .replace(/&([a-z]+);/gi, (whole, name: string) => {
        const lower = NAMED_ENTITIES[name.toLowerCase()];
        if (lower === undefined) return whole;
        const isCapitalised = name[0] === name[0]!.toUpperCase() && name[0] !== name[0]!.toLowerCase();
        return isCapitalised ? lower.toUpperCase() : lower;
      })
      // &amp; can wrap another entity (&amp;quot;) — one extra pass clears that.
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
  );
}

function normaliseKey(s: string): string {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getSessionToken(): Promise<string> {
  const res = await fetch(`${API}/api_token.php?command=request`);
  const json = (await res.json()) as { response_code: number; token: string };
  if (json.response_code !== 0) throw new Error(`token request failed: ${json.response_code}`);
  return json.token;
}

async function fetchBatch(
  category: number,
  difficulty: string,
  amount: number,
  token: string,
): Promise<RawResult[] | "exhausted"> {
  const url = `${API}/api.php?amount=${amount}&category=${category}&difficulty=${difficulty}&type=multiple&token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { response_code: number; results?: RawResult[] };
  // 1 = no results for this query, 4 = token has already seen everything here.
  if (json.response_code === 1 || json.response_code === 4) return "exhausted";
  if (json.response_code !== 0) throw new Error(`response_code ${json.response_code}`);
  return json.results ?? [];
}

async function main() {
  const argv = process.argv;
  const perBatchIdx = argv.indexOf("--per-batch");
  const perBatch = perBatchIdx > -1 ? Number(argv[perBatchIdx + 1]) : 50;
  const catsIdx = argv.indexOf("--categories");
  const categories =
    catsIdx > -1
      ? argv[catsIdx + 1]!.split(",").map(Number)
      : Object.keys(CATEGORY_MAP).map(Number);

  // Anything already staged stays staged: this is meant to be run repeatedly,
  // topping up the pool rather than replacing it.
  const existing: StagedQuestion[] = existsSync(DEST)
    ? (JSON.parse(readFileSync(DEST, "utf-8")) as { questions: StagedQuestion[] }).questions
    : [];
  const seen = new Set(existing.map((q) => q.key));
  const staged = [...existing];

  const token = await getSessionToken();
  console.log(`[info] session token acquired, ${categories.length} categories to sweep`);

  for (const category of categories) {
    const target = CATEGORY_MAP[category];
    if (!target) continue;
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      await sleep(RATE_LIMIT_MS);
      let batch: RawResult[] | "exhausted";
      try {
        batch = await fetchBatch(category, difficulty, perBatch, token);
      } catch (err) {
        console.log(`[warn] cat ${category}/${difficulty}: ${(err as Error).message}`);
        continue;
      }
      if (batch === "exhausted") {
        console.log(`[info] cat ${category}/${difficulty}: nothing new`);
        continue;
      }
      let added = 0;
      for (const r of batch) {
        const key = normaliseKey(r.question);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        staged.push({
          key,
          opentdbCategory: category,
          categorie: target,
          difficulte: DIFFICULTY_MAP[r.difficulty] ?? 2,
          en: {
            question: decodeEntities(r.question),
            correct: decodeEntities(r.correct_answer),
            incorrect: r.incorrect_answers.map(decodeEntities),
          },
        });
        added += 1;
      }
      console.log(`[info] cat ${category}/${difficulty}: +${added} (total ${staged.length})`);
    }
  }

  writeFileSync(
    DEST,
    `${JSON.stringify(
      {
        _comment:
          "Raw English questions from Open Trivia DB. NOT importable as-is — the app is French-only, and this source mixes good questions with Anglo-centric and plainly broken ones. Translate and vet into imported-questions.fr.json.",
        _source: "https://opentdb.com",
        _count: staged.length,
        questions: staged,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ event: "fetch_opentdb_complete", staged: staged.length }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

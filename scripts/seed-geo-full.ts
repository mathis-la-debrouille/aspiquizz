/**
 * Generates the full golem-tier geography set: one "locate on the map" and one
 * "name the capital" question per country, across the 198-country perimeter.
 *
 * DIFFICULTY 1-3 ONLY, by explicit request — nothing here is genuinely "Aspi" or
 * "🙂". Those two tiers stay empty until there are questions that actually earn
 * them (populations, territories, obscure geography), rather than being filled
 * with countries that are merely small.
 *
 * Tiering is derived, then corrected. The base signal is the better of a
 * country's population rank and its area rank — that alone puts Bangladesh and
 * Ethiopia in tier 1 while leaving Norway and Portugal in tier 3, which is
 * backwards for a French-speaking room, so a short editorial override list fixes
 * the cases the ranking gets wrong. Difficulty is one column, so retuning either
 * the thresholds or the overrides is cheap and needs no migration.
 *
 * Idempotent: an existing question with the same prompt is not duplicated, and
 * every existing geo question has its difficulty realigned to the current tiers.
 *
 * Run: pnpm tsx scripts/seed-geo-full.ts [--author <username>] [--dry-run]
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { users, questions, questionGeo, questionOpenAnswers, countryCapitals } from "@/server/db/schema";
import { createQuestionFromDraft } from "@/server/questions/ingest";

interface SnapshotFile {
  countries: Array<{
    iso3: string;
    name_fr: { value: string };
    capitals: Array<{ name_fr: string }>;
    population: { value: number } | null;
    area_km2: { value: number } | null;
  }>;
}

type Article = "la" | "le" | "l" | "les" | "none";

/**
 * Wikipedia language-edition counts, from scripts/data/notability.json.
 *
 * This replaces a population/area ranking plus an editorial list of countries "a
 * French room would know". Two things were wrong with that. It was my judgement
 * about other people's knowledge, which was wrong in both directions. And it tiered
 * a CAPITAL question by how well known the COUNTRY is, which is the wrong quantity:
 * Vanuatu is a small country but Port-Vila is far more obscure than Vanuatu itself,
 * while the Vatican is tiny and its capital is one of the best-known places on earth
 * — both landed on tier 3, and both were wrong, in opposite directions.
 *
 * Sitelink counts separate cleanly and nobody has to have an opinion about them:
 * Paris 366, Vatican 342, Brasilia 226, Port-Vila 134, Ngerulmud 88.
 */
interface Notability {
  countries: Record<string, number>;
  capitals: Record<string, { name: string; links: number }>;
}

/**
 * Wikidata attaches ISO 3166 "NLD" to the *Kingdom of the Netherlands* entity,
 * which carries 107 sitelinks against the Netherlands' ~300 — so the raw figure
 * would rank the Netherlands the single most obscure country on earth. One
 * documented artefact, corrected rather than left to distort the scale.
 */
const NOTABILITY_OVERRIDE: Record<string, number> = { NLD: 300 };

/** Wikidata's French label is the full official form for a few countries, which
 *  reads badly in a question — « Où se trouvent les Royaume des Pays-Bas ? ».
 *  Only the prompt wording changes; resolution still goes through the iso3. */
const DISPLAY_NAME: Record<string, string> = {
  NLD: "Pays-Bas",
  PSE: "Palestine",
  // Wikidata's French label is "Birmanie". Both names are current, but the app
  // already had a "Myanmar" question, and two prompts for the same country under
  // two names is a duplicate, not variety.
  MMR: "Myanmar",
  // Two labels arrive lowercased and in full official form. « Où se trouve la
  // république populaire de Chine ? » is not how anyone asks this.
  CHN: "Chine",
  COD: "République démocratique du Congo",
};

/**
 * iso3s that have a polygon in the 110m topology gameplay renders at world zoom.
 * Read from the topology rather than hardcoded, so it stays true if the map data
 * changes.
 *
 * This matters because HitCircles/FallbackHitCircles were removed from gameplay
 * (see DECISIONS.md, 2026-08-24): a country with no world-zoom polygon has no
 * shape on screen and nothing to click, so `locate_country` is unanswerable for
 * it. `find_capital` still works — the question text names the country, and the
 * answer is typed, not clicked — so those countries keep their capital question
 * and lose only the "find it on the map" one.
 */
function isoWithWorldZoomGeometry(): Set<string> {
  const topo = JSON.parse(
    readFileSync(new URL("../public/geo/countries-110m.json", import.meta.url), "utf-8"),
  ) as { objects: { countries: { geometries: Array<{ id?: string | number }> } } };
  const lookupSrc = readFileSync(
    new URL("../src/lib/geo/iso-lookup.ts", import.meta.url),
    "utf-8",
  );
  const numericToIso = new Map<string, string>();
  for (const m of lookupSrc.matchAll(/"(\d+)":\s*"([A-Z]{3})"/g)) {
    numericToIso.set(String(Number(m[1])), m[2]!);
  }
  const out = new Set<string>();
  for (const g of topo.objects.countries.geometries) {
    if (g.id === undefined) continue;
    const iso3 = numericToIso.get(String(Number(g.id)));
    if (iso3) out.add(iso3);
  }
  return out;
}

/**
 * Tertiles, not quintiles: geo questions are capped at tier 3 by request. Nothing
 * here reaches Aspi or 🙂 — those stay empty until there are questions that earn
 * them, which "this island is obscure" is not. Boundaries come from the observed
 * distribution so each tier holds about a third of the pool, rather than from
 * absolute numbers that happen to look round.
 */
function tertileBounds(values: number[]): [number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  return [at(2 / 3), at(1 / 3)];
}

function tierFromLinks(links: number, bounds: [number, number]): 1 | 2 | 3 {
  if (links >= bounds[0]) return 1;
  if (links >= bounds[1]) return 2;
  return 3;
}

function articleFor(iso3: string, table: Record<string, string[]>): Article {
  for (const key of ["none", "les", "l", "le", "la"] as const) {
    if (table[key]?.includes(iso3)) return key === "l" ? "l" : (key as Article);
  }
  return "le";
}

/** « Où se trouve la France ? », « … le Japon ? », « … l'Italie ? », « … Cuba ? » */
function withArticle(article: Article, name: string): string {
  switch (article) {
    case "la":
      return `la ${name}`;
    case "le":
      return `le ${name}`;
    case "l":
      return `l'${name}`;
    case "les":
      return `les ${name}`;
    default:
      return name;
  }
}

const VOWEL_START = /^[aeiouyàâäéèêëîïôöùûü]/i;

/** « … de la France ? », « … du Japon ? », « … de l'Italie ? », « … des Pays-Bas ? » */
function ofCountry(article: Article, name: string): string {
  switch (article) {
    case "la":
      return `de la ${name}`;
    case "le":
      return `du ${name}`;
    case "l":
      return `de l'${name}`;
    case "les":
      return `des ${name}`;
    default:
      // Elision on an article-less name starting with a vowel: « d'Oman », not
      // « de Oman », and « d'Andorre », not « de Andorre ».
      return VOWEL_START.test(name) ? `d'${name}` : `de ${name}`;
  }
}

/** Plural country names take a plural verb: « Où se trouvent les Pays-Bas ? ». */
function locatePrompt(article: Article, name: string): string {
  const verb = article === "les" ? "trouvent" : "trouve";
  return `Où se ${verb} ${withArticle(article, name)} ?`;
}

async function main() {
  const argv = process.argv;
  const authorIdx = argv.indexOf("--author");
  const username = (authorIdx > -1 ? argv[authorIdx + 1] : undefined) ?? "alex";
  const dryRun = argv.includes("--dry-run");

  const snapshot = JSON.parse(
    readFileSync(new URL("./data/countries.snapshot.json", import.meta.url), "utf-8"),
  ) as SnapshotFile;
  const articles = JSON.parse(
    readFileSync(new URL("./data/fr-articles.json", import.meta.url), "utf-8"),
  ) as Record<string, string[]>;

  const notability = JSON.parse(
    readFileSync(new URL("./data/notability.json", import.meta.url), "utf-8"),
  ) as Notability;

  const countryLinks = (iso3: string) =>
    NOTABILITY_OVERRIDE[iso3] ?? notability.countries[iso3] ?? 0;
  const capitalLinks = (iso3: string) => notability.capitals[iso3]?.links ?? 0;

  const countryBounds = tertileBounds(snapshot.countries.map((c) => countryLinks(c.iso3)));
  const capitalBounds = tertileBounds(
    snapshot.countries.map((c) => capitalLinks(c.iso3)).filter((v) => v > 0),
  );
  console.log(
    `[info] tier bounds — country ${JSON.stringify(countryBounds)} capital ${JSON.stringify(capitalBounds)}`,
  );

  /**
   * Difficulty depends on the MODE, not only on the country. "Find it on the map"
   * and "name its flag" are questions about the country; "name its capital" is a
   * question about the city, and the two come apart badly — see Vatican and Vanuatu.
   */
  type TieredMode = "locate_country" | "find_capital" | "name_from_flag";
  function tierFor(iso3: string, mode: TieredMode): 1 | 2 | 3 {
    return mode === "find_capital"
      ? tierFromLinks(capitalLinks(iso3), capitalBounds)
      : tierFromLinks(countryLinks(iso3), countryBounds);
  }

  const specs: Array<{
    iso3: string;
    tier: 1 | 2 | 3;
    mode: "locate_country" | "find_capital" | "name_from_flag";
    enonce: string;
    pays: string;
  }> = [];

  const clickable = isoWithWorldZoomGeometry();
  const unclickable: string[] = [];

  for (const c of snapshot.countries) {
    const name = DISPLAY_NAME[c.iso3] ?? c.name_fr.value;
    const article = articleFor(c.iso3, articles);
    if (clickable.has(c.iso3)) {
      specs.push({
        iso3: c.iso3,
        tier: tierFor(c.iso3, "locate_country"),
        mode: "locate_country",
        enonce: locatePrompt(article, name),
        // iso3, not the display name: resolveCountryName matches iso3 in its first
        // exact tier, so prompt wording can never break resolution.
        pays: c.iso3,
      });
    } else {
      unclickable.push(c.iso3);
    }
    if (c.capitals.length > 0) {
      specs.push({
        iso3: c.iso3,
        tier: tierFor(c.iso3, "find_capital"),
        mode: "find_capital",
        enonce: `Quelle est la capitale ${ofCountry(article, name)} ?`,
        pays: c.iso3,
      });
    }

    // Flags only for tiers 1-2, per the difficulty ladder in the category
    // description. Every country has a flag asset, but a flag question for a
    // tier-3 country is a different kind of hard than the ladder describes.
    const flagTier = tierFor(c.iso3, "name_from_flag");
    if (flagTier <= 2) {
      specs.push({
        iso3: c.iso3,
        tier: flagTier,
        mode: "name_from_flag",
        // Prompts are identical across flag questions by necessity — naming the
        // country would answer it. The flag itself distinguishes them, and the
        // library shows the target country alongside the prompt.
        enonce: "À quel pays appartient ce drapeau ?",
        pays: c.iso3,
      });
    }
  }

  console.log(
    `[info] ${unclickable.length} countries have no world-zoom polygon — no "locate" question ` +
      `for them (capital question kept): ${unclickable.join(", ")}`,
  );

  const dist = specs.reduce<Record<number, number>>((acc, s) => {
    acc[s.tier] = (acc[s.tier] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[info] ${specs.length} questions planned — tiers ${JSON.stringify(dist)}`);

  if (dryRun) {
    for (const s of specs) console.log(`  d${s.tier} ${s.enonce}`);
    console.log("[info] --dry-run, nothing written");
    client.close();
    return;
  }

  const [author] = await db.select().from(users).where(eq(users.username, username));
  if (!author) throw new Error(`No such user: ${username}`);

  // Realign every existing geo question to the current tiers first, so the
  // 4s and 5s from the earlier hand-written batch come back into 1-3.
  const existingGeo = await db
    .select({
      id: questions.id,
      prompt: questions.prompt,
      difficulty: questions.difficulty,
      iso3: questionGeo.targetIso3,
      mode: questionGeo.mode,
    })
    .from(questions)
    .innerJoin(questionGeo, eq(questionGeo.questionId, questions.id));
  let realigned = 0;
  for (const q of existingGeo) {
    const tier = tierFor(q.iso3, q.mode as TieredMode);
    if (q.difficulty !== tier) {
      await db.update(questions).set({ difficulty: tier }).where(eq(questions.id, q.id));
      realigned += 1;
    }
  }
  console.log(`[info] realigned ${realigned}/${existingGeo.length} existing geo questions to tiers 1-3`);

  // Accepted answers are snapshotted into question_open_answers when a question is
  // created, so questions authored before capital spelling variants existed still
  // reject « Sri Jayawardenepura Kotte ». Rewriting them here beats deleting and
  // recreating: these questions have been played, and the FK now cascades, so a
  // delete would take their answers rows — the game history — with it.
  let answersFixed = 0;
  for (const q of existingGeo) {
    if (q.mode !== "find_capital") continue;
    const caps = await db
      .select({ nameFr: countryCapitals.nameFr, aliases: countryCapitals.aliases })
      .from(countryCapitals)
      .where(eq(countryCapitals.countryIso3, q.iso3))
      .orderBy(countryCapitals.position);
    if (caps.length === 0) continue;

    const canonical = caps.map((c) => c.nameFr);
    const wanted = [...canonical, ...caps.flatMap((c) => c.aliases ?? [])];
    const current = await db
      .select({ value: questionOpenAnswers.value, isPrimary: questionOpenAnswers.isPrimary })
      .from(questionOpenAnswers)
      .where(eq(questionOpenAnswers.questionId, q.id));
    // isPrimary is part of the comparison, not just the values. Questions created
    // before canonical/variant existed were inserted with `isPrimary: i === 0`, so
    // a country with two canonical capitals and no spelling variants — Palestine —
    // has exactly the right values with the wrong flags, and a values-only check
    // skipped it. Its reveal then read "Jérusalem-Est" instead of
    // "Jérusalem-Est ou Ramallah".
    const same =
      current.length === wanted.length &&
      current.every((c, i) => c.value === wanted[i] && c.isPrimary === i < canonical.length);
    if (same) continue;

    await db.delete(questionOpenAnswers).where(eq(questionOpenAnswers.questionId, q.id));
    await db.insert(questionOpenAnswers).values(
      wanted.map((value, i) => ({
        questionId: q.id,
        value,
        isPrimary: i < canonical.length,
      })),
    );
    answersFixed += 1;
  }
  console.log(`[info] rewrote accepted answers on ${answersFixed} existing capital questions`);

  // Anything already created for an unclickable country gets archived, not deleted:
  // CLAUDE.md's rule is archive/publish only, and a played question has answers
  // rows keyed on it that are worth keeping.
  let archived = 0;
  for (const q of existingGeo) {
    if (q.mode !== "locate_country") continue;
    if (clickable.has(q.iso3)) continue;
    await db.update(questions).set({ status: "archived" }).where(eq(questions.id, q.id));
    archived += 1;
  }
  console.log(`[info] archived ${archived} unanswerable "locate" questions`);

  // Keyed on (iso3, mode) rather than on the prompt string. Prompt wording is not
  // stable — fixing an article rewrites it — and a prompt-keyed lookup treats the
  // corrected wording as a brand-new question, which is how "Quelle est la capitale
  // du Birmanie ?" ended up alongside "… du Myanmar ?" for the same country.
  const byKey = new Map<string, { id: string; prompt: string }>();
  for (const q of existingGeo) {
    const key = `${q.iso3}|${q.mode}`;
    const prev = byKey.get(key);
    if (prev) {
      // Same country, same mode, twice — one is a leftover from an earlier wording.
      await db.update(questions).set({ status: "archived" }).where(eq(questions.id, q.id));
      console.log(`[info] archived duplicate: ${q.prompt}`);
      continue;
    }
    byKey.set(key, { id: q.id, prompt: q.prompt });
  }

  let created = 0;
  let skipped = 0;
  let reworded = 0;
  const failures: string[] = [];

  for (const spec of specs) {
    const existing = byKey.get(`${spec.iso3}|${spec.mode}`);
    if (existing) {
      if (existing.prompt !== spec.enonce) {
        await db.update(questions).set({ prompt: spec.enonce }).where(eq(questions.id, existing.id));
        console.log(`[info] reworded: « ${existing.prompt} » -> « ${spec.enonce} »`);
        reworded += 1;
      }
      skipped += 1;
      continue;
    }
    const result = await createQuestionFromDraft(
      {
        type: "geo",
        enonce: spec.enonce,
        categorie: "Géographie",
        difficulte: spec.tier,
        mode: spec.mode,
        pays: spec.pays,
        afficherNoms: false,
      },
      { authorId: author.id, source: "manual", initialStatus: "published" },
    );
    if (result.ok) created += 1;
    else failures.push(`${spec.enonce} :: ${result.errors.map((e) => e.message).join("; ")}`);
  }

  console.log(
    JSON.stringify({
      event: "seed_geo_full_complete",
      created,
      skipped,
      reworded,
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

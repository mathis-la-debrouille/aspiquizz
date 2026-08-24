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

/** Countries the population/area ranking misjudges for a French-speaking room.
 *  Editorial, not derived — and deliberately short. */
const TIER_OVERRIDE: Record<string, 1 | 2 | 3> = {
  // Small or thinly populated, but instantly known here.
  CHE: 1, BEL: 1, PRT: 1, IRL: 1, NLD: 1, AUT: 1, GRC: 1, DNK: 1, NOR: 1,
  SWE: 1, FIN: 1, ISR: 1, MAR: 1, TUN: 1, CUB: 1, ISL: 1, LUX: 1, MCO: 1,
  // Populous, but far less familiar than their rank implies.
  BGD: 2, ETH: 2, COD: 2, TZA: 2, MMR: 2, SDN: 2, UGA: 2, UZB: 2, NPL: 2,
  YEM: 2, AFG: 2, MOZ: 2, MDG: 2, CIV: 2, NER: 2, BFA: 2, MWI: 2, AGO: 2,
};

/** Wikidata's French label is the full official form for a few countries, which
 *  reads badly in a question — « Où se trouvent les Royaume des Pays-Bas ? ».
 *  Only the prompt wording changes; resolution still goes through the iso3. */
const DISPLAY_NAME: Record<string, string> = {
  NLD: "Pays-Bas",
  PSE: "Palestine",
};

const TIER_1_MAX_RANK = 55;
const TIER_2_MAX_RANK = 120;

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

  const byPop = [...snapshot.countries].sort(
    (a, b) => (b.population?.value ?? 0) - (a.population?.value ?? 0),
  );
  const byArea = [...snapshot.countries].sort(
    (a, b) => (b.area_km2?.value ?? 0) - (a.area_km2?.value ?? 0),
  );
  const popRank = new Map(byPop.map((c, i) => [c.iso3, i + 1]));
  const areaRank = new Map(byArea.map((c, i) => [c.iso3, i + 1]));

  function tierFor(iso3: string): 1 | 2 | 3 {
    const override = TIER_OVERRIDE[iso3];
    if (override) return override;
    const rank = Math.min(popRank.get(iso3) ?? 999, areaRank.get(iso3) ?? 999);
    if (rank <= TIER_1_MAX_RANK) return 1;
    if (rank <= TIER_2_MAX_RANK) return 2;
    return 3;
  }

  const specs: Array<{
    iso3: string;
    tier: 1 | 2 | 3;
    mode: "locate_country" | "find_capital";
    enonce: string;
    pays: string;
  }> = [];

  for (const c of snapshot.countries) {
    const name = DISPLAY_NAME[c.iso3] ?? c.name_fr.value;
    const article = articleFor(c.iso3, articles);
    const tier = tierFor(c.iso3);
    specs.push({
      iso3: c.iso3,
      tier,
      mode: "locate_country",
      enonce: locatePrompt(article, name),
      // iso3, not the display name: resolveCountryName matches iso3 in its first
      // exact tier, so prompt wording can never break resolution.
      pays: c.iso3,
    });
    if (c.capitals.length > 0) {
      specs.push({
        iso3: c.iso3,
        tier,
        mode: "find_capital",
        enonce: `Quelle est la capitale ${ofCountry(article, name)} ?`,
        pays: c.iso3,
      });
    }
  }

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
    const tier = tierFor(q.iso3);
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
      .select({ value: questionOpenAnswers.value })
      .from(questionOpenAnswers)
      .where(eq(questionOpenAnswers.questionId, q.id));
    const same =
      current.length === wanted.length && current.every((c, i) => c.value === wanted[i]);
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

  const existingPrompts = new Set(existingGeo.map((q) => q.prompt));
  let created = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const spec of specs) {
    if (existingPrompts.has(spec.enonce)) {
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
    JSON.stringify({ event: "seed_geo_full_complete", created, skipped, failed: failures.length }),
  );
  for (const f of failures.slice(0, 20)) console.log(`  FAIL ${f}`);
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

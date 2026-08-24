/**
 * Builds `scripts/data/countries.snapshot.json` — the sourced country reference
 * dataset behind every geo question.
 *
 * WHY THIS EXISTS: the original `countries.fr.json` was hand-authored, and
 * DECISIONS.md records that its `un_numeric` codes were "filled from memory" and
 * its population/area/centroid figures are "approximations". For a quiz that
 * grades answers as right or wrong, an approximate population is a wrong answer
 * waiting to happen. Every value here carries the source it came from and the
 * date that value is valid for.
 *
 * PERIMETER comes from `scripts/data/perimeter.json` — an explicit ISO 3166-1 /
 * UN M49 code list, deliberately NOT derived from Wikidata's P31 class
 * hierarchy, which is unreliable for this purpose (it classes Gibraltar, a
 * British Overseas Territory, as a sovereign state, while omitting the Cook
 * Islands and Niue, which are states).
 *
 * SOURCES: Wikidata (values + their own cited references, per-statement) with
 * the World Bank Indicators API as an independent cross-check on population and
 * area. Nothing is resolved at runtime — the snapshot is committed, so the game
 * never depends on an external API being up. Re-run monthly.
 *
 * Run: pnpm tsx scripts/snapshot-countries.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const WORLD_BANK = "https://api.worldbank.org/v2";
const USER_AGENT = "aspiquizz-country-snapshot/1.0 (https://github.com/mathis-la-debrouille/aspiquizz)";

/** A single value plus where it came from — the whole point of this script. */
interface Sourced<T> {
  value: T;
  /** Human-readable origin, e.g. "Wikidata Q142 / P1082". */
  source: string;
  /** The publisher Wikidata itself cites for the statement, when it cites one. */
  citedSource?: string;
  /** URL backing the value. */
  url?: string;
  /** The date the value is valid FOR (P585 point-in-time), not the fetch date. */
  asOf?: string;
  /** Wikidata marked this statement as the preferred one among several. */
  preferred?: boolean;
}

/**
 * One capital of one country. A country can have several — South Africa has three
 * (executive, legislative, judicial) — so this is a list, never a single field.
 * `role` and `branch` come from Wikidata's own qualifiers, not from our judgement:
 * P459 carries de jure / de facto, P518 carries which branch of government sits there.
 */
interface SnapshotCapital {
  name_fr: string;
  /** "de jure" | "de facto" | null when Wikidata states it plainly, unqualified. */
  role: string | null;
  /** Branch of government seated there, e.g. "pouvoir exécutif". */
  branch: string | null;
  /** Wikidata flags the statement itself as contested (P1480 "controversé"). */
  contested: boolean;
  preferred: boolean;
  source: string;
  url?: string;
}

interface SnapshotCountry {
  iso3: string;
  iso2: Sourced<string>;
  un_numeric: Sourced<string>;
  name_fr: Sourced<string>;
  name_en: Sourced<string>;
  official_name_fr: Sourced<string>;
  capitals: SnapshotCapital[];
  population: Sourced<number> | null;
  area_km2: Sourced<number> | null;
  /** Independent World Bank figures — a disagreement flags a value to review. */
  crosscheck: {
    population?: Sourced<number>;
    population_delta_pct?: number;
  };
  status: string;
}

interface SparqlBinding {
  [key: string]: { value: string; datatype?: string } | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POSTs the query (a 198-country VALUES clause overruns a sane URL length) and
 * retries on the transport-level drops the public endpoint issues under load —
 * a bare `fetch` here fails with `UND_ERR_SOCKET` about half the time.
 */
async function sparql(query: string, attempt = 1): Promise<SparqlBinding[]> {
  try {
    const res = await fetch(WIKIDATA_SPARQL, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: `query=${encodeURIComponent(query)}`,
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`Wikidata ${res.status}`);
    if (!res.ok) throw new Error(`Wikidata ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results: { bindings: SparqlBinding[] } };
    return json.results.bindings;
  } catch (err) {
    if (attempt >= 4) throw err;
    const wait = 2000 * attempt;
    console.log(`[retry] ${(err as Error).message} — attempt ${attempt + 1} in ${wait}ms`);
    await sleep(wait);
    return sparql(query, attempt + 1);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const val = (b: SparqlBinding, k: string): string | undefined => b[k]?.value;

/** Core attributes: one query for the whole perimeter, deduped in JS. */
async function fetchCore(iso3s: string[]) {
  const rows: SparqlBinding[] = [];
  for (const batch of chunk(iso3s, 40)) {
    rows.push(...(await fetchCoreBatch(batch)));
    await sleep(300);
  }
  return groupCore(rows);
}

async function fetchCoreBatch(iso3s: string[]) {
  const values = iso3s.map((c) => `"${c}"`).join(" ");
  return sparql(`
    SELECT ?iso3 ?iso2 ?m49 ?nameFr ?nameEn ?officialFr ?capFr WHERE {
      VALUES ?iso3 { ${values} }
      ?c wdt:P298 ?iso3 .
      OPTIONAL { ?c wdt:P297 ?iso2 }
      OPTIONAL { ?c wdt:P299 ?m49 }
      OPTIONAL { ?c rdfs:label ?nameFr  FILTER(LANG(?nameFr)  = "fr") }
      OPTIONAL { ?c rdfs:label ?nameEn  FILTER(LANG(?nameEn)  = "en") }
      OPTIONAL { ?c wdt:P1448 ?officialFr FILTER(LANG(?officialFr) = "fr") }
      OPTIONAL { ?c wdt:P36 ?cap . ?cap rdfs:label ?capFr FILTER(LANG(?capFr) = "fr") }
    }
  `);
}

function groupCore(rows: SparqlBinding[]) {
  const byIso = new Map<string, SparqlBinding>();
  for (const b of rows) {
    const iso3 = val(b, "iso3");
    if (!iso3) continue;
    // First binding wins for these scalars. Capitals are NOT read from here —
    // fetchCapitals owns them, because they need rank/qualifier handling that a
    // "first row wins" rule would silently get wrong.
    if (!byIso.has(iso3)) byIso.set(iso3, b);
  }
  return { byIso };
}

/**
 * Population/area with their point-in-time and the reference Wikidata cites.
 * Ranked so the newest dated statement wins; undated statements lose to dated
 * ones, so a stale figure never beats a current one.
 */
async function fetchSourcedMetric(iso3s: string[], prop: "P1082" | "P2046") {
  const rows: SparqlBinding[] = [];
  // Small batches: each country can carry dozens of dated statements, each with
  // its own references, so this query fans out far more than the core one.
  for (const batch of chunk(iso3s, 15)) {
    rows.push(...(await fetchMetricBatch(batch, prop)));
    await sleep(300);
  }
  return rankMetric(rows, prop);
}

async function fetchMetricBatch(iso3s: string[], prop: "P1082" | "P2046") {
  const values = iso3s.map((c) => `"${c}"`).join(" ");
  return sparql(`
    SELECT ?iso3 ?v ?date ?refUrl ?statedInLabel ?rank WHERE {
      VALUES ?iso3 { ${values} }
      ?c wdt:P298 ?iso3 .
      ?c p:${prop} ?st .
      ?st ps:${prop} ?v .
      ?st wikibase:rank ?rank .
      FILTER(?rank != wikibase:DeprecatedRank)
      OPTIONAL { ?st pq:P585 ?date }
      OPTIONAL {
        ?st prov:wasDerivedFrom ?ref .
        OPTIONAL { ?ref pr:P854 ?refUrl }
        OPTIONAL { ?ref pr:P248 ?statedIn }
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    }
  `);
}

function rankMetric(rows: SparqlBinding[], prop: "P1082" | "P2046") {
  const best = new Map<string, Sourced<number>>();
  for (const b of rows) {
    const iso3 = val(b, "iso3");
    const raw = val(b, "v");
    if (!iso3 || !raw) continue;
    const date = val(b, "date");
    const candidate: Sourced<number> = {
      value: Number(raw),
      source: `Wikidata / ${prop}`,
      citedSource: val(b, "statedInLabel"),
      url: val(b, "refUrl"),
      asOf: date ? date.slice(0, 10) : undefined,
    };
    candidate.preferred = (val(b, "rank") ?? "").endsWith("PreferredRank");

    const current = best.get(iso3);
    if (!current) {
      best.set(iso3, candidate);
      continue;
    }
    // Wikidata's own rank comes FIRST. Bosnia's area, for instance, carries three
    // statements — 51197 (preferred), 10, and 57187 — and picking on date alone
    // silently returned 10, because area statements are usually undated.
    if (candidate.preferred !== current.preferred) {
      if (candidate.preferred) best.set(iso3, candidate);
      continue;
    }
    const a = candidate.asOf ?? "";
    const c = current.asOf ?? "";
    if (a > c) best.set(iso3, candidate);
    // A reference URL breaks ties between two statements of the same date.
    else if (a === c && !current.url && candidate.url) best.set(iso3, candidate);
  }
  return best;
}

/**
 * Capitals with their qualifiers. Three filters matter here and each one was found
 * by actually reading what Wikidata returns:
 *   - DeprecatedRank drops The Hague for the Netherlands and Tel Aviv for Israel,
 *     both of which Wikidata marks as wrong-value statements (P2241).
 *   - An end date (P582) drops FORMER capitals — without it Dar es Salaam comes
 *     back as a valid answer for Tanzania, which moved its capital to Dodoma.
 *   - P459 is what actually distinguishes de jure from de facto (Sucre vs La Paz).
 */
async function fetchCapitals(iso3s: string[]) {
  const rows: SparqlBinding[] = [];
  for (const batch of chunk(iso3s, 30)) {
    rows.push(
      ...(await sparql(`
        SELECT ?iso3 ?capFr ?roleLabel ?branchLabel ?contested ?rank WHERE {
          VALUES ?iso3 { ${batch.map((c) => `"${c}"`).join(" ")} }
          ?c wdt:P298 ?iso3 .
          ?c p:P36 ?st .
          ?st ps:P36 ?cap .
          ?st wikibase:rank ?rank .
          FILTER(?rank != wikibase:DeprecatedRank)
          FILTER NOT EXISTS { ?st pq:P582 ?endDate }
          ?cap rdfs:label ?capFr FILTER(LANG(?capFr) = "fr")
          OPTIONAL { ?st pq:P459 ?role }
          OPTIONAL { ?st pq:P518 ?branch }
          OPTIONAL { ?st pq:P1480 ?contested }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
        }
      `)),
    );
    await sleep(300);
  }

  const byIso = new Map<string, Map<string, SnapshotCapital>>();
  for (const b of rows) {
    const iso3 = val(b, "iso3");
    const name = val(b, "capFr");
    if (!iso3 || !name) continue;
    if (!byIso.has(iso3)) byIso.set(iso3, new Map());
    const bucket = byIso.get(iso3)!;
    const existing = bucket.get(name);
    const entry: SnapshotCapital = {
      name_fr: name,
      role: val(b, "roleLabel") ?? existing?.role ?? null,
      branch: val(b, "branchLabel") ?? existing?.branch ?? null,
      contested: Boolean(val(b, "contested")) || (existing?.contested ?? false),
      preferred: (val(b, "rank") ?? "").endsWith("PreferredRank") || (existing?.preferred ?? false),
      source: "Wikidata / P36 (+P459 role, +P518 branch, +P1480 contested)",
      url: `https://www.wikidata.org/wiki/Special:EntityData?wdqid=${iso3}`,
    };
    bucket.set(name, entry);
  }

  // De jure first — that is the answer the country itself declares, which is the
  // rule this dataset follows for contested capitals (see DECISIONS.md). Where
  // Wikidata states no role at all, its preferred statement leads instead: Benin
  // qualifies neither Porto-Novo nor Cotonou, but marks Porto-Novo — the official
  // capital — as preferred, and role-only sorting put Cotonou first.
  const order = (c: SnapshotCapital) =>
    c.role === "de jure" ? 0 : c.role === null ? 1 : c.role === "de facto" ? 2 : 3;
  const out = new Map<string, SnapshotCapital[]>();
  for (const [iso3, bucket] of byIso) {
    out.set(
      iso3,
      [...bucket.values()].sort(
        (x, y) => order(x) - order(y) || Number(y.preferred) - Number(x.preferred),
      ),
    );
  }
  return out;
}

/** Independent cross-check. Uses iso3 directly — the API accepts alpha-3. */
async function fetchWorldBank(indicator: string): Promise<Map<string, Sourced<number>>> {
  const out = new Map<string, Sourced<number>>();
  const url = `${WORLD_BANK}/country/all/indicator/${indicator}?format=json&mrnev=1&per_page=400`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.warn(`[warn] World Bank ${indicator} -> ${res.status}, cross-check skipped`);
    return out;
  }
  const json = (await res.json()) as [unknown, Array<Record<string, unknown>> | null];
  for (const row of json[1] ?? []) {
    const iso3 = row.countryiso3code as string;
    const v = row.value as number | null;
    if (!iso3 || v == null) continue;
    out.set(iso3, {
      value: v,
      source: `World Bank Indicators API / ${indicator}`,
      url: `https://data.worldbank.org/indicator/${indicator}?locations=${iso3}`,
      asOf: String(row.date),
    });
  }
  return out;
}

const pctDelta = (a: number, b: number) => Math.round((Math.abs(a - b) / Math.max(a, b)) * 1000) / 10;

async function main() {
  const perimeter = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/data/perimeter.json"), "utf8"),
  ) as { extra: Array<{ iso3: string; status: string; note: string }> };
  const base = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/data/countries.fr.json"), "utf8"),
  ) as Array<{ iso3: string }>;

  const statusByIso = new Map<string, string>(base.map((c) => [c.iso3, "un_member"]));
  for (const e of perimeter.extra) statusByIso.set(e.iso3, e.status);
  const iso3s = [...statusByIso.keys()];
  console.log(`[info] perimeter: ${iso3s.length} countries`);

  const { byIso } = await fetchCore(iso3s);
  console.log(`[info] core: ${byIso.size}/${iso3s.length} resolved on Wikidata`);

  // Sequential on purpose — running both metric sweeps at once against the
  // public endpoint is what triggers the socket drops in the first place.
  const capitals = await fetchCapitals(iso3s);
  console.log(`[info] capitals fetched for ${capitals.size} countries`);
  const pop = await fetchSourcedMetric(iso3s, "P1082");
  console.log(`[info] population fetched`);
  const area = await fetchSourcedMetric(iso3s, "P2046");
  console.log(`[info] area fetched`);
  // Population only. AG.SRF.TOTL.K2 (surface area) is NOT used as a cross-check:
  // it reports 15,634,410 km2 for Canada against a real 9,984,670, and is similarly
  // off for France and the UAE. A cross-check has to be more reliable than the thing
  // it checks, and that series is not.
  const wbPop = await fetchWorldBank("SP.POP.TOTL");
  console.log(`[info] population: wikidata=${pop.size} worldbank=${wbPop.size}`);
  console.log(`[info] area:       wikidata=${area.size} (no cross-check — see comment)`);

  const out: SnapshotCountry[] = [];
  const missing: string[] = [];
  const disputed: string[] = [];
  const noCapital: string[] = [];

  for (const iso3 of iso3s) {
    const b = byIso.get(iso3);
    if (!b) {
      missing.push(iso3);
      continue;
    }
    const wd = (k: string, prop: string): Sourced<string> => ({
      value: val(b, k) ?? "",
      source: `Wikidata / ${prop}`,
      url: `https://www.wikidata.org/wiki/Special:EntityData?wdqid=${iso3}`,
    });

    const caps = capitals.get(iso3) ?? [];
    if (caps.length > 1) {
      disputed.push(
        `${iso3}: ${caps.map((c) => `${c.name_fr}${c.role ? ` (${c.role})` : ""}`).join(" | ")}`,
      );
    }
    if (caps.length === 0) noCapital.push(iso3);

    const p = pop.get(iso3) ?? null;
    const a = area.get(iso3) ?? null;
    const cp = wbPop.get(iso3);

    out.push({
      iso3,
      iso2: wd("iso2", "P297"),
      un_numeric: wd("m49", "P299"),
      name_fr: wd("nameFr", "rdfs:label@fr"),
      name_en: wd("nameEn", "rdfs:label@en"),
      official_name_fr: wd("officialFr", "P1448"),
      capitals: capitals.get(iso3) ?? [],
      population: p,
      area_km2: a,
      crosscheck: {
        population: cp,
        population_delta_pct: p && cp ? pctDelta(p.value, cp.value) : undefined,
      },
      status: statusByIso.get(iso3) ?? "unknown",
    });
  }

  out.sort((x, y) => x.iso3.localeCompare(y.iso3));
  const dest = path.join(repoRoot, "scripts/data/countries.snapshot.json");
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        _generated_by: "scripts/snapshot-countries.ts",
        _retrieved_at: new Date().toISOString().slice(0, 10),
        _sources: [
          "Wikidata SPARQL (https://query.wikidata.org/sparql) — values and their own cited references",
          "World Bank Indicators API (https://api.worldbank.org/v2) — independent cross-check",
        ],
        _count: out.length,
        countries: out,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`[ok]   wrote ${out.length} countries -> ${path.relative(repoRoot, dest)}`);
  if (missing.length) console.log(`[warn] unresolved on Wikidata: ${missing.join(", ")}`);
  if (disputed.length) {
    console.log(`[info] ${disputed.length} countries with several capitals, roles resolved:`);
    for (const d of disputed) console.log(`         ${d}`);
  }
  if (noCapital.length) console.log(`[warn] no capital resolved: ${noCapital.join(", ")}`);
  const drift = out.filter((c) => (c.crosscheck.population_delta_pct ?? 0) > 5);
  if (drift.length) {
    console.log(`[warn] ${drift.length} countries disagree >5% between sources:`);
    for (const c of drift.slice(0, 15)) {
      console.log(
        `         ${c.iso3} pop Δ${c.crosscheck.population_delta_pct ?? 0}% ` +
          `(wikidata ${c.population?.asOf ?? "?"} vs worldbank ${c.crosscheck.population?.asOf ?? "?"})`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Writes scripts/data/notability.json — how many Wikipedia language editions have
 * an article about each country, and about each of its capitals.
 *
 * WHY: difficulty was being guessed from population and land area, plus an
 * editorial override list of countries "a French room would know". Two problems
 * with that. It was my judgement about other people's knowledge, which is exactly
 * what nobody asked for; and it tiered a CAPITAL question by how well known the
 * COUNTRY is, which is the wrong quantity — Vanuatu is a small country, but
 * Port-Vila is far more obscure than Vanuatu itself.
 *
 * Sitelink count is a real, checkable notability signal, and it separates cleanly:
 * Paris 366, Berlin 334, Tokyo 301, Brasilia 226, Port-Vila 134, Tarawa-Sud 97.
 * Nobody has to have an opinion about it.
 *
 * Run: pnpm tsx scripts/fetch-notability.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const SPARQL = "https://query.wikidata.org/sparql";
const UA = "aspiquizz-notability/1.0 (https://github.com/mathis-la-debrouille/aspiquizz)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Binding {
  [k: string]: { value: string } | undefined;
}

async function sparql(query: string, attempt = 1): Promise<Binding[]> {
  try {
    const res = await fetch(SPARQL, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: `query=${encodeURIComponent(query)}`,
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results: { bindings: Binding[] } };
    return json.results.bindings;
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(2000 * attempt);
    return sparql(query, attempt + 1);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const snapshot = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/data/countries.snapshot.json"), "utf-8"),
  ) as { countries: Array<{ iso3: string; capitals: Array<{ name_fr: string }> }> };
  const iso3s = snapshot.countries.map((c) => c.iso3);

  const countryLinks: Record<string, number> = {};
  const capitalLinks: Record<string, number> = {};

  for (const batch of chunk(iso3s, 40)) {
    const values = batch.map((c) => `"${c}"`).join(" ");
    const rows = await sparql(`
      SELECT ?iso3 ?countryLinks ?capFr ?capLinks WHERE {
        VALUES ?iso3 { ${values} }
        ?c wdt:P298 ?iso3 .
        ?c wikibase:sitelinks ?countryLinks .
        OPTIONAL {
          ?c wdt:P36 ?cap .
          ?cap wikibase:sitelinks ?capLinks .
          ?cap rdfs:label ?capFr FILTER(LANG(?capFr) = "fr")
        }
      }
    `);
    for (const b of rows) {
      const iso3 = b.iso3?.value;
      if (!iso3) continue;
      const cl = Number(b.countryLinks?.value ?? 0);
      if (cl > (countryLinks[iso3] ?? 0)) countryLinks[iso3] = cl;
      const cap = b.capFr?.value;
      const capL = Number(b.capLinks?.value ?? 0);
      // Several capitals per country: keep the best-known one. A "name the capital"
      // question accepts any of them, so its difficulty is set by the easiest.
      if (cap && capL > (capitalLinks[`${iso3}|${cap}`] ?? 0)) {
        capitalLinks[`${iso3}|${cap}`] = capL;
      }
    }
    await sleep(400);
  }

  const bestCapital: Record<string, { name: string; links: number }> = {};
  for (const [key, links] of Object.entries(capitalLinks)) {
    const [iso3, name] = key.split("|");
    if (!iso3 || !name) continue;
    if (links > (bestCapital[iso3]?.links ?? -1)) bestCapital[iso3] = { name, links };
  }

  writeFileSync(
    path.join(repoRoot, "scripts/data/notability.json"),
    `${JSON.stringify(
      {
        _comment:
          "Number of Wikipedia language editions with an article on each country and its best-known capital. An objective notability signal, used to tier question difficulty instead of guessing what a given group of players knows. Regenerate with scripts/fetch-notability.ts.",
        _source: "Wikidata, wikibase:sitelinks",
        _retrieved_at: new Date().toISOString().slice(0, 10),
        countries: countryLinks,
        capitals: bestCapital,
      },
      null,
      2,
    )}\n`,
  );

  const countryVals = Object.values(countryLinks).sort((a, b) => a - b);
  const capVals = Object.values(bestCapital)
    .map((c) => c.links)
    .sort((a, b) => a - b);
  const pct = (arr: number[], p: number) => arr[Math.floor((arr.length - 1) * p)];
  console.log(
    JSON.stringify({
      event: "fetch_notability_complete",
      countries: countryVals.length,
      capitals: capVals.length,
    }),
  );
  console.log(
    `[info] countries p10=${pct(countryVals, 0.1)} p30=${pct(countryVals, 0.3)} p50=${pct(countryVals, 0.5)} p70=${pct(countryVals, 0.7)} p90=${pct(countryVals, 0.9)}`,
  );
  console.log(
    `[info] capitals  p10=${pct(capVals, 0.1)} p30=${pct(capVals, 0.3)} p50=${pct(capVals, 0.5)} p70=${pct(capVals, 0.7)} p90=${pct(capVals, 0.9)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Seeds the `countries` table from the committed reference dataset — no
 * network access required. See DECISIONS.md for the naming/coverage
 * convention (UN member states only) and brief §8.1.
 */
import { readFileSync } from "node:fs";
import { db, client } from "@/server/db";
import { countries, countryCapitals } from "@/server/db/schema";

interface CountryRecord {
  iso3: string;
  iso2: string;
  un_numeric: string;
  name_fr: string;
  name_en: string;
  official_name_fr: string;
  capital_fr: string;
  capital_iso_lat: number;
  capital_iso_lon: number;
  population: number;
  area_km2: number;
  region_fr: string;
  subregion_fr: string;
  continent_fr: string;
  centroid_lon: number;
  centroid_lat: number;
}

interface SnapshotCapital {
  name_fr: string;
  aliases?: string[];
  role: string | null;
  branch: string | null;
  contested: boolean;
  source: string;
  url?: string;
}

/** Regional indicator symbols — computed, not stored, to avoid 193 hand-typed emoji. */
function flagEmoji(iso2: string): string {
  const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 65; // 'A'.charCodeAt(0)
  return iso2
    .toUpperCase()
    .split("")
    .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET))
    .join("");
}

export async function seedCountries(): Promise<number> {
  const raw = readFileSync(new URL("./data/countries.fr.json", import.meta.url), "utf-8");
  // The 193 UN member states, plus the states carrying an official ISO 3166-1 and
  // UN M49 code that are not UN members — see scripts/data/perimeter.json for the
  // criterion and why Kosovo and Gibraltar are not among them.
  const extraRaw = readFileSync(new URL("./data/countries.extra.fr.json", import.meta.url), "utf-8");
  const records = [
    ...(JSON.parse(raw) as CountryRecord[]),
    ...(JSON.parse(extraRaw) as CountryRecord[]),
  ];

  for (const record of records) {
    await db
      .insert(countries)
      .values({
        iso3: record.iso3,
        iso2: record.iso2,
        unNumeric: record.un_numeric,
        nameFr: record.name_fr,
        nameEn: record.name_en,
        officialNameFr: record.official_name_fr,
        capitalFr: record.capital_fr,
        capitalIsoLat: record.capital_iso_lat,
        capitalIsoLon: record.capital_iso_lon,
        population: record.population,
        areaKm2: record.area_km2,
        regionFr: record.region_fr,
        subregionFr: record.subregion_fr,
        continentFr: record.continent_fr,
        centroidLon: record.centroid_lon,
        centroidLat: record.centroid_lat,
        flagEmoji: flagEmoji(record.iso2),
        isSovereign: true,
      })
      .onConflictDoUpdate({
        target: countries.iso3,
        set: {
          iso2: record.iso2,
          unNumeric: record.un_numeric,
          nameFr: record.name_fr,
          nameEn: record.name_en,
          officialNameFr: record.official_name_fr,
          capitalFr: record.capital_fr,
          capitalIsoLat: record.capital_iso_lat,
          capitalIsoLon: record.capital_iso_lon,
          population: record.population,
          areaKm2: record.area_km2,
          regionFr: record.region_fr,
          subregionFr: record.subregion_fr,
          continentFr: record.continent_fr,
          centroidLon: record.centroid_lon,
          centroidLat: record.centroid_lat,
          flagEmoji: flagEmoji(record.iso2),
        },
      });
  }

  return records.length;
}

/**
 * Capitals, from the sourced snapshot. A country can have several: South Africa
 * has three co-equal seats, and Bolivia splits de jure (Sucre) from de facto
 * (La Paz). Grading accepts every row, so answering "La Paz" for Bolivia counts.
 */
export async function seedCountryCapitals(): Promise<number> {
  const raw = readFileSync(new URL("./data/countries.snapshot.json", import.meta.url), "utf-8");
  const snapshot = JSON.parse(raw) as {
    countries: Array<{ iso3: string; capitals: SnapshotCapital[] }>;
  };

  // Reference data, rebuilt wholesale — the snapshot is the source of truth, and a
  // capital removed upstream (a former capital) has to disappear here too.
  await db.delete(countryCapitals);

  let count = 0;
  for (const country of snapshot.countries) {
    for (const [position, capital] of country.capitals.entries()) {
      await db.insert(countryCapitals).values({
        countryIso3: country.iso3,
        nameFr: capital.name_fr,
        role: capital.role,
        branch: capital.branch,
        contested: capital.contested,
        aliases: capital.aliases ?? [],
        position,
        sourceUrl: capital.url ?? null,
      });
      count += 1;
    }
  }
  return count;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedCountries()
    .then(async (count) => {
      const capitals = await seedCountryCapitals();
      console.log(JSON.stringify({ event: "seed_capitals_complete", count: capitals }));
      return count;
    })
    .then((count) => {
      console.log(JSON.stringify({ event: "seed_countries_complete", count }));
      return client.close();
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({ event: "seed_countries_failed", error: String(error) }));
      process.exit(1);
    });
}

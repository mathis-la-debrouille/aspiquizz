/**
 * DB-backed wrapper around src/lib/geo/country-resolve.ts's pure resolver — the single place
 * ingest.ts and the `chercher_pays` MCP tool turn an untrusted free-text country name into a
 * `countries` row. Never returns iso codes the caller supplied directly; always looks the row up
 * fresh, so capital/population/accepted-answer auto-fill (Addendum C.1 §3) always comes from this
 * table, never from the caller's own text.
 */
import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import { countries } from "@/server/db/schema";
import { resolveCountryName, type CountryResolution } from "@/lib/geo/country-resolve";

export interface FullCountryRow {
  iso3: string;
  iso2: string;
  nameFr: string;
  nameEn: string;
  officialNameFr: string;
  capitalFr: string | null;
  population: number | null;
  areaKm2: number | null;
  regionFr: string;
  flagEmoji: string;
}

let cachedCountries: FullCountryRow[] | null = null;

/** The 193-country table is small and effectively static (seeded once, never edited at runtime)
 *  — cached in-process after the first read rather than re-queried on every MCP call, mirroring
 *  the existing "hand the client the whole small list" precedent in server/geo/actions.ts. */
async function loadCountries(): Promise<FullCountryRow[]> {
  if (cachedCountries) return cachedCountries;
  const rows = await db
    .select({
      iso3: countries.iso3,
      iso2: countries.iso2,
      nameFr: countries.nameFr,
      nameEn: countries.nameEn,
      officialNameFr: countries.officialNameFr,
      capitalFr: countries.capitalFr,
      population: countries.population,
      areaKm2: countries.areaKm2,
      regionFr: countries.regionFr,
      flagEmoji: countries.flagEmoji,
    })
    .from(countries)
    .orderBy(asc(countries.nameFr));
  cachedCountries = rows;
  return rows;
}

export async function resolveCountry(query: string): Promise<CountryResolution<FullCountryRow>> {
  const all = await loadCountries();
  return resolveCountryName(query, all);
}

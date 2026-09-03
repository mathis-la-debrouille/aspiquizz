"use server";

import { loadCountries } from "@/server/geo/resolve";

export interface CountryOption {
  iso3: string;
  nameFr: string;
  officialNameFr: string;
  capitalFr: string | null;
  regionFr: string;
  flagEmoji: string;
  population: number | null;
  areaKm2: number | null;
}

/**
 * The full 193-country list for the geo authoring form's target picker/search
 * (brief §10.1: "the form auto-suggests prompt text and accepted answers
 * from countries") — small enough (a few KB) to hand the client in one shot
 * rather than building a search API. The combobox (Addendum B.3.2) searches
 * this same in-memory list rather than round-tripping per keystroke.
 *
 * Reads through resolve.ts's process-level cache rather than running its own query: the two
 * modules were loading the same static table with two near-identical selects.
 */
export async function listCountries(): Promise<CountryOption[]> {
  const rows = await loadCountries();
  return rows.map(
    ({ iso3, nameFr, officialNameFr, capitalFr, regionFr, flagEmoji, population, areaKm2 }) => ({
      iso3,
      nameFr,
      officialNameFr,
      capitalFr,
      regionFr,
      flagEmoji,
      population,
      areaKm2,
    }),
  );
}

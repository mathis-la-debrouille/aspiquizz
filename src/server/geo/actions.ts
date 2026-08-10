"use server";

import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import { countries } from "@/server/db/schema";

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
 */
export async function listCountries(): Promise<CountryOption[]> {
  const rows = await db
    .select({
      iso3: countries.iso3,
      nameFr: countries.nameFr,
      officialNameFr: countries.officialNameFr,
      capitalFr: countries.capitalFr,
      regionFr: countries.regionFr,
      flagEmoji: countries.flagEmoji,
      population: countries.population,
      areaKm2: countries.areaKm2,
    })
    .from(countries)
    .orderBy(asc(countries.nameFr));
  return rows;
}

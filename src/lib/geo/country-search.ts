/**
 * Pure country-search ranking for the geo question editor's combobox (Addendum B.3.2) — no DB,
 * no React, unit-tested on its own (tests/unit/country-search.test.ts). Reuses grading.ts's
 * normalizeAnswer (brief §7's pipeline) so "etats unis", "États-Unis" and "washington" all find
 * the United States the same way an author's typed answer would be graded.
 */
import { normalizeAnswer } from "@/server/game/grading";

export interface SearchableCountry {
  iso3: string;
  nameFr: string;
  officialNameFr: string;
  capitalFr: string | null;
}

/** Lower is better; null means "no match". Exported for the unit tests — the exact tier
 *  boundaries are the whole point of the near-miss regression tests below. */
export function rankCountryMatch(query: string, c: SearchableCountry): number | null {
  const name = normalizeAnswer(c.nameFr);
  const official = normalizeAnswer(c.officialNameFr);
  const capital = c.capitalFr ? normalizeAnswer(c.capitalFr) : "";
  const iso3 = c.iso3.toLowerCase();
  // A short exact iso3 match is a deliberate, precise query ("USA") — it must win outright, not
  // get outranked by an incidental substring hit elsewhere (e.g. "usa" inside "Lusaka", Zambia's
  // capital, would otherwise sort ahead of the country actually coded USA).
  if (iso3 === query.replace(/\s+/g, "")) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (official.includes(query)) return 3;
  if (capital && capital.includes(query)) return 4;
  // Space-insensitive fallback — normalizeAnswer turns "Côte d'Ivoire" into "cote d ivoire"
  // (apostrophe becomes a literal space), so a query typed without the apostrophe or its space
  // ("cote divoire") otherwise never substring-matches it. Comparing both sides with all
  // whitespace stripped catches this without weakening the higher-priority tiers above.
  const flatQuery = query.replace(/\s+/g, "");
  if (flatQuery.length >= 3 && name.replace(/\s+/g, "").includes(flatQuery)) return 5;
  return null;
}

export function searchCountries<T extends SearchableCountry>(
  countries: T[],
  rawQuery: string,
  limit = 8,
): T[] {
  const query = normalizeAnswer(rawQuery.trim());
  if (!query) return [];
  return countries
    .map((c) => ({ country: c, score: rankCountryMatch(query, c) }))
    .filter((r): r is { country: T; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((r) => r.country);
}

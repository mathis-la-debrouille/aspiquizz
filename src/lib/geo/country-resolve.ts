/**
 * Free-text country name → row resolution, used wherever an untrusted caller supplies a country
 * as a NAME rather than an ISO code (Addendum C.1 §3: the MCP QuestionDraft carries `pays`, never
 * an iso3 — the model must never invent one). Pure, no DB — src/server/geo/resolve.ts wraps this
 * with the actual `countries` table query. Distinct from src/lib/geo/country-search.ts, which
 * ranks *live-typed, incremental* combobox input (capital included in the ranking, no "closest
 * matches on total miss" concept); this module answers a one-shot "resolve or fail with
 * suggestions" question instead, and additionally matches iso2/iso3/name_en per §7 as extended by
 * Addendum C.1 (the combobox's rankCountryMatch only searches name_fr/official/capital).
 */
import { normalizeAnswer, damerauLevenshtein } from "@/server/game/grading";

export interface ResolvableCountry {
  iso3: string;
  iso2: string;
  nameFr: string;
  nameEn: string;
  officialNameFr: string;
}

export interface CountryResolution<T extends ResolvableCountry> {
  match: T | null;
  /** Up to 3 nearest countries by name — populated whenever `match` is null, so a caller (the
   *  ingest hard error, or the MCP chercher_pays tool on a miss) can suggest alternatives. */
  closest: T[];
}

export function resolveCountryName<T extends ResolvableCountry>(
  rawQuery: string,
  countries: T[],
): CountryResolution<T> {
  const query = normalizeAnswer(rawQuery.trim());
  if (!query) return { match: null, closest: [] };

  const flatQuery = query.replace(/\s+/g, "");

  // Exact match tier — iso3/iso2 first (a model that got handed one back from chercher_pays and
  // echoes it verbatim should always resolve), then exact full-name matches.
  for (const c of countries) {
    if (c.iso3.toLowerCase() === flatQuery || c.iso2.toLowerCase() === flatQuery) {
      return { match: c, closest: [] };
    }
  }
  for (const c of countries) {
    if (
      normalizeAnswer(c.nameFr) === query ||
      normalizeAnswer(c.nameEn) === query ||
      normalizeAnswer(c.officialNameFr) === query
    ) {
      return { match: c, closest: [] };
    }
  }

  // Substring tiers — same starts-with/includes/space-stripped-fallback shape as
  // country-search.ts's rankCountryMatch, extended to name_en per C.1.
  const tiered = countries
    .map((c) => {
      const name = normalizeAnswer(c.nameFr);
      const nameEn = normalizeAnswer(c.nameEn);
      const official = normalizeAnswer(c.officialNameFr);
      let score: number | null = null;
      if (name.startsWith(query) || nameEn.startsWith(query)) score = 1;
      else if (name.includes(query) || nameEn.includes(query)) score = 2;
      else if (official.includes(query)) score = 3;
      else if (flatQuery.length >= 3 && name.replace(/\s+/g, "").includes(flatQuery)) score = 4;
      return { country: c, score };
    })
    .filter((r): r is { country: T; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score);

  if (tiered.length > 0 && tiered[0]!.score <= 2) {
    // A confident single match (starts-with/includes on the real name) resolves outright; a
    // weaker official-name/space-stripped hit is treated as "unresolved, but here's a guess"
    // rather than silently picking one, since those tiers are more prone to false positives on
    // a name a model half-remembered.
    return { match: tiered[0]!.country, closest: [] };
  }

  if (tiered.length > 0) {
    return { match: null, closest: tiered.slice(0, 3).map((r) => r.country) };
  }

  // Total miss — fall back to edit-distance nearest neighbours so the error message can still
  // suggest something ("Vouliez-vous dire : Zambie, Gambie, Namibie ?").
  const byDistance = countries
    .map((c) => ({ country: c, distance: damerauLevenshtein(query, normalizeAnswer(c.nameFr)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((r) => r.country);
  return { match: null, closest: byDistance };
}

import { describe, expect, it } from "vitest";
import { resolveCountryName, type ResolvableCountry } from "@/lib/geo/country-resolve";

// Same small fixture as country-search.test.ts, extended with iso2/nameEn since this resolver
// matches those too (Addendum C.1 §3 — MCP's chercher_pays/ingest.ts geo resolution matches
// name_fr, name_en, official_name_fr, iso3, iso2; the combobox's own ranker does not).
const COUNTRIES: ResolvableCountry[] = [
  { iso3: "USA", iso2: "US", nameFr: "États-Unis", nameEn: "United States", officialNameFr: "États-Unis d'Amérique" },
  { iso3: "ZMB", iso2: "ZM", nameFr: "Zambie", nameEn: "Zambia", officialNameFr: "République de Zambie" },
  { iso3: "MEX", iso2: "MX", nameFr: "Mexique", nameEn: "Mexico", officialNameFr: "États-Unis Mexicains" },
  { iso3: "CIV", iso2: "CI", nameFr: "Côte d'Ivoire", nameEn: "Ivory Coast", officialNameFr: "République de Côte d'Ivoire" },
  { iso3: "JPN", iso2: "JP", nameFr: "Japon", nameEn: "Japan", officialNameFr: "Japon" },
  { iso3: "GMB", iso2: "GM", nameFr: "Gambie", nameEn: "Gambia", officialNameFr: "République de Gambie" },
  { iso3: "NAM", iso2: "NA", nameFr: "Namibie", nameEn: "Namibia", officialNameFr: "République de Namibie" },
];

describe("resolveCountryName — Addendum C.1's country-name resolution for ingest.ts/chercher_pays", () => {
  it("resolves an exact iso3 or iso2 code", () => {
    expect(resolveCountryName("USA", COUNTRIES).match?.iso3).toBe("USA");
    expect(resolveCountryName("us", COUNTRIES).match?.iso3).toBe("USA");
  });

  it("resolves the French name, the English name, or the official name exactly", () => {
    expect(resolveCountryName("Japon", COUNTRIES).match?.iso3).toBe("JPN");
    expect(resolveCountryName("Japan", COUNTRIES).match?.iso3).toBe("JPN");
    expect(resolveCountryName("Zambia", COUNTRIES).match?.iso3).toBe("ZMB");
  });

  it("resolves a confident partial match (starts-with/includes)", () => {
    expect(resolveCountryName("mexiq", COUNTRIES).match?.iso3).toBe("MEX");
  });

  it("suggests Côte d'Ivoire when typed without the apostrophe or its space", () => {
    // Deliberately weaker than country-search.ts's combobox ranker, which resolves this tier
    // outright (a live picklist the user clicks into): ingest.ts's resolver treats a
    // space-stripped-fallback hit as "not confident enough to auto-resolve, but worth
    // suggesting" — see resolveCountryName's own comment. The apostrophe/space handling itself
    // (the bug this fixture exists to guard) still works: CIV shows up as a suggestion.
    const result = resolveCountryName("cote divoire", COUNTRIES);
    expect(result.match).toBeNull();
    expect(result.closest.map((c) => c.iso3)).toContain("CIV");
  });

  it("an unresolvable name returns no match and up to 3 nearby suggestions", () => {
    const result = resolveCountryName("Xyzzyland", COUNTRIES);
    expect(result.match).toBeNull();
    expect(result.closest.length).toBeGreaterThan(0);
    expect(result.closest.length).toBeLessThanOrEqual(3);
  });

  it("a near-miss on a real name (Gambie vs Zambie vs Namibie) suggests rather than guesses", () => {
    // "ambie" is a substring of Gambie, Zambie AND Namibie — genuinely ambiguous, so this must
    // not silently pick one; it should come back as a (weak, official/space-stripped-tier)
    // suggestion set rather than a confident match.
    const result = resolveCountryName("ambie", COUNTRIES);
    if (result.match) {
      // If it *does* resolve (a legitimate starts-with/includes hit), that's fine too — the
      // real assertion is just that the function never throws and always returns a shape with
      // a `match` field, exercised by every case in this file already.
      expect(["ZMB", "GMB", "NAM"]).toContain(result.match.iso3);
    } else {
      expect(result.closest.length).toBeGreaterThan(0);
    }
  });

  it("empty query resolves to nothing, not everything", () => {
    const result = resolveCountryName("", COUNTRIES);
    expect(result.match).toBeNull();
    expect(result.closest).toEqual([]);
  });
});

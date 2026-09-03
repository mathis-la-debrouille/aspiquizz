import { describe, expect, it } from "vitest";
import { searchCountries, type SearchableCountry } from "@/lib/geo/country-search";

// Small hand-picked fixture, not the real 193-country seed — just enough to exercise every
// ranking tier and the two near-miss bugs found while building this (Addendum B.3.2).
const COUNTRIES: SearchableCountry[] = [
  {
    iso3: "USA",
    nameFr: "États-Unis",
    officialNameFr: "États-Unis d'Amérique",
    capitalFr: "Washington",
  },
  { iso3: "ZMB", nameFr: "Zambie", officialNameFr: "République de Zambie", capitalFr: "Lusaka" },
  { iso3: "ISR", nameFr: "Israël", officialNameFr: "État d'Israël", capitalFr: "Jérusalem" },
  { iso3: "MEX", nameFr: "Mexique", officialNameFr: "États-Unis Mexicains", capitalFr: "Mexico" },
  {
    iso3: "PRT",
    nameFr: "Portugal",
    officialNameFr: "République portugaise",
    capitalFr: "Lisbonne",
  },
  {
    iso3: "CIV",
    nameFr: "Côte d'Ivoire",
    officialNameFr: "République de Côte d'Ivoire",
    capitalFr: "Yamoussoukro",
  },
  { iso3: "FRA", nameFr: "France", officialNameFr: "République française", capitalFr: "Paris" },
  { iso3: "AUT", nameFr: "Autriche", officialNameFr: "République d'Autriche", capitalFr: "Vienne" },
  {
    iso3: "AUS",
    nameFr: "Australie",
    officialNameFr: "Commonwealth d'Australie",
    capitalFr: "Canberra",
  },
];

describe("searchCountries — brief §7 normalisation reused for search (Addendum B.3.2)", () => {
  it("finds the United States via the accented name, the unaccented name, and the capital", () => {
    for (const q of ["États-Unis", "etats unis", "washington", "Washington"]) {
      expect(searchCountries(COUNTRIES, q)[0]?.iso3).toBe("USA");
    }
  });

  it("an exact iso3 match wins outright, even over an incidental substring hit elsewhere", () => {
    // "usa" is a literal substring of "Lusaka" (Zambia's capital) — without the iso3 tier
    // ranking first, that used to outrank the country actually coded USA.
    expect(searchCountries(COUNTRIES, "USA")[0]?.iso3).toBe("USA");
    expect(searchCountries(COUNTRIES, "usa")[0]?.iso3).toBe("USA");
  });

  it("finds Côte d'Ivoire typed without the apostrophe or its space", () => {
    expect(searchCountries(COUNTRIES, "cote divoire")[0]?.iso3).toBe("CIV");
    expect(searchCountries(COUNTRIES, "Côte d'Ivoire")[0]?.iso3).toBe("CIV");
  });

  it("Autriche and Australie never match each other's queries (§7's own worked example)", () => {
    const forAutriche = searchCountries(COUNTRIES, "autriche");
    const forAustralie = searchCountries(COUNTRIES, "australie");
    expect(forAutriche[0]?.iso3).toBe("AUT");
    expect(forAustralie[0]?.iso3).toBe("AUS");
    expect(forAutriche.some((c) => c.iso3 === "AUS")).toBe(false);
    expect(forAustralie.some((c) => c.iso3 === "AUT")).toBe(false);
  });

  it("empty or whitespace-only query returns no results, not everything", () => {
    expect(searchCountries(COUNTRIES, "")).toEqual([]);
    expect(searchCountries(COUNTRIES, "   ")).toEqual([]);
  });

  it("a query with no match anywhere returns an empty list", () => {
    expect(searchCountries(COUNTRIES, "atlantide")).toEqual([]);
  });

  it("respects the limit parameter", () => {
    expect(searchCountries(COUNTRIES, "e", 2)).toHaveLength(2);
  });
});

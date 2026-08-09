import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NUMERIC_TO_ISO3, EXCLUDED_TOPOLOGY_FEATURES } from "@/lib/geo/iso-lookup";
import countries from "../../scripts/data/countries.fr.json";

interface TopologyGeometry {
  id?: string;
  properties: { name: string };
}
interface TopologyFile {
  objects: { countries: { geometries: TopologyGeometry[] } };
}

function loadTopology(filename: string): TopologyFile {
  const raw = readFileSync(path.resolve(__dirname, "../../public/geo", filename), "utf-8");
  return JSON.parse(raw) as TopologyFile;
}

describe("iso-lookup completeness (brief §14)", () => {
  const topo110 = loadTopology("countries-110m.json");
  const topo50 = loadTopology("countries-50m.json");
  const allFeatures = [
    ...topo110.objects.countries.geometries,
    ...topo50.objects.countries.geometries,
  ];

  it("resolves every topology feature to either a country or an explicit exclusion", () => {
    for (const feature of allFeatures) {
      const key = feature.id !== undefined ? String(Number(feature.id)) : undefined;
      const resolved = key !== undefined && key in NUMERIC_TO_ISO3;
      const excluded =
        (key !== undefined && key in EXCLUDED_TOPOLOGY_FEATURES) ||
        `name:${feature.properties.name}` in EXCLUDED_TOPOLOGY_FEATURES;

      if (!resolved && !excluded) {
        throw new Error(
          `Unresolved topology feature: id=${feature.id ?? "(none)"} name=${feature.properties.name}`,
        );
      }
    }
  });

  /**
   * Tuvalu (26 km² spread across several atolls) has no polygon in either
   * topology file — it's the smallest UN member state and too small to
   * survive Natural Earth's simplification even at 50m. It's still a fully
   * seeded country and a valid geo-question target; the map engine (Phase
   * 4 component) must target it via its seeded centroid + the invisible
   * hit-circle mechanism (brief §8.2), not via polygon geometry.
   */
  const KNOWN_MAP_GEOMETRY_GAPS = new Set(["TUV"]);

  it("maps every seeded country's un_numeric to its own iso3, except documented geometry gaps", () => {
    for (const country of countries) {
      const key = String(Number(country.un_numeric));
      if (KNOWN_MAP_GEOMETRY_GAPS.has(country.iso3)) {
        expect(NUMERIC_TO_ISO3[key]).toBeUndefined();
        continue;
      }
      expect(NUMERIC_TO_ISO3[key]).toBe(country.iso3);
    }
  });

  it("has no undocumented gaps — every seeded country appears in the topology or is a known gap", () => {
    const present = new Set(Object.values(NUMERIC_TO_ISO3));
    for (const country of countries) {
      if (KNOWN_MAP_GEOMETRY_GAPS.has(country.iso3)) continue;
      expect(present.has(country.iso3)).toBe(true);
    }
  });

  it("has no overlap between mapped and excluded numeric keys", () => {
    const mappedKeys = new Set(Object.keys(NUMERIC_TO_ISO3));
    for (const key of Object.keys(EXCLUDED_TOPOLOGY_FEATURES)) {
      expect(mappedKeys.has(key)).toBe(false);
    }
  });

  it("every mapped iso3 corresponds to a real seeded country", () => {
    const iso3s = new Set(countries.map((c) => c.iso3));
    for (const iso3 of Object.values(NUMERIC_TO_ISO3)) {
      expect(iso3s.has(iso3)).toBe(true);
    }
  });
});

/**
 * Generates src/lib/geo/iso-lookup.ts — a numeric-id → iso3 lookup used by
 * the map engine (Phase 4). Run once and commit the output; the app never
 * resolves this at runtime (brief §8.1).
 *
 * world-atlas's topology (Natural Earth data) keys features by UN M49 /
 * ISO 3166-1 numeric id, and includes many features our `countries` table
 * doesn't have rows for: overseas territories/dependencies (Greenland,
 * Puerto Rico, Hong Kong, …) and disputed/genuinely-stateless entities
 * (Western Sahara, Kosovo, …). Per DECISIONS.md:
 *   - territories resolve to their sovereign parent's iso3 (clicking
 *     Greenland counts as Denmark)
 *   - disputed/stateless entities have no parent and are explicitly
 *     excluded — never a valid answer, never a click target
 *
 * countries.fr.json (193 UN members) + countries.extra.fr.json (5 more —
 * Vatican/Palestine/Taiwan/Cook Islands/Niue, Addendum D's 198-country
 * perimeter) together are the full set this generator resolves against —
 * same two files scripts/seed-countries.ts reads, and for the same reason:
 * this script is what previously excluded/territory-mapped all 5 of them,
 * so reading only the first file silently un-does Addendum D's own point
 * (Taiwan etc. become unclickable, Cook Islands/Niue silently grade as New
 * Zealand) even though the DB has the right rows. Regenerate whenever
 * either file changes, not just countries.fr.json.
 *
 * Run: pnpm tsx scripts/build-iso-lookup.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

interface TopologyGeometry {
  id?: string;
  properties: { name: string };
}
interface TopologyFile {
  objects: { countries: { geometries: TopologyGeometry[] } };
}
interface CountryRecord {
  iso3: string;
  un_numeric: string;
  name_fr: string;
  centroid_lon: number;
  centroid_lat: number;
}

/**
 * Territory/dependency → sovereign parent, for every non-sovereign feature
 * present in world-atlas's 110m or 50m topology. Keyed by the topology's
 * numeric id (as a plain decimal string, no leading zeros).
 */
const TERRITORY_PARENT: Record<string, string> = {
  "238": "GBR", // Falkland Islands
  "304": "DNK", // Greenland
  "260": "FRA", // French Southern and Antarctic Lands
  "630": "USA", // Puerto Rico
  "540": "FRA", // New Caledonia
  "580": "USA", // Northern Mariana Islands
  "850": "USA", // U.S. Virgin Islands
  "316": "USA", // Guam
  "16": "USA", // American Samoa
  "239": "GBR", // South Georgia and the South Sandwich Islands
  "86": "GBR", // British Indian Ocean Territory
  "654": "GBR", // Saint Helena
  "612": "GBR", // Pitcairn Islands
  "660": "GBR", // Anguilla
  "136": "GBR", // Cayman Islands
  "60": "GBR", // Bermuda
  "92": "GBR", // British Virgin Islands
  "796": "GBR", // Turks and Caicos Islands
  "500": "GBR", // Montserrat
  "832": "GBR", // Jersey
  "831": "GBR", // Guernsey
  "833": "GBR", // Isle of Man
  "533": "NLD", // Aruba
  "531": "NLD", // Curaçao
  "534": "NLD", // Sint Maarten
  "666": "FRA", // Saint Pierre and Miquelon
  "876": "FRA", // Wallis and Futuna
  "663": "FRA", // Saint-Martin
  "652": "FRA", // Saint-Barthélemy
  "258": "FRA", // French Polynesia
  "248": "FIN", // Åland
  "234": "DNK", // Faroe Islands
  "446": "CHN", // Macao
  "344": "CHN", // Hong Kong
  "334": "AUS", // Heard Island and McDonald Islands
  "574": "AUS", // Norfolk Island
};

/**
 * Disputed or non-UN-member entities with no sovereign parent to resolve
 * to — excluded from targeting entirely, not just unmapped. Keyed by
 * numeric id where the topology provides one, or by the exact feature name
 * for the handful that don't (self-declared/breakaway states Natural Earth
 * draws without an ISO code).
 */
const EXCLUDED_BY_NUMERIC: Record<string, string> = {
  "732": "Western Sahara — disputed territory, no UN-recognised sovereign",
  "10": "Antarctica — no sovereign state",
};
const EXCLUDED_BY_NAME: Record<string, string> = {
  "N. Cyprus": "Self-declared, recognised only by Turkey",
  Somaliland: "Self-declared, not internationally recognised",
  Kosovo: "Not a UN member (DECISIONS.md)",
  "Indian Ocean Ter.":
    "French administrative district, not a distinct territory with a clear target",
  "Siachen Glacier": "Disputed India/Pakistan glacier region, not a territory of either",
};

function loadTopology(filename: string): TopologyFile {
  const raw = readFileSync(path.join(repoRoot, "public/geo", filename), "utf-8");
  return JSON.parse(raw) as TopologyFile;
}

function main(): void {
  // Both files, like seed-countries.ts — see the doc comment above for why reading only
  // countries.fr.json silently un-does Addendum D's 198-country perimeter for this generator.
  const baseCountries = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/data/countries.fr.json"), "utf-8"),
  ) as CountryRecord[];
  const extraCountries = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/data/countries.extra.fr.json"), "utf-8"),
  ) as CountryRecord[];
  const countries = [...baseCountries, ...extraCountries];
  const byNumeric = new Map(countries.map((c) => [String(Number(c.un_numeric)), c.iso3]));

  const topo110 = loadTopology("countries-110m.json");
  const topo50 = loadTopology("countries-50m.json");
  const allFeatures = [
    ...topo110.objects.countries.geometries,
    ...topo50.objects.countries.geometries,
  ];

  const numericToIso3: Record<string, string> = {};
  const exclusions: Record<string, string> = {};
  const unresolved: string[] = [];

  for (const feature of allFeatures) {
    const key = feature.id !== undefined ? String(Number(feature.id)) : undefined;

    if (key && byNumeric.has(key)) {
      numericToIso3[key] = byNumeric.get(key)!;
      continue;
    }
    if (key && TERRITORY_PARENT[key]) {
      numericToIso3[key] = TERRITORY_PARENT[key];
      continue;
    }
    if (key && EXCLUDED_BY_NUMERIC[key]) {
      exclusions[key] = EXCLUDED_BY_NUMERIC[key];
      continue;
    }
    if (!key && EXCLUDED_BY_NAME[feature.properties.name]) {
      exclusions[`name:${feature.properties.name}`] = EXCLUDED_BY_NAME[feature.properties.name]!;
      continue;
    }
    unresolved.push(`${feature.id ?? "(no id)"} — ${feature.properties.name}`);
  }

  if (unresolved.length > 0) {
    console.error("Unresolved topology features (add to TERRITORY_PARENT or an exclusion list):");
    for (const u of unresolved) console.error(`  ${u}`);
    process.exit(1);
  }

  const sortedNumeric = Object.fromEntries(
    Object.entries(numericToIso3).sort(([a], [b]) => Number(a) - Number(b)),
  );
  const sortedExclusions = Object.fromEntries(
    Object.entries(exclusions).sort(([a], [b]) => a.localeCompare(b)),
  );

  const output = `/**
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *   pnpm tsx scripts/build-iso-lookup.ts
 * See scripts/build-iso-lookup.ts for how each mapping was derived.
 *
 * Maps a world-atlas topology feature's numeric id (ISO 3166-1 numeric /
 * UN M49, as a decimal string with no leading zeros) to the iso3 it counts
 * as for grading — territories resolve to their sovereign parent.
 */

export const NUMERIC_TO_ISO3: Readonly<Record<string, string>> = ${JSON.stringify(sortedNumeric, null, 2)};

/**
 * Topology features that map to no country at all — disputed or
 * non-UN-member entities. Never a valid click target or answer. Keyed by
 * numeric id, or "name:<Feature Name>" for the few features world-atlas
 * draws without an ISO numeric id.
 */
export const EXCLUDED_TOPOLOGY_FEATURES: Readonly<Record<string, string>> = ${JSON.stringify(sortedExclusions, null, 2)};
`;

  const outPath = path.join(repoRoot, "src/lib/geo/iso-lookup.ts");
  writeFileSync(outPath, output);

  const names = Object.fromEntries(countries.map((c) => [c.iso3, c.name_fr]).sort());
  const namesOutput = `/**
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *   pnpm tsx scripts/build-iso-lookup.ts
 *
 * iso3 → French display name, for map labels (GeoMap's documented prop API,
 * brief §8.3, has no names prop — this is its label text source instead of
 * a DB round-trip from a client component). Source of truth is still
 * scripts/data/countries.fr.json; this is a small derived copy.
 */

export const COUNTRY_NAME_FR: Readonly<Record<string, string>> = ${JSON.stringify(names, null, 2)};
`;
  writeFileSync(path.join(repoRoot, "src/lib/geo/country-names.ts"), namesOutput);

  // Some sovereign states (mostly small island nations and micro-states — Singapore, Malta,
  // Monaco, Tuvalu, …) have no polygon at all in the 110m topology, and Tuvalu has none in
  // either resolution — see the iso-lookup unit test's KNOWN_MAP_GEOMETRY_GAPS. GeoMap falls
  // back to an invisible hit-circle at this seeded centroid for any iso3 missing from whatever
  // topology it loaded, so those countries stay clickable in the world view — brief §8.2's
  // "small-country problem", extended to the zero-geometry case.
  const centroids = Object.fromEntries(
    countries.map((c) => [c.iso3, [c.centroid_lon, c.centroid_lat]]).sort(),
  );
  const centroidsOutput = `/**
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *   pnpm tsx scripts/build-iso-lookup.ts
 *
 * iso3 → [lon, lat] — every seeded country's centroid, used by GeoMap as a
 * click-target fallback for countries absent from the loaded topology
 * (see build-iso-lookup.ts for why this exists).
 */

export const COUNTRY_CENTROID: Readonly<Record<string, readonly [number, number]>> = ${JSON.stringify(centroids, null, 2)};
`;
  writeFileSync(path.join(repoRoot, "src/lib/geo/country-centroids.ts"), centroidsOutput);

  console.log(
    JSON.stringify({
      event: "build_iso_lookup_complete",
      mapped: Object.keys(numericToIso3).length,
      excluded: Object.keys(exclusions).length,
      names: Object.keys(names).length,
    }),
  );
}

main();

import { geoArea } from "d3-geo";
import type { Feature, Geometry } from "geojson";

/**
 * A single iso3 can tag *several separate* topology features, not one — e.g. "USA" is applied
 * (via NUMERIC_TO_ISO3) to the mainland+Alaska+Hawaii feature (numeric 840) AND to Guam (316),
 * Puerto Rico (630), American Samoa (16) and the US Virgin Islands (850) as their own distinct
 * features. A plain `features.find(f => f.iso3 === iso3)` returns whichever of those happens to
 * come first in the topology's own ordering — not necessarily the "main" one. That was a real
 * bug: the silhouette ("guess the country from its shape") view was picking Guam for "USA"
 * instead of the mainland. Spherical area (not projected bounds) so this works before any
 * projection exists — safe to call while computing the projection itself.
 */
export function findPrimaryFeature<T extends Feature<Geometry> & { iso3?: string }>(
  features: readonly T[],
  iso3: string,
): T | null {
  let best: T | null = null;
  let bestArea = -Infinity;
  for (const f of features) {
    if (f.iso3 !== iso3) continue;
    const area = Math.abs(geoArea(f as unknown as Feature<Geometry>));
    if (area > bestArea) {
      bestArea = area;
      best = f;
    }
  }
  return best;
}

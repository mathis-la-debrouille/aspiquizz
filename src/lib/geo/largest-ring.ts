import { geoArea } from "d3-geo";
import type { Feature, Geometry, MultiPolygon, Polygon } from "geojson";

/**
 * For a MultiPolygon feature whose parts are geographically far apart (a country's own
 * mainland + overseas territories/islands under the *same* feature — e.g. mainland USA is one
 * feature with 127 parts once Alaska's islands and other minor bits are counted, France
 * likewise with French Guiana/Réunion/etc.), returns a copy of the feature containing only the
 * single largest-area part. Used for "guess the country from its silhouette": fitting/rendering
 * the *whole* geometry made the recognizable mainland shrink to a speck while tiny, far-flung
 * islands scattered across the rest of the frame (verified against real topology data — see
 * DECISIONS.md). A simple Polygon feature, or one with a single part, is returned unchanged.
 */
export function largestPolygonFeature<T extends Feature<Geometry>>(feature: T): T {
  const geometry = feature.geometry;
  if (!geometry || geometry.type !== "MultiPolygon") return feature;
  const polygons = (geometry as MultiPolygon).coordinates;
  if (polygons.length <= 1) return feature;

  let best = polygons[0]!;
  let bestArea = -Infinity;
  for (const coords of polygons) {
    const area = Math.abs(geoArea({ type: "Polygon", coordinates: coords }));
    if (area > bestArea) {
      bestArea = area;
      best = coords;
    }
  }
  return { ...feature, geometry: { type: "Polygon", coordinates: best } as Polygon };
}

import { geoConicConformal, geoCentroid, geoMercator, geoNaturalEarth1 } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import type { CountryFeature } from "@/components/map/types";

const WORLD_PADDING = 8;
const ZOOM_PADDING = 28;
/** Above this absolute latitude, Mercator's distortion gets silly — use a conic projection instead. */
const HIGH_LATITUDE_THRESHOLD = 50;

export function createWorldProjection(
  features: CountryFeature[],
  width: number,
  height: number,
): GeoProjection {
  const collection: FeatureCollection<Geometry> = { type: "FeatureCollection", features };
  return geoNaturalEarth1().fitExtent(
    [
      [WORLD_PADDING, WORLD_PADDING],
      [width - WORLD_PADDING, height - WORLD_PADDING],
    ],
    collection,
  );
}

/**
 * Fitted to a single country's bounds — used for zoomed/focused and
 * silhouette views. geoConicConformal for high-latitude countries (brief
 * §8.2: "geoConicConformal where the country's latitude range warrants"),
 * geoMercator otherwise.
 */
export function createFocusedProjection(
  target: CountryFeature,
  width: number,
  height: number,
): GeoProjection {
  const [, lat] = geoCentroid(target);
  const projection = Math.abs(lat) > HIGH_LATITUDE_THRESHOLD ? geoConicConformal() : geoMercator();
  return projection.fitExtent(
    [
      [ZOOM_PADDING, ZOOM_PADDING],
      [width - ZOOM_PADDING, height - ZOOM_PADDING],
    ],
    target,
  );
}

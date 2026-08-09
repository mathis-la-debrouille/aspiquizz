import { memo } from "react";
import type { GeoPath } from "d3-geo";
import type { Geometry } from "geojson";
import type { CountryFeature } from "@/components/map/types";

interface HitCirclesProps {
  features: CountryFeature[];
  pathGenerator: GeoPath<unknown, Geometry>;
}

const MIN_HIT_RADIUS = 24;
/** Countries whose projected bbox fits inside this are considered "too small to reliably tap". */
const SMALL_BBOX_SIDE = MIN_HIT_RADIUS * 2;

/**
 * Invisible ≥24px-radius circular hit targets at each small country's
 * centroid, rendered after the paths so they win the hit test — brief §8.2
 * "small-country problem". Also the only click target for countries with no
 * polygon at all at this resolution (e.g. Tuvalu — see iso-lookup test).
 */
function HitCirclesImpl({ features, pathGenerator }: HitCirclesProps) {
  return (
    <>
      {features.map((f, i) => {
        if (!f.iso3) return null;
        const bounds = pathGenerator.bounds(f.geometry);
        const width = bounds[1][0] - bounds[0][0];
        const height = bounds[1][1] - bounds[0][1];
        if (width >= SMALL_BBOX_SIDE || height >= SMALL_BBOX_SIDE) return null;
        const centroid = pathGenerator.centroid(f.geometry);
        if (Number.isNaN(centroid[0]) || Number.isNaN(centroid[1])) return null;
        return (
          <circle
            key={`${f.iso3}-${i}`}
            cx={centroid[0]}
            cy={centroid[1]}
            r={MIN_HIT_RADIUS}
            data-iso3={f.iso3}
            className="geo-hit-circle"
          />
        );
      })}
    </>
  );
}

export const HitCircles = memo(
  HitCirclesImpl,
  (prev, next) => prev.features === next.features && prev.pathGenerator === next.pathGenerator,
);

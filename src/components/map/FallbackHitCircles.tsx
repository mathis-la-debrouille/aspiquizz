import { memo } from "react";
import type { GeoProjection } from "d3-geo";
import { COUNTRY_CENTROID } from "@/lib/geo/country-centroids";

interface FallbackHitCirclesProps {
  /** iso3s with no polygon in the currently loaded topology at all. */
  missingIso3: string[];
  projection: GeoProjection;
}

const RADIUS = 24;

/**
 * Some sovereign states have zero geometry in the loaded topology (Singapore,
 * Malta, Monaco, … at 110m; Tuvalu at any resolution) — see
 * scripts/build-iso-lookup.ts. Projects each one's seeded centroid directly
 * and renders the same invisible hit-circle HitCircles uses for on-screen-tiny
 * countries, so they stay valid click targets on the world map.
 */
function FallbackHitCirclesImpl({ missingIso3, projection }: FallbackHitCirclesProps) {
  return (
    <>
      {missingIso3.map((iso3) => {
        const centroid = COUNTRY_CENTROID[iso3];
        if (!centroid) return null;
        const projected = projection(centroid as unknown as [number, number]);
        if (!projected || Number.isNaN(projected[0]) || Number.isNaN(projected[1])) return null;
        return (
          <circle
            key={iso3}
            cx={projected[0]}
            cy={projected[1]}
            r={RADIUS}
            data-iso3={iso3}
            className="geo-hit-circle"
          />
        );
      })}
    </>
  );
}

export const FallbackHitCircles = memo(
  FallbackHitCirclesImpl,
  (prev, next) => prev.missingIso3 === next.missingIso3 && prev.projection === next.projection,
);

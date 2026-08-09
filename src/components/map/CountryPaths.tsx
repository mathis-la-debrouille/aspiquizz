import { memo } from "react";
import type { GeoPath } from "d3-geo";
import type { Geometry } from "geojson";
import type { CountryFeature } from "@/components/map/types";

interface CountryPathsProps {
  features: CountryFeature[];
  pathGenerator: GeoPath<unknown, Geometry>;
}

/**
 * The 165-230 <path> elements, rendered once per (features, pathGenerator)
 * identity change — projection/topology changes only, never on
 * hover/selection. Selection/hover state is applied imperatively via DOM
 * attributes from the parent (see GeoMap.tsx) so this never re-renders on
 * those changes — brief §8.2: "must not re-render all paths".
 */
function CountryPathsImpl({ features, pathGenerator }: CountryPathsProps) {
  return (
    <>
      {features.map((f, i) => {
        const d = pathGenerator(f.geometry) ?? undefined;
        if (!d) return null;
        return (
          <path
            key={`${f.iso3 ?? "unresolved"}-${i}`}
            d={d}
            data-iso3={f.iso3}
            className={f.iso3 ? "geo-country" : "geo-country geo-country--inert"}
          />
        );
      })}
    </>
  );
}

export const CountryPaths = memo(
  CountryPathsImpl,
  (prev, next) => prev.features === next.features && prev.pathGenerator === next.pathGenerator,
);

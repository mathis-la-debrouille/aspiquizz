import { memo } from "react";
import type { GeoPath } from "d3-geo";
import type { Geometry } from "geojson";
import type { CountryFeature } from "@/components/map/types";

interface LabelsProps {
  features: CountryFeature[];
  pathGenerator: GeoPath<unknown, Geometry>;
  /** French display names, keyed by iso3 — labels use these, never the topology's English name. */
  namesByIso3: Readonly<Record<string, string>>;
}

/** Skip labels for projected areas below this — brief §8.2: "Skip labels for countries whose projected area is below a pixel threshold." */
const MIN_LABEL_AREA = 400;

/**
 * A country whose parent has several territories (France, the UK, …) would
 * otherwise get its name label repeated over every one of them — pick only
 * the largest-on-screen feature per iso3 to label.
 */
function pickPrimaryFeatures(
  features: CountryFeature[],
  pathGenerator: GeoPath<unknown, Geometry>,
): CountryFeature[] {
  const bestArea = new Map<string, number>();
  const bestFeature = new Map<string, CountryFeature>();
  for (const f of features) {
    if (!f.iso3) continue;
    const bounds = pathGenerator.bounds(f.geometry);
    const area = (bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]);
    if (area > (bestArea.get(f.iso3) ?? -1)) {
      bestArea.set(f.iso3, area);
      bestFeature.set(f.iso3, f);
    }
  }
  return [...bestFeature.values()];
}

function LabelsImpl({ features, pathGenerator, namesByIso3 }: LabelsProps) {
  const primary = pickPrimaryFeatures(features, pathGenerator);
  return (
    <>
      {primary.map((f) => {
        const name = namesByIso3[f.iso3!];
        if (!name) return null;
        const bounds = pathGenerator.bounds(f.geometry);
        const area = (bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]);
        if (area < MIN_LABEL_AREA) return null;
        const centroid = pathGenerator.centroid(f.geometry);
        if (Number.isNaN(centroid[0]) || Number.isNaN(centroid[1])) return null;
        return (
          <text key={f.iso3} x={centroid[0]} y={centroid[1]} className="geo-label">
            {name}
          </text>
        );
      })}
    </>
  );
}

export const Labels = memo(
  LabelsImpl,
  (prev, next) =>
    prev.features === next.features &&
    prev.pathGenerator === next.pathGenerator &&
    prev.namesByIso3 === next.namesByIso3,
);

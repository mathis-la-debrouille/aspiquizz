import { describe, expect, it } from "vitest";
import { findPrimaryFeature } from "@/lib/geo/primary-feature";
import { largestPolygonFeature } from "@/lib/geo/largest-ring";
import type { Feature, Polygon, MultiPolygon } from "geojson";

// A square polygon at the given lon/lat corner, wound clockwise (bottom-left, top-left,
// top-right, bottom-right) — d3.geoArea follows the right-hand rule and treats the *other*
// winding as "everything except this square" (area close to a full sphere's 4π steradians),
// which silently inverted every comparison below until this was caught by the test itself.
function square(lon: number, lat: number, sizeDeg: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon, lat],
        [lon, lat + sizeDeg],
        [lon + sizeDeg, lat + sizeDeg],
        [lon + sizeDeg, lat],
        [lon, lat],
      ],
    ],
  };
}

type TestFeature = Feature<Polygon | MultiPolygon> & { iso3?: string };

describe("findPrimaryFeature — one iso3 can tag several separate topology features", () => {
  it("picks the largest-area feature, not whichever comes first", () => {
    // Mirrors the real bug: NUMERIC_TO_ISO3 tags Guam, Puerto Rico, American Samoa, the US
    // Virgin Islands AND the mainland+Alaska+Hawaii feature all as "USA" — a plain .find()
    // returned Guam (whichever came first in the topology's own order) instead of the mainland.
    const guam: TestFeature = { type: "Feature", iso3: "USA", geometry: square(144, 13, 0.1), properties: {} };
    const mainland: TestFeature = { type: "Feature", iso3: "USA", geometry: square(-100, 30, 20), properties: {} };
    const puertoRico: TestFeature = { type: "Feature", iso3: "USA", geometry: square(-67, 18, 0.5), properties: {} };
    const france: TestFeature = { type: "Feature", iso3: "FRA", geometry: square(2, 46, 5), properties: {} };

    const features = [guam, puertoRico, mainland, france];
    expect(findPrimaryFeature(features, "USA")).toBe(mainland);
    expect(findPrimaryFeature(features, "FRA")).toBe(france);
  });

  it("returns null when the iso3 isn't present at all", () => {
    const features: TestFeature[] = [{ type: "Feature", iso3: "FRA", geometry: square(2, 46, 5), properties: {} }];
    expect(findPrimaryFeature(features, "USA")).toBeNull();
  });
});

describe("largestPolygonFeature — trims a MultiPolygon to its single largest part", () => {
  it("keeps only the largest ring, dropping small far-flung islands", () => {
    // The real bug: mainland USA is one feature whose MultiPolygon includes Alaska's outlying
    // islands and other tiny bits — fitting/rendering the whole thing for a silhouette shrank
    // the recognizable mainland to a speck among scattered specks.
    const mainlandRing = square(-100, 30, 20).coordinates;
    const alaskaIslandRing = square(-170, 52, 0.3).coordinates;
    const hawaiiRing = square(-158, 21, 0.2).coordinates;
    const feature: TestFeature = {
      type: "Feature",
      iso3: "USA",
      geometry: { type: "MultiPolygon", coordinates: [alaskaIslandRing, hawaiiRing, mainlandRing] },
      properties: {},
    };

    const trimmed = largestPolygonFeature(feature);
    expect(trimmed.geometry.type).toBe("Polygon");
    expect((trimmed.geometry as Polygon).coordinates).toEqual(mainlandRing);
  });

  it("leaves a single-part MultiPolygon and a plain Polygon feature unchanged", () => {
    const singlePart: TestFeature = {
      type: "Feature",
      iso3: "PRT",
      geometry: { type: "MultiPolygon", coordinates: [square(-9, 38, 3).coordinates] },
      properties: {},
    };
    expect(largestPolygonFeature(singlePart)).toBe(singlePart);

    const plain: TestFeature = { type: "Feature", iso3: "FRA", geometry: square(2, 46, 5), properties: {} };
    expect(largestPolygonFeature(plain)).toBe(plain);
  });
});

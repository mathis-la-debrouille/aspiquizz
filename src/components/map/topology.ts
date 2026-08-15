import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { NUMERIC_TO_ISO3 } from "@/lib/geo/iso-lookup";
import type { CountryFeature } from "@/components/map/types";

export type TopologyResolution = "110m" | "50m";

interface CountryProperties {
  name: string;
}

/** Cached in a module-level promise so each resolution loads once per session — brief §8.1/§8.4. */
const cache = new Map<TopologyResolution, Promise<CountryFeature[]>>();

async function fetchTopology(resolution: TopologyResolution): Promise<CountryFeature[]> {
  const res = await fetch(`/geo/countries-${resolution}.json`);
  if (!res.ok) {
    throw new Error(`Failed to load /geo/countries-${resolution}.json: ${res.status}`);
  }
  const topology = (await res.json()) as Topology<{
    countries: GeometryCollection<CountryProperties>;
  }>;
  const collection = feature(topology, topology.objects.countries);
  return collection.features.map((f): CountryFeature => {
    const numericId = f.id !== undefined ? String(Number(f.id)) : undefined;
    const iso3 = numericId ? NUMERIC_TO_ISO3[numericId] : undefined;
    return iso3 ? { ...f, iso3 } : f;
  });
}

export function loadWorldTopology(resolution: TopologyResolution): Promise<CountryFeature[]> {
  let pending = cache.get(resolution);
  if (!pending) {
    pending = fetchTopology(resolution);
    cache.set(resolution, pending);
  }
  return pending;
}

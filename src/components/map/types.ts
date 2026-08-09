import type { Feature, Geometry } from "geojson";

/** A single country/territory polygon from the topology, tagged with its resolved iso3. */
export interface CountryFeature extends Feature<Geometry, { name: string }> {
  /** Resolved via NUMERIC_TO_ISO3 — absent for excluded features (Antarctica, disputed zones, …). */
  iso3?: string;
}

export type GeoMapMode = "pick" | "display" | "silhouette";

export interface GeoMapProps {
  mode: GeoMapMode;
  /** iso3 codes to emphasise (e.g. neighbours in a hint). */
  highlight?: string[];
  /** Dims every country not in `highlight` (or not `focusOn`/`selected` if `highlight` is empty). */
  dimOthers?: boolean;
  selected?: string | null;
  /** Set only at reveal — see brief §2 (never sent to the client before then). */
  correct?: string | null;
  wrong?: string | null;
  /** iso3 the camera frames. */
  focusOn?: string | null;
  showLabels?: boolean;
  interactive?: boolean;
  onSelect?: (iso3: string) => void;
  className?: string;
}

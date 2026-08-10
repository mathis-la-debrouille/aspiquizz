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
  /** Zoom scale clamp — brief §8.2 clamps in-game interaction to 8; the geo question editor
   *  (Addendum B.3.1) needs more precision than a player does, up to 12. Defaults to 8. */
  maxScale?: number;
  /** Turns on every authoring-only affordance (Addendum B.3.1–B.3.3): zoom +/−/reset/fullscreen
   *  controls, lazy 50m swap + auto-labels above a zoom threshold, disabling the small-country
   *  fallback circles once zoomed in enough for precise clicking to win instead, a hover
   *  tooltip, double-click-to-zoom-on-country, and the touch/fullscreen-only pending+confirm
   *  click flow (a mouse click on desktop commits directly instead). False (the in-game
   *  default) leaves every one of these off — this prop exists so none of it can leak into the
   *  player-facing map by accident. */
  editorChrome?: boolean;
  /** editorChrome only — fires (debounced) with the current viewport's geographic bounds
   *  whenever the zoom transform settles, so the editor's "Utiliser cette vue comme cadrage"
   *  (Addendum B.3.5) can read the latest value without an imperative ref API. */
  onViewChange?: (bbox: [number, number, number, number] | null) => void;
}

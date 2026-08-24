"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ZoomIn, ZoomOut, Maximize, Minimize, LocateFixed } from "lucide-react";
import { geoPath } from "d3-geo";
import type { GeoPath, GeoProjection } from "d3-geo";
import { zoom as d3zoom, zoomIdentity, zoomTransform, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { interpolate } from "d3-interpolate";
import type { Geometry } from "geojson";
import { CountryPaths } from "@/components/map/CountryPaths";
import { Labels } from "@/components/map/Labels";
import { loadWorldTopology } from "@/components/map/topology";
import { createWorldProjection, createFocusedProjection } from "@/components/map/projection";
import { COUNTRY_NAME_FR } from "@/lib/geo/country-names";
import { findPrimaryFeature } from "@/lib/geo/primary-feature";
import { largestPolygonFeature } from "@/lib/geo/largest-ring";
import type { CountryFeature, GeoMapProps } from "@/components/map/types";
import { cn } from "@/lib/utils/cn";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const DEFAULT_MAX_SCALE = 8;
const TRANSITION_MS = 450;
const FOCUS_PADDING = 60;
// Addendum B.3.1 thresholds. RESOLUTION_SWAP_SCALE is a rendering-quality fix (blocky borders
// at high zoom) with no gameplay implication, so it applies everywhere zoom itself is enabled —
// editor or in-game. LABEL_AUTO_SCALE stays editor-only: auto-revealing a country's name once
// zoomed in far enough would let a player answering locate_country/capital_of just zoom instead
// of finding it, so it must never apply while a click-mode question is still interactive.
const RESOLUTION_SWAP_SCALE = 3;
const LABEL_AUTO_SCALE = 2.5;

/**
 * A callback ref, not `useRef` + a `useEffect(..., [])` — the latter captures whichever DOM node
 * existed at the very first mount and never re-observes if that node is later swapped out (e.g.
 * GeoMap's fullscreen toggle restructures the JSX around this container; React doesn't guarantee
 * the same DOM node survives that). A stale, no-longer-in-the-document ResizeObserver target
 * means `size` silently freezes at whatever it was before entering fullscreen, so the projection
 * (and the <svg>'s own width/height, both driven by `size`) never adopts the real, much bigger
 * fullscreen viewport — this is the root cause of "zoom does nothing once fullscreen".
 */
function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return [ref, size] as const;
}

export function GeoMap({
  mode,
  highlight = [],
  dimOthers = false,
  selected = null,
  correct = null,
  wrong = null,
  focusOn = null,
  frameOn = null,
  showLabels = false,
  interactive = true,
  onSelect,
  className,
  maxScale = DEFAULT_MAX_SCALE,
  editorChrome = false,
  onViewChange,
}: GeoMapProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ReturnType<typeof d3zoom<SVGSVGElement, unknown>> | null>(null);
  // The <svg> only mounts once the world topology has finished loading (async fetch) — a plain
  // ref alone doesn't notify the zoom-attach effect below when that happens (its dependency
  // array has nothing that changes at that moment), so the effect's first, only run finds
  // svgRef.current still null and permanently no-ops: d3-zoom never actually gets attached, and
  // every zoom control (buttons, wheel, drag) silently does nothing. A callback ref turns "the
  // node just appeared" into a real state transition the effect can depend on.
  const [svgMounted, setSvgMounted] = useState(false);
  const svgCallbackRef = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    setSvgMounted(node !== null);
  }, []);
  const [features, setFeatures] = useState<CountryFeature[] | null>(null);
  const [pendingIso3, setPendingIso3] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [hoveredIso3, setHoveredIso3] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const reducedMotion = useReducedMotion();

  const isSilhouette = mode === "silhouette";
  const scaleExtent = useMemo<[number, number]>(() => [1, maxScale], [maxScale]);
  // A 10m tier was tried here (world-atlas ships one) and reverted: countries-10m.json has a
  // real data defect — the Maldives feature's geometry spans the full -180°..180° longitude
  // range (verified directly against the file with d3-geo's geoBounds, not guessed from a
  // screenshot), producing a bounding box that covers ~98% of the whole map and rendering as a
  // solid fill across the entire viewport the moment that feature is anywhere on screen. 50m
  // has no such defect for any commonly-targeted country, so it stays the ceiling resolution;
  // maxScale is still raised (see GeoForm.tsx) for finer *positioning*, just not finer *shape
  // detail* past this point.
  const highRes = isSilhouette || Boolean(focusOn) || scale > RESOLUTION_SWAP_SCALE;
  const resolution = highRes ? "50m" : "110m";

  // Coarse-pointer detection feeds the touch tap-to-confirm flow below (usesPendingFlow) — that
  // flow now applies in-game too, so this can't stay editorChrome-gated.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(pointer: coarse)");
    setIsCoarsePointer(query.matches);
    const listener = (e: MediaQueryListEvent) => setIsCoarsePointer(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  useEffect(() => {
    let cancelled = false;
    loadWorldTopology(resolution).then((loaded) => {
      if (!cancelled) setFeatures(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [resolution]);

  // findPrimaryFeature, not features.find(f => f.iso3 === focusOn) — a single iso3 can tag
  // several separate topology features (NUMERIC_TO_ISO3 maps Guam/Puerto Rico/American Samoa/
  // the US Virgin Islands to "USA" too, alongside the actual mainland+Alaska+Hawaii feature).
  // .find() just returns whichever comes first in the topology's own order, which — verified
  // directly against the real data, not guessed — is Guam, not the mainland. See DECISIONS.md.
  const targetFeature = useMemo(
    () => (focusOn && features ? findPrimaryFeature(features, focusOn) : null),
    [features, focusOn],
  );

  // Silhouette mode additionally trims to the target's own single largest-area part — a country
  // whose overseas territories/outlying islands are part of the *same* feature (mainland USA is
  // one feature with 127 disjoint parts once Alaska's islands are counted) would otherwise fit/
  // render its whole span, shrinking the recognizable mainland to a speck among scattered
  // islands. Only for the silhouette guess-the-shape view — the normal world view (and flying
  // the camera to a country elsewhere in this component) should still show a country whole.
  const silhouetteFeature = useMemo(
    () => (isSilhouette && targetFeature ? largestPolygonFeature(targetFeature) : targetFeature),
    [isSilhouette, targetFeature],
  );

  // Silhouette mode: only the target's own geometry, no surrounding context — brief §6.4/§8.2.
  const renderFeatures = useMemo(() => {
    if (!features) return [];
    if (isSilhouette) return silhouetteFeature ? [silhouetteFeature] : [];
    return features;
  }, [features, isSilhouette, silhouetteFeature]);

  const projection: GeoProjection | null = useMemo(() => {
    if (!features || size.width === 0 || size.height === 0) return null;
    if (isSilhouette) {
      return silhouetteFeature
        ? createFocusedProjection(silhouetteFeature, size.width, size.height)
        : null;
    }
    return createWorldProjection(features, size.width, size.height);
  }, [features, isSilhouette, silhouetteFeature, size.width, size.height]);

  const pathGenerator: GeoPath<unknown, Geometry> | null = useMemo(
    () => (projection ? geoPath(projection) : null),
    [projection],
  );

  // --- Pan/zoom: disabled for silhouette (brief §8.2) and non-interactive views. ---
  const zoomEnabled = interactive && !isSilhouette;
  // Zoom chrome (the on-screen buttons, fullscreen, and the touch tap-to-confirm flow) mirrors
  // wherever pan/zoom itself is actually usable — the authoring map, or an in-game "pick a
  // country" surface (locate_country/capital_of) while the question is still answerable.
  // zoomEnabled already excludes silhouette mode and flips off once a click-mode question is
  // submitted/locked (interactive turns false), which correctly hides this chrome at that point
  // too — same reason every other answer surface disables its controls once `disabled` is true.
  const showZoomChrome = editorChrome || zoomEnabled;

  useEffect(() => {
    const svg = svgRef.current;
    const g = gRef.current;
    if (!svg || !g || !zoomEnabled) return;

    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent(scaleExtent)
      // Silhouette aside, name_from_shape is the only mode where zoom would trivialise the
      // question (brief §8.2) — that's already handled by zoomEnabled=false there. Everywhere
      // editorChrome is on, double-click is repurposed for zoom-to-country below, so it must
      // not also pan/zoom the whole view on every double-click of the background.
      .filter((event: Event) => !(editorChrome && event.type === "dblclick"))
      .on("zoom", (event: { transform: ZoomTransform }) => {
        g.setAttribute("transform", event.transform.toString());
        // Exposes the live zoom factor as a CSS custom property so .geo-label (globals.css) can
        // counter-scale itself by 1/k — without it, text/stroke widths defined in the same
        // pre-zoom coordinate space as the country paths grow linearly with k, which at this
        // component's zoom range reads as "a 10px label rendering 100+px tall" long before
        // maxScale is reached. .geo-country's border uses the SVG-native equivalent
        // (vector-effect: non-scaling-stroke) instead, since that's a shape stroke, not text.
        g.style.setProperty("--zoom-k", String(event.transform.k));
        setScale(event.transform.k);
      });

    g.style.setProperty("--zoom-k", "1");
    select(svg).call(behavior);
    zoomBehaviorRef.current = behavior;

    return () => {
      select(svg).on(".zoom", null);
      zoomBehaviorRef.current = null;
    };
  }, [zoomEnabled, scaleExtent, editorChrome, svgMounted]);

  // --- Cadrage (Addendum B.3.5): report the current viewport's geographic bounds, debounced,
  //     whenever the zoom transform settles. A screen point maps back through the zoom
  //     transform first (transform is applied to <g>, outside the projection), then through
  //     the projection's own inverse to get lon/lat.
  useEffect(() => {
    if (!editorChrome || !onViewChange || !projection || !svgRef.current) return;
    const svg = svgRef.current;
    const timeout = setTimeout(() => {
      const transform = zoomTransform(svg);
      const corners: [number, number][] = [
        [0, 0],
        [size.width, 0],
        [size.width, size.height],
        [0, size.height],
      ];
      const lonLats = corners
        .map(([sx, sy]): [number, number] | null => {
          const px = (sx - transform.x) / transform.k;
          const py = (sy - transform.y) / transform.k;
          return projection.invert?.([px, py]) ?? null;
        })
        .filter(
          (p): p is [number, number] =>
            p !== null && Number.isFinite(p[0]) && Number.isFinite(p[1]),
        );
      if (lonLats.length === 0) {
        onViewChange(null);
        return;
      }
      const lons = lonLats.map((p) => p[0]);
      const lats = lonLats.map((p) => p[1]);
      onViewChange([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]);
    }, 200);
    return () => clearTimeout(timeout);
  }, [editorChrome, onViewChange, projection, scale, size.width, size.height]);

  const flyToBounds = useCallback(
    (bounds: [[number, number], [number, number]] | null) => {
      const svg = svgRef.current;
      const behavior = zoomBehaviorRef.current;
      if (!svg || !behavior) return;

      let nextTransform = zoomIdentity;
      if (bounds) {
        const [[x0, y0], [x1, y1]] = bounds;
        const boxWidth = Math.max(x1 - x0, 1);
        const boxHeight = Math.max(y1 - y0, 1);
        const targetScale = Math.min(
          scaleExtent[1],
          Math.max(
            scaleExtent[0],
            Math.min((size.width - FOCUS_PADDING) / boxWidth, (size.height - FOCUS_PADDING) / boxHeight),
          ),
        );
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        nextTransform = zoomIdentity
          .translate(size.width / 2, size.height / 2)
          .scale(targetScale)
          .translate(-cx, -cy);
      }

      const selection = select(svg);
      if (reducedMotion) {
        behavior.transform(selection, nextTransform);
        return;
      }

      const start = zoomTransform(svg);
      const interpolateX = interpolate(start.x, nextTransform.x);
      const interpolateY = interpolate(start.y, nextTransform.y);
      const interpolateK = interpolate(start.k, nextTransform.k);
      const startTime = performance.now();
      const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
      let raf = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / TRANSITION_MS);
        const eased = easeOutCubic(t);
        const transform = zoomIdentity
          .translate(interpolateX(eased), interpolateY(eased))
          .scale(interpolateK(eased));
        behavior.transform(selection, transform);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    },
    [size.width, size.height, scaleExtent, reducedMotion],
  );

  const flyTo = useCallback(
    (feature: CountryFeature | null) => {
      if (!pathGenerator) return;
      return flyToBounds(feature ? pathGenerator.bounds(feature.geometry) : null);
    },
    [pathGenerator, flyToBounds],
  );

  // Cadrage (Addendum B.3.5/C's "Utiliser cette vue comme cadrage") — frames a raw geographic
  // bounding box rather than a feature. Projects the 4 corners directly (no geometry object to
  // hand pathGenerator), so this works for a bbox saved from an entirely different session.
  const flyToBbox = useCallback(
    (bbox: [number, number, number, number] | null) => {
      if (!projection) return;
      if (!bbox) return flyToBounds(null);
      const [west, south, east, north] = bbox;
      const corners: [number, number][] = [
        [west, south],
        [west, north],
        [east, south],
        [east, north],
      ];
      const projected = corners
        .map((c) => projection(c))
        .filter((p): p is [number, number] => p !== null && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (projected.length === 0) return flyToBounds(null);
      const xs = projected.map((p) => p[0]);
      const ys = projected.map((p) => p[1]);
      return flyToBounds([
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ]);
    },
    [projection, flyToBounds],
  );

  // --- Camera framing: focusOn a non-silhouette view eases the zoom transform to fit the
  //     target's bounds under the shared world projection — brief §8.2. frameOn (a raw bbox,
  //     not an iso3) is the fallback when there's no specific country to fly to — one effect,
  //     not two, so they can't race/fight over the transform on every render.
  useEffect(() => {
    if (isSilhouette) return;
    if (focusOn && targetFeature) return flyTo(targetFeature);
    return flyToBbox(frameOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flyTo/flyToBbox intentionally
    // excluded: they close over size/scaleExtent/projection, which already re-trigger this
    // effect via their own deps below; re-including them would double-fire on every resize.
  }, [focusOn, targetFeature, frameOn, isSilhouette, size.width, size.height]);

  function zoomBy(factor: number) {
    const svg = svgRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!svg || !behavior) return;
    behavior.scaleBy(select(svg), factor);
  }

  function resetView() {
    const svg = svgRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!svg || !behavior) return;
    behavior.transform(select(svg), zoomIdentity);
  }

  // --- Selection/highlight state applied imperatively — never re-renders the path list. ---
  useEffect(() => {
    const container = svgRef.current;
    if (!container) return;

    for (const el of container.querySelectorAll<SVGElement>("[data-state]")) {
      el.removeAttribute("data-state");
    }
    for (const el of container.querySelectorAll<SVGElement>("[data-highlight]")) {
      el.removeAttribute("data-highlight");
    }

    const mark = (iso3: string | null, state: string) => {
      if (!iso3) return;
      for (const el of container.querySelectorAll<SVGElement>(`[data-iso3="${iso3}"]`)) {
        el.setAttribute("data-state", state);
      }
    };

    for (const iso3 of highlight) {
      for (const el of container.querySelectorAll<SVGElement>(`[data-iso3="${iso3}"]`)) {
        el.setAttribute("data-highlight", "true");
      }
    }
    mark(pendingIso3, "pending");
    mark(selected, "selected");
    mark(correct, "correct");
    mark(wrong, "wrong");
  }, [highlight, selected, correct, wrong, pendingIso3]);

  // Reset any pending (unconfirmed) tap when the question/props change under us.
  useEffect(() => {
    setPendingIso3(null);
  }, [focusOn, selected]);

  // Touch devices and fullscreen keep the old tap-then-confirm flow (the hit target is small
  // relative to a finger, and fullscreen is itself the "I need precision" signal) — a mouse on
  // a normal desktop view commits on the first click instead, per B.3.3. Applies in-game too: a
  // mis-tap costs a player the whole question, more so than it costs an author a re-do.
  const usesPendingFlow = showZoomChrome && (isCoarsePointer || fullscreen);

  const handleClick = useCallback(
    (event: ReactMouseEvent<SVGGElement>) => {
      if (!interactive || !onSelect) return;
      const target = (event.target as Element).closest<SVGElement>("[data-iso3]");
      const iso3 = target?.dataset["iso3"];
      if (!iso3) return;

      if (!usesPendingFlow) {
        onSelect(iso3);
        return;
      }
      if (pendingIso3 === iso3) {
        onSelect(iso3);
        setPendingIso3(null);
      } else {
        setPendingIso3(iso3);
      }
    },
    [interactive, onSelect, pendingIso3, usesPendingFlow],
  );

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGGElement>) => {
      if (!editorChrome) return;
      const target = (event.target as Element).closest<SVGElement>("[data-iso3]");
      const iso3 = target?.dataset["iso3"];
      if (!iso3 || !features) return;
      const feature = features.find((f) => f.iso3 === iso3);
      if (feature) flyTo(feature);
    },
    [editorChrome, features, flyTo],
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<SVGGElement>) => {
      if (!editorChrome) return;
      const target = (event.target as Element).closest<SVGElement>("[data-iso3]");
      const iso3 = target?.dataset["iso3"] ?? null;
      setHoveredIso3(iso3);
      if (iso3) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) setHoverPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }
    },
    [editorChrome],
  );

  const confirmPending = useCallback(() => {
    if (pendingIso3 && onSelect) {
      onSelect(pendingIso3);
      setPendingIso3(null);
    }
  }, [pendingIso3, onSelect]);

  const pendingName = pendingIso3 ? COUNTRY_NAME_FR[pendingIso3] : undefined;
  const effectiveShowLabels = showLabels || (editorChrome && scale > LABEL_AUTO_SCALE);

  const mapBody = (
    <div
      ref={containerRef}
      className={cn(
        "geo-map relative h-full w-full min-h-[280px]",
        editorChrome && "geo-map--editor",
        className,
      )}
      data-interactive={interactive}
      data-dim-others={dimOthers}
    >
      {size.width > 0 && size.height > 0 && pathGenerator && (
        <svg
          ref={svgCallbackRef}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role={interactive ? "group" : "img"}
          aria-label="Carte du monde"
        >
          <g
            ref={gRef}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIso3(null)}
          >
            <CountryPaths features={renderFeatures} pathGenerator={pathGenerator} />
            {effectiveShowLabels && (
              <Labels
                features={renderFeatures}
                pathGenerator={pathGenerator}
                namesByIso3={COUNTRY_NAME_FR}
              />
            )}
          </g>
        </svg>
      )}

      {editorChrome && hoveredIso3 && hoverPos && COUNTRY_NAME_FR[hoveredIso3] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-sm border border-border-hard bg-bg-raised px-2 py-1 text-12 text-ink-high shadow-[var(--shadow-1)]"
          style={{ left: hoverPos.x, top: hoverPos.y - 8 }}
        >
          {COUNTRY_NAME_FR[hoveredIso3]}
        </div>
      )}

      {showZoomChrome && !isSilhouette && (
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-md border border-border-hard bg-bg-raised/95 p-1 shadow-[var(--shadow-1)]">
          <button
            type="button"
            aria-label="Zoom avant"
            title="Zoom avant"
            onClick={() => zoomBy(1.5)}
            className="rounded-sm p-1.5 text-ink-mid hover:bg-bg-surface hover:text-ink-high"
          >
            <ZoomIn className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Zoom arrière"
            title="Zoom arrière"
            onClick={() => zoomBy(1 / 1.5)}
            className="rounded-sm p-1.5 text-ink-mid hover:bg-bg-surface hover:text-ink-high"
          >
            <ZoomOut className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Réinitialiser la vue"
            title="Réinitialiser la vue"
            onClick={resetView}
            className="rounded-sm p-1.5 text-ink-mid hover:bg-bg-surface hover:text-ink-high"
          >
            <LocateFixed className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
            title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
            onClick={() => setFullscreen((v) => !v)}
            className="rounded-sm p-1.5 text-ink-mid hover:bg-bg-surface hover:text-ink-high"
          >
            {fullscreen ? (
              <Minimize className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Maximize className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      )}

      {usesPendingFlow && pendingIso3 && pendingName && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={confirmPending}
            className="btn-physical rounded-md border border-moss-deep border-b-[3px] bg-moss px-4 py-2 text-14 font-medium text-bg-void active:translate-y-[2px] active:border-b-[1px]"
          >
            Valider {pendingName}
          </button>
        </div>
      )}

      {fullscreen && (
        <div className="absolute right-3 bottom-3 z-10">
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="btn-physical rounded-md border border-border-hard border-b-[3px] bg-bg-surface px-4 py-2 text-14 font-medium text-ink-high active:translate-y-[2px] active:border-b-[1px]"
          >
            Terminé
          </button>
        </div>
      )}
    </div>
  );

  if (showZoomChrome && fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-void p-4">
        <div className="h-full w-full">{mapBody}</div>
      </div>
    );
  }

  return mapBody;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { geoPath } from "d3-geo";
import type { GeoPath, GeoProjection } from "d3-geo";
import { zoom as d3zoom, zoomIdentity, zoomTransform, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { interpolate } from "d3-interpolate";
import type { Geometry } from "geojson";
import { CountryPaths } from "@/components/map/CountryPaths";
import { HitCircles } from "@/components/map/HitCircles";
import { FallbackHitCircles } from "@/components/map/FallbackHitCircles";
import { Labels } from "@/components/map/Labels";
import { loadWorldTopology } from "@/components/map/topology";
import { createWorldProjection, createFocusedProjection } from "@/components/map/projection";
import { COUNTRY_NAME_FR } from "@/lib/geo/country-names";
import { COUNTRY_CENTROID } from "@/lib/geo/country-centroids";
import type { CountryFeature, GeoMapProps } from "@/components/map/types";
import { cn } from "@/lib/utils/cn";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const SCALE_EXTENT: [number, number] = [1, 8];
const TRANSITION_MS = 450;
const FOCUS_PADDING = 60;

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
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
  showLabels = false,
  interactive = true,
  onSelect,
  className,
}: GeoMapProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ReturnType<typeof d3zoom<SVGSVGElement, unknown>> | null>(null);
  const [features, setFeatures] = useState<CountryFeature[] | null>(null);
  const [pendingIso3, setPendingIso3] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  const isSilhouette = mode === "silhouette";
  const resolution = isSilhouette || focusOn ? "50m" : "110m";

  useEffect(() => {
    let cancelled = false;
    loadWorldTopology(resolution).then((loaded) => {
      if (!cancelled) setFeatures(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [resolution]);

  const targetFeature = useMemo(
    () => (focusOn ? (features?.find((f) => f.iso3 === focusOn) ?? null) : null),
    [features, focusOn],
  );

  // Silhouette mode: only the target's own geometry, no surrounding context — brief §6.4/§8.2.
  const renderFeatures = useMemo(() => {
    if (!features) return [];
    if (isSilhouette) return targetFeature ? [targetFeature] : [];
    return features;
  }, [features, isSilhouette, targetFeature]);

  const projection: GeoProjection | null = useMemo(() => {
    if (!features || size.width === 0 || size.height === 0) return null;
    if (isSilhouette) {
      return targetFeature ? createFocusedProjection(targetFeature, size.width, size.height) : null;
    }
    return createWorldProjection(features, size.width, size.height);
  }, [features, isSilhouette, targetFeature, size.width, size.height]);

  const pathGenerator: GeoPath<unknown, Geometry> | null = useMemo(
    () => (projection ? geoPath(projection) : null),
    [projection],
  );

  // Countries entirely absent from this topology (see FallbackHitCircles) — world view only;
  // silhouette mode has nothing to fall back to besides the single target feature.
  const missingIso3 = useMemo(() => {
    if (!features || isSilhouette) return [];
    const present = new Set(features.map((f) => f.iso3).filter((iso3): iso3 is string => !!iso3));
    return Object.keys(COUNTRY_CENTROID).filter((iso3) => !present.has(iso3));
  }, [features, isSilhouette]);

  // --- Pan/zoom: disabled for silhouette (brief §8.2) and non-interactive views. ---
  const zoomEnabled = interactive && !isSilhouette;

  useEffect(() => {
    const svg = svgRef.current;
    const g = gRef.current;
    if (!svg || !g || !zoomEnabled) return;

    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .on("zoom", (event: { transform: ZoomTransform }) => {
        g.setAttribute("transform", event.transform.toString());
      });

    select(svg).call(behavior);
    zoomBehaviorRef.current = behavior;

    return () => {
      select(svg).on(".zoom", null);
      zoomBehaviorRef.current = null;
    };
  }, [zoomEnabled]);

  // --- Camera framing: focusOn a non-silhouette view eases the zoom transform to fit the
  //     target's bounds under the shared world projection — brief §8.2 "d3-interpolate on the
  //     zoom transform, 450ms, eased".
  useEffect(() => {
    const svg = svgRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!svg || !behavior || !pathGenerator || isSilhouette) return;

    let nextTransform = zoomIdentity;
    if (focusOn && targetFeature) {
      const [[x0, y0], [x1, y1]] = pathGenerator.bounds(targetFeature.geometry);
      const boxWidth = Math.max(x1 - x0, 1);
      const boxHeight = Math.max(y1 - y0, 1);
      const scale = Math.min(
        SCALE_EXTENT[1],
        Math.max(
          SCALE_EXTENT[0],
          Math.min(
            (size.width - FOCUS_PADDING) / boxWidth,
            (size.height - FOCUS_PADDING) / boxHeight,
          ),
        ),
      );
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      nextTransform = zoomIdentity
        .translate(size.width / 2, size.height / 2)
        .scale(scale)
        .translate(-cx, -cy);
    }

    const selection = select(svg);
    if (reducedMotion) {
      behavior.transform(selection, nextTransform);
      return;
    }

    // d3-interpolate on the transform's own x/y/k, driven by rAF rather than d3-transition (whose
    // Selection.transition() typings need @types/d3-transition, an extra dependency for one call
    // site) — still "d3-interpolate on the zoom transform, 450ms, eased" per brief §8.2.
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
  }, [focusOn, targetFeature, pathGenerator, size.width, size.height, isSilhouette, reducedMotion]);

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

  const handleClick = useCallback(
    (event: ReactMouseEvent<SVGGElement>) => {
      if (!interactive || !onSelect) return;
      const target = (event.target as Element).closest<SVGElement>("[data-iso3]");
      const iso3 = target?.dataset["iso3"];
      if (!iso3) return;

      if (pendingIso3 === iso3) {
        onSelect(iso3);
        setPendingIso3(null);
      } else {
        setPendingIso3(iso3);
      }
    },
    [interactive, onSelect, pendingIso3],
  );

  const confirmPending = useCallback(() => {
    if (pendingIso3 && onSelect) {
      onSelect(pendingIso3);
      setPendingIso3(null);
    }
  }, [pendingIso3, onSelect]);

  const pendingName = pendingIso3 ? COUNTRY_NAME_FR[pendingIso3] : undefined;

  return (
    <div
      ref={containerRef}
      className={cn("geo-map relative h-full w-full min-h-[280px]", className)}
      data-interactive={interactive}
      data-dim-others={dimOthers}
    >
      {size.width > 0 && size.height > 0 && pathGenerator && (
        <svg
          ref={svgRef}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role={interactive ? "group" : "img"}
          aria-label="Carte du monde"
        >
          <g ref={gRef} onClick={handleClick}>
            <CountryPaths features={renderFeatures} pathGenerator={pathGenerator} />
            <HitCircles features={renderFeatures} pathGenerator={pathGenerator} />
            {projection && missingIso3.length > 0 && (
              <FallbackHitCircles missingIso3={missingIso3} projection={projection} />
            )}
            {showLabels && (
              <Labels
                features={renderFeatures}
                pathGenerator={pathGenerator}
                namesByIso3={COUNTRY_NAME_FR}
              />
            )}
          </g>
        </svg>
      )}
      {pendingIso3 && pendingName && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={confirmPending}
            className="btn-physical rounded-md border border-moss-deep border-b-[3px] bg-moss px-4 py-2 text-14 font-medium text-bg-void active:translate-y-[2px] active:border-b-[1px]"
          >
            Valider {pendingName}
          </button>
        </div>
      )}
    </div>
  );
}

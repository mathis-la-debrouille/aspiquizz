/**
 * Only this barrel should be imported outside src/components/map — always via
 * `next/dynamic(() => import("@/components/map"), { ssr: false })` so d3 stays
 * out of the main bundle (brief §8.4). Internals (d3 projections, topology
 * loading) are intentionally not exported.
 */
export { GeoMap } from "@/components/map/GeoMap";
export type { GeoMapProps, GeoMapMode } from "@/components/map/types";

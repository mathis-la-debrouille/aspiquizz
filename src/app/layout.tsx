import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, Space_Grotesk } from "next/font/google";
import "@/styles/globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  // Variable font: weight stays "variable" (a fixed weight list disables the
  // variable axes), and we pull in the SOFT/WONK/opsz axes used in
  // globals.css to get the warm, slightly quirky serif from §4.3.
  weight: "variable",
  axes: ["opsz", "SOFT", "WONK"],
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ASPI Quiz",
  description: "Quiz multijoueur en temps réel, entre proches.",
};

/**
 * Inline SVG grain filter, reused by the fixed .grain-overlay layer.
 * Kept tiny and deterministic (no seed animation) — see §4.4.
 */
function GrainFilter() {
  return (
    <svg aria-hidden="true" className="grain-overlay">
      <filter id="grain-turbulence">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves="2"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-turbulence)" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} ${instrumentSans.variable} ${spaceGrotesk.variable}`}
    >
      <body>
        <GrainFilter />
        <div aria-hidden="true" className="vignette-overlay" />
        {children}
      </body>
    </html>
  );
}

import type { SVGProps } from "react";

/**
 * Hand-drawn-feeling accent marks — see brief §4.4.6. Paths are drawn by hand
 * (slightly irregular, not geometric-perfect), not pulled from an icon set.
 * Used as section markers / empty-state art, never as functional icons —
 * pair those with lucide-react instead.
 */

type AccentProps = SVGProps<SVGSVGElement>;

export function LaurelSprig({ className, ...props }: AccentProps) {
  return (
    <svg viewBox="0 0 120 48" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M60 40 C 60 28, 58 18, 60 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M60 34c-6-1-11-5-13-10 6 1 11 4 13 10Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M60 26c-7-1-12-5-15-11 7 1 13 5 15 11Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M60 18c-6-2-10-6-12-11 6 1 10 5 12 11Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M60 34c6-1 11-5 13-10-6 1-11 4-13 10Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M60 26c7-1 12-5 15-11-7 1-13 5-15 11Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M60 18c6-2 10-6 12-11-6 1-10 5-12 11Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CompassRose({ className, ...props }: AccentProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M32 10 L37 30 L32 32 L27 30 Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M32 54 L27 34 L32 32 L37 34 Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <path
        d="M10 32 L30 27 L32 32 L30 37 Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <path
        d="M54 32 L34 37 L32 32 L34 27 Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <circle cx="32" cy="32" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function DashedUnderline({ className, ...props }: AccentProps) {
  return (
    <svg viewBox="0 0 160 12" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M2 6c14-2.5 26 3 40 1s26-4.5 39-2 27 3.5 39 1.5 26-3.5 38-1.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
    </svg>
  );
}

export function SparkleFreeStar({ className, ...props }: AccentProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M20 4 C 20 14, 22 18, 20 20 C 18 18, 20 14, 20 4Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M20 36 C 20 26, 18 22, 20 20 C 22 22, 20 26, 20 36Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M4 20 C 14 20, 18 22, 20 20 C 18 18, 14 20, 4 20Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M36 20 C 26 20, 22 18, 20 20 C 22 22, 26 20, 36 20Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

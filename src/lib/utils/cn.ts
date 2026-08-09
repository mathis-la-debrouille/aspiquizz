import { clsx, type ClassValue } from "clsx";

/**
 * Tiny classname combinator. We don't reach for tailwind-merge here — the
 * design system uses a closed set of hand-named tokens (bg-surface,
 * text-ink-high, …) rather than Tailwind's default palette, so the
 * "last conflicting utility wins" problem tailwind-merge solves rarely
 * comes up. clsx's plain concatenation is enough.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

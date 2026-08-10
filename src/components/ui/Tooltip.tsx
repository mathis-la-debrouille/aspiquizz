"use client";

import { useId } from "react";
import type { ReactElement } from "react";
import { cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils/cn";

export interface TooltipProps {
  content: string;
  children: ReactElement;
  side?: "top" | "bottom";
}

/**
 * CSS-only tooltip — shows on hover and keyboard focus alike (a tap on a focusable trigger
 * focuses it on touch too, so no separate touch handling is needed). Wires `aria-describedby`
 * from the tooltip content onto `children` automatically — `children` must be a single element
 * that accepts `aria-describedby` (a button, typically) so screen readers announce the
 * relationship, not just sighted hover/focus.
 */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const id = useId();
  const describedChild = isValidElement<{ "aria-describedby"?: string }>(children)
    ? cloneElement(children, { "aria-describedby": id })
    : children;

  return (
    <span className="group relative inline-flex">
      {describedChild}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 rounded-sm border border-border-hard bg-bg-void px-2 py-1 text-12 text-ink-high opacity-0 shadow-[var(--shadow-1)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {content}
      </span>
    </span>
  );
}

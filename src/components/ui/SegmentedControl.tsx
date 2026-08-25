"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown under the control for the selected option — what this choice actually does. */
  hint?: string;
}

/**
 * A small set of mutually exclusive choices, laid out side by side.
 *
 * For two or three options a dropdown hides half the interface behind a click for
 * no reason: the choices are short, they fit, and seeing both at once is the point
 * — you can read what you're picking between instead of opening a menu to find out.
 *
 * Radio inputs, not buttons: this is a single-choice field, so arrow keys move
 * between options and screen readers announce it as one group. The inputs are
 * visually hidden rather than replaced, so all of that comes for free.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  name,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  name?: string;
}) {
  const autoId = useId();
  const groupName = name ?? autoId;
  const selected = options.find((o) => o.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-14 font-medium text-ink-mid">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          "flex gap-1 rounded-md border border-border-hard bg-bg-inset p-1",
          disabled && "opacity-50",
        )}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex-1 cursor-pointer rounded-sm px-3 py-2 text-center text-14 font-medium",
                "transition-colors duration-150",
                active
                  ? "bg-moss text-bg-void"
                  : "text-ink-mid hover:bg-bg-surface hover:text-ink-high",
                disabled && "cursor-not-allowed",
                // Focus lands on the hidden input; mirror it onto the visible label
                // so keyboard users can see where they are.
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold has-[:focus-visible]:ring-offset-0",
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {selected?.hint && <p className="text-12 text-ink-faint">{selected.hint}</p>}
    </div>
  );
}

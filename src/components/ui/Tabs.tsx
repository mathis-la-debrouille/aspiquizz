"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Tab switcher with roving-tabindex arrow-key navigation. Panels are rendered by the caller. */
export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const dir = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + dir + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[(index + dir + tabs.length) % tabs.length]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn(
        "inline-flex gap-1 rounded-md border border-border-soft bg-bg-inset p-1",
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-14 font-medium transition-colors duration-150",
              selected
                ? "bg-bg-surface text-ink-high shadow-[var(--shadow-1)]"
                : "text-ink-faint hover:text-ink-mid",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

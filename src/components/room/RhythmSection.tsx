"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { QuestionType } from "@/server/db/schema";

export interface RhythmValue {
  timeLimitS: number;
  timeLimitByType?: Partial<Record<QuestionType, number>>;
}

const PRESETS = [
  { label: "Détente", value: 45 },
  { label: "Normal", value: 20 },
  { label: "Éclair", value: 10 },
] as const;

const TYPE_LABELS: Record<QuestionType, string> = {
  open: "Réponse libre",
  mcq: "QCM",
  image: "Image",
  geo: "Géographie",
};

/**
 * Shared between CreateRoomModal and the waiting room's host config panel — duration is set
 * once, at room setup, never at authoring time (Addendum B.2). `onChange` receives the whole
 * next value so callers can fold it straight into their room config state.
 */
export function RhythmSection({
  value,
  onChange,
}: {
  value: RhythmValue;
  onChange: (next: RhythmValue) => void;
}) {
  const [showOverrides, setShowOverrides] = useState(
    Boolean(value.timeLimitByType && Object.keys(value.timeLimitByType).length > 0),
  );

  function setTimeLimitS(n: number) {
    onChange({ ...value, timeLimitS: n });
  }

  function setOverride(type: QuestionType, n: number | undefined) {
    const next = { ...(value.timeLimitByType ?? {}) };
    if (n === undefined) delete next[type];
    else next[type] = n;
    onChange({ ...value, timeLimitByType: Object.keys(next).length > 0 ? next : undefined });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="rhythm-time" className="text-14 font-medium text-ink-mid">
          Rythme — {value.timeLimitS}s par question
        </label>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setTimeLimitS(p.value)}
              className={cn(
                "h-8 flex-1 rounded-sm border text-12 font-medium transition-colors duration-150",
                value.timeLimitS === p.value
                  ? "border-gold-deep bg-gold text-bg-void"
                  : "border-border-hard bg-bg-inset text-ink-mid hover:bg-bg-surface",
              )}
            >
              {p.label} {p.value} s
            </button>
          ))}
        </div>
        <input
          id="rhythm-time"
          type="range"
          min={5}
          max={120}
          step={5}
          value={value.timeLimitS}
          onChange={(e) => setTimeLimitS(Number(e.target.value))}
          className="accent-moss"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowOverrides((v) => !v)}
        aria-expanded={showOverrides}
        className="flex items-center gap-1.5 self-start text-12 text-ink-faint transition-colors duration-150 hover:text-ink-mid"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-150",
            showOverrides && "rotate-180",
          )}
          strokeWidth={1.5}
        />
        Durées par type
      </button>

      {showOverrides && (
        <div className="flex flex-col gap-2 rounded-md border border-border-soft bg-bg-inset p-3">
          <p className="text-12 text-ink-faint">
            Les questions de géographie demandent souvent plus de temps.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
              <div key={type} className="flex flex-col gap-1">
                <label htmlFor={`rhythm-override-${type}`} className="text-12 text-ink-mid">
                  {TYPE_LABELS[type]}
                </label>
                <input
                  id={`rhythm-override-${type}`}
                  type="number"
                  min={5}
                  max={120}
                  placeholder={String(value.timeLimitS)}
                  value={value.timeLimitByType?.[type] ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setOverride(type, raw === "" ? undefined : Number(raw));
                  }}
                  className="h-9 rounded-sm border border-border-hard bg-bg-surface px-2 text-14 text-ink-high outline-none focus:border-gold"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

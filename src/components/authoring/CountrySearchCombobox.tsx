"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { normalizeAnswer } from "@/server/game/grading";
import { searchCountries } from "@/lib/geo/country-search";
import type { CountryOption } from "@/server/geo/actions";

const DEBOUNCE_MS = 150;
const MAX_RESULTS = 8;

/** Wraps the substring of `text` matching `query` (case/accent-insensitive) in a <mark>. Falls
 *  back to the plain text when the normalised forms don't line up 1:1 with raw character
 *  offsets (accented input) — highlighting is a nicety, not something worth being fragile over. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const normalizedText = normalizeAnswer(text);
  const index = normalizedText.indexOf(query);
  if (index === -1 || normalizedText.length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[2px] bg-gold-deep/40 text-inherit">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

/**
 * A real combobox (Addendum B.3.2), not the decorative input it used to be. Searches the
 * already-loaded country list in memory (see server/geo/actions.ts's listCountries doc comment
 * for why this isn't a per-keystroke server round trip) using the same normalisation pipeline
 * grading.ts's answer matching uses, debounced 150ms purely to avoid re-filtering the dropdown
 * on every keystroke.
 */
export function CountrySearchCombobox({
  countries,
  value,
  onSelect,
  onClear,
}: {
  countries: CountryOption[];
  value: CountryOption | null;
  onSelect: (country: CountryOption) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const normalizedQuery = normalizeAnswer(debouncedQuery.trim());
  const results = useMemo(
    () => searchCountries(countries, debouncedQuery, MAX_RESULTS),
    [countries, debouncedQuery],
  );

  useEffect(() => setActiveIndex(0), [results]);

  function selectCountry(country: CountryOption) {
    onSelect(country);
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = results[activeIndex];
      if (active) selectCountry(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border-hard bg-bg-inset px-3 py-2">
        <span className="text-16">{value.flagEmoji}</span>
        <span className="flex-1 text-14 text-ink-high">{value.nameFr}</span>
        <button
          type="button"
          aria-label="Retirer le pays cible"
          onClick={onClear}
          className="text-ink-faint hover:text-clay-soft"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  // Empty container renders nothing at all when untouched/empty — no 1px empty sliver. A
  // non-empty query with zero results still opens the box, just to show "Aucun pays trouvé".
  const showDropdown = open && debouncedQuery.trim().length > 0;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={
          showDropdown && results[activeIndex]
            ? `${listboxId}-${results[activeIndex].iso3}`
            : undefined
        }
        aria-autocomplete="list"
        placeholder="Rechercher un pays…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        className="h-11 w-full rounded-md border border-border-hard bg-bg-inset px-3 text-16 text-ink-high outline-none focus:border-gold"
      />
      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border-hard bg-bg-raised py-1 shadow-[var(--shadow-2)]"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-14 text-ink-faint">Aucun pays trouvé</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.iso3}
                id={`${listboxId}-${c.iso3}`}
                role="option"
                aria-selected={i === activeIndex}
                // onMouseDown, not onClick — fires before the input's onBlur, so the blur
                // timeout above doesn't close the list out from under the click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCountry(c);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={
                  i === activeIndex
                    ? "flex cursor-pointer items-center gap-2 bg-bg-surface px-3 py-2"
                    : "flex cursor-pointer items-center gap-2 px-3 py-2"
                }
              >
                <span className="text-16">{c.flagEmoji}</span>
                <div className="flex flex-col">
                  <span className="text-14 text-ink-high">
                    <HighlightMatch text={c.nameFr} query={normalizedQuery} />
                  </span>
                  <span className="text-12 text-ink-low">
                    {c.capitalFr ?? "—"} · {c.regionFr}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

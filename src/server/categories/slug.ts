/**
 * Slug/name-comparison helpers shared by every category-creating path — the inline web creation
 * (server/categories/actions.ts, Addendum B.1), and now the MCP `creer_categorie` tool and
 * ingest.ts's by-name category resolution (Addendum C.1/C.5). Extracted out of actions.ts so
 * there is exactly one slugify implementation, not two drifting copies.
 */

/** Case/accent-insensitive comparison key — "Géographie" and "geographie" collide, matching
 *  B.1's uniqueness rule. Not the grading pipeline's normalizeAnswer (§7): that also strips
 *  French articles and punctuation for freeform answer matching, which would be wrong here
 *  (a category legitimately named "Le Sport" shouldn't collide with "Sport"). */
// Built via the RegExp constructor from an escaped string literal, not a /[...]/ regex literal
// — deliberately, so the combining-marks range (U+0300-U+036F, same range grading.ts's
// normalizeAnswer strips) is unambiguous source text rather than literal Unicode glyphs sitting
// inside the character class, which are easy to mis-copy/mis-render.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeForComparison(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

export function slugify(name: string): string {
  return (
    normalizeForComparison(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "categorie"
  );
}

export async function uniqueSlug(base: string, existingSlugs: string[]): Promise<string> {
  if (!existingSlugs.includes(base)) return base;
  let n = 2;
  while (existingSlugs.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

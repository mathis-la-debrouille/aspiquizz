import { z } from "zod";

/**
 * All library filter/sort/scope state round-trips through the URL (Addendum A.3) — this is the
 * one schema both the server page (parsing `searchParams`) and any client link-builder use.
 * Every field has a default, so a malformed or partial URL degrades gracefully instead of
 * throwing — never `.parse()` this, always `.safeParse()` (or just call `parseLibraryQuery`,
 * which already does).
 */

export const QUESTION_TYPES = ["open", "mcq", "image", "geo", "sort", "estimation"] as const;
export const LIBRARY_STATUSES = ["published", "draft", "archived", "all"] as const;
export const LIBRARY_SCOPES = ["all", "mine", "drafts"] as const;
export const LIBRARY_SORTS = [
  "recent",
  "oldest",
  "difficulty_asc",
  "difficulty_desc",
  "success_rate_asc",
  "success_rate_desc",
  "most_played",
  "never_played",
  /** Table-view column sort, added by Addendum B.5. */
  "category_name",
] as const;
export const LIBRARY_GROUP_BY = ["none", "category"] as const;

export const questionLibraryQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  type: z.array(z.enum(QUESTION_TYPES)).default([]),
  cat: z.array(z.string()).default([]),
  /** Difficulty tiers to include. Empty means every tier — a multi-select, so
   *  "Golem and 🙂 but nothing between" is expressible, which the old
   *  dmin/dmax range could not say. */
  diff: z.array(z.coerce.number().int().min(1).max(5)).default([]),
  /** A user id, or the sentinel "me" — resolved against the viewer server-side. */
  author: z.string().default(""),
  status: z.enum(LIBRARY_STATUSES).default("published"),
  scope: z.enum(LIBRARY_SCOPES).default("all"),
  sort: z.enum(LIBRARY_SORTS).default("recent"),
  groupBy: z.enum(LIBRARY_GROUP_BY).default("none"),
  /** "Jamais relue" (Addendum C.7) — questions.reviewed_at IS NULL. Independent of `status`: a
   *  published question can still be "never reviewed" if it was published before this addendum,
   *  or authored manually (manual questions have no review step at all, so this reads as "never
   *  went through one", not "is suspicious"). Parsed from the raw "1"/absent URL string below,
   *  not `z.coerce.boolean()` — that coerces any non-empty string (including "false") to `true`. */
  neverReviewed: z.boolean().default(false),
});

export type QuestionLibraryQuery = z.infer<typeof questionLibraryQuerySchema>;

type RawSearchParams = Record<string, string | string[] | undefined>;

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function toScalar(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Never throws — an unparseable URL just falls back to every field's default. */
export function parseLibraryQuery(searchParams: RawSearchParams): QuestionLibraryQuery {
  const parsed = questionLibraryQuerySchema.safeParse({
    q: toScalar(searchParams["q"]),
    type: toArray(searchParams["type"]),
    cat: toArray(searchParams["cat"]),
    diff: toArray(searchParams["diff"]),
    author: toScalar(searchParams["author"]),
    status: toScalar(searchParams["status"]),
    scope: toScalar(searchParams["scope"]),
    sort: toScalar(searchParams["sort"]),
    groupBy: toScalar(searchParams["groupBy"]),
    neverReviewed: toScalar(searchParams["neverReviewed"]) === "1",
  });
  return parsed.success ? parsed.data : questionLibraryQuerySchema.parse({});
}

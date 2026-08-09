# Decisions

Running log of judgement calls made while building ASPI Quiz, in chronological order.

## 2026-08-09 — Process

- **Build process**: executing the brief's own §0/§16 phased plan directly in-conversation,
  not routing through the `factory/` subagent-team plugin that was sitting untracked in the
  repo. The brief is already a frozen, complete spec — factory's interrogation/roadmap layer
  wasn't needed on top of it. (User confirmed explicitly when asked.)

## 2026-08-09 — Confirmed via user (brief §18)

- **Overseas territories** (Guyane, Réunion, Groenland, …): count as their parent sovereign
  state for `geo` question answer-checking (e.g. clicking French Guiana is correct for
  « Où se trouve la France ? »). Implication for `question_geo`/`countries`: no separate
  `countries` rows for non-sovereign territories are needed as click targets; where
  world-atlas geometry has a distinct polygon for a territory, its resolved iso3 in
  `iso-lookup.ts` is mapped to the parent's iso3 for grading purposes (see `scripts/build-iso-lookup.ts`
  once written).
- **Country dataset naming convention**: UN-recognized sovereign states only (~193 UN members
  - observer states as applicable), current official French names. Taiwan, Kosovo, Western
    Sahara excluded as non-UN-member disputed territories — they are not seeded as `countries`
    rows and cannot be quiz targets.
- **"ASPI" branding**: no specific expansion. Plain wordmark, no acronym-driven tagline.

## 2026-08-09 — Environment

- Local Node is v25.2.0, not the v22 the brief pins. Not switching runtimes (no nvm/version
  manager requested); the app doesn't use anything v22-specific. Documented in `CLAUDE.md` as
  "developed against Node 25, targets Node ≥22".
- Installed `pnpm` globally via `npm install -g pnpm` (11.21.0) since neither `pnpm` nor
  `corepack` was present on the system.

## 2026-08-09 — Phase 1 (design system)

- Added two tokens beyond the brief's exact list, in the same spirit as the existing
  `--moss-deep`/`--gold-deep`: `--clay-deep` and `--plum-deep`, used as the darker
  bottom-border/background shade for the danger button variant and the plum category badge.
  Without them, `clay`/`plum` had no darker sibling to draw the "physical button" bevel or a
  readable badge background from.
- `Select` uses a native `<select>` rather than a custom listbox — full keyboard/screen-reader
  behaviour for free, restyled to the token set (chevron via lucide-react).
- `Modal` uses the native `<dialog>` element (`showModal()`) instead of a hand-rolled focus
  trap — browser gives focus containment, Escape-to-close, and top-layer stacking for free.
- `Tooltip` is CSS-only (`group-hover`/`group-focus-within`), no floating-ui positioning
  library — not in the locked stack and unnecessary for short, mostly-static tooltip content.
- `Avatar`'s generative image is a deterministic FNV-1a hash of the seed driving a symmetric
  5×5 identicon-style grid — no external avatar service, same seed always renders identically
  (including at SSR time, since it's a pure function of the seed string).
- `Timer` initializes its displayed remaining time from `deadlineMs - startedAtMs` (the full
  duration) rather than `deadlineMs - Date.now()`, to avoid an SSR/client hydration mismatch —
  reading the clock during render disagrees between server and client. The real remaining time
  is corrected client-side one animation frame after mount.

## 2026-08-09 — Phase 2 (database)

- `countries.fr.json` covers exactly the 193 UN member states, per the confirmed convention —
  no observer states either (Holy See, Palestine excluded, same reasoning as Taiwan/Kosovo/
  Western Sahara). Verified programmatically: 193 rows, unique `iso3`/`iso2`/`un_numeric`,
  all required fields present.
- `flag_emoji` is **not** stored in the JSON dataset — it's computed at seed time from `iso2`
  via Unicode regional-indicator symbols (`scripts/seed-countries.ts`). Storing 193 hand-typed
  emoji is pure transcription risk for a value that's a pure function of `iso2`.
- Population/area/centroid figures in the dataset are reasonable recent-ish approximations,
  not sourced from a live statistics feed — acceptable per brief §8.1 ("include ... population,
  area ... from a committed JSON dataset", no freshness requirement stated) since this is quiz
  reference data, not a statistics product. `centroid_lon/lat` are hand-estimated geographic
  centers (distinct from the capital coordinates for large/oddly-shaped countries like Russia,
  Egypt, Chile, Indonesia); they're a fallback/authoring convenience, not what map hit-testing
  will use in Phase 4 (that reads the real TopoJSON geometry).
- `un_numeric` codes were filled from memory against the standard ISO 3166-1 numeric / UN M49
  list. Phase 4's `scripts/build-iso-lookup.ts` (per brief §8.1) will cross-check every
  `countries-110m.json` feature's numeric id against this table and its own dedicated unit
  test (§14: "every feature ... resolves to a row ... or is explicitly in a known-exclusions
  list") — any mismatch surfaces and gets fixed there, not guessed away now.
- Cyprus is classified under `continent_fr: "Europe"` (not Asia) despite UN M49 placing it in
  Western Asia — it's an EU member state and commonly taught as European in French schooling;
  more intuitive for quiz players than the M49 technicality.
- `region_fr`/`subregion_fr` use a hand-rolled 3-tier scheme (5 continents → ~20 regions → ~25
  subregions) rather than adopting UN M49's own region/sub-region/intermediate-region levels
  verbatim — simpler and French-labelled, good enough for category filters in the authoring UI.
- Split "categories + badges seed" (brief §16 Phase 2) into two new scripts,
  `scripts/seed-categories.ts` and `scripts/seed-badges.ts`, rather than folding them into
  `seed-countries.ts` or the not-yet-existing `seed-demo.ts`. The folder layout in brief §0
  lists `seed-demo.ts` as one of the three named scripts, but categories/badges are core
  reference data the app needs to function (not demo/dev fixtures) — `seed-demo.ts` is
  reserved for actual sample content (users, questions, rooms) once a later phase has
  something meaningful to seed. `db:seed` now runs all three seed-countries/categories/badges
  scripts; all are idempotent (`onConflictDoUpdate`).
- `drizzle.config.ts` uses `dialect: "turso"` with no separate `driver` field — drizzle-kit's
  current libSQL/Turso support errors if `driver: "libsql"` is paired with `dialect: "sqlite"`
  (the combination the brief's wording suggests); `dialect: "turso"` is the supported spelling
  for this drizzle-kit version and accepts the same `file:`/`libsql:` URLs.
- `capital_iso_lat`/`capital_iso_lon` and `centroid_lon`/`centroid_lat` use Drizzle's `real()`
  column type, not `integer()` — these are floating-point coordinates; brief §5 doesn't specify
  a SQL type and `integer` would silently truncate precision.

<!-- New decisions appended below as phases progress. -->

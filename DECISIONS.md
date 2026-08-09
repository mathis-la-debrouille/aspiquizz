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

<!-- New decisions appended below as phases progress. -->

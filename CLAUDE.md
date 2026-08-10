# CLAUDE.md

Guidance for working in this repo. Read this before making changes. The full product spec
lives in the build brief that seeded this project; this file is the quick-reference summary
plus the things that only make sense once code exists. See also `DECISIONS.md` for judgement
calls made along the way.

## What this is

**ASPI Quiz** — a private, invite-only, real-time multiplayer quiz web app for a small group.
No public sign-up; admins create accounts. Interface language is **French only**; code,
identifiers, comments, and commit messages stay in **English**.

## Stack

| Concern         | Choice                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework       | Next.js 15, App Router, TypeScript strict, React 19                                                                                        |
| Runtime         | Node ≥22, custom server (`server.ts`) run via `tsx`                                                                                        |
| Styling         | Tailwind CSS v4 (CSS-first `@theme`), CSS custom properties in `src/styles/tokens.css`                                                     |
| Realtime        | Socket.IO 4.x, attached to the same HTTP server as Next, path `/ws`                                                                        |
| DB              | Turso (libSQL) via `@libsql/client`; falls back to `file:./local.db` locally                                                               |
| ORM             | Drizzle ORM + drizzle-kit                                                                                                                  |
| Validation      | Zod — every value crossing a trust boundary (server action, route handler, socket payload) is parsed with a schema from `src/lib/schemas/` |
| Auth            | Hand-rolled: `sessions` table + httpOnly cookie, `@node-rs/argon2` (argon2id)                                                              |
| Maps            | `d3-geo`, `d3-zoom`, `d3-selection`, `d3-interpolate`, `topojson-client`, `world-atlas` — SVG paths, never bitmap map images               |
| Animation       | `motion`, used sparingly, `prefers-reduced-motion` always respected                                                                        |
| Sound           | Procedural WebAudio synth (`src/lib/sound/engine.ts`), no audio files/library — see DECISIONS.md (Phase 11)                                |
| Unit tests      | Vitest (`tests/unit/`)                                                                                                                     |
| E2E             | Playwright (`tests/e2e/`)                                                                                                                  |
| Package manager | pnpm                                                                                                                                       |
| Lint/format     | ESLint flat config (`eslint.config.mjs`) + Prettier                                                                                        |

**Why a custom server:** the app runs as a single deployable process — Next.js and Socket.IO
share one Node process on one port (`server.ts`). This is incompatible with Turbopack, so dev
runs on the webpack dev server (`next dev` semantics, no `--turbopack` anywhere). `pnpm dev`
runs `tsx watch server.ts`; production runs `next build` then `tsx server.ts`.

**Local DB, zero network:** if `DATABASE_URL` is unset, the app falls back to a local libSQL
file (`file:./local.db`) so `pnpm dev` works with no external services. Set `DATABASE_URL` /
`DATABASE_AUTH_TOKEN` to point at a real Turso database.

**Node version note:** developed against Node v25 locally; the brief pins Node ≥22 and nothing
in the codebase depends on a v22-specific feature — either works. See `DECISIONS.md`.

## Commands

```bash
pnpm dev            # custom server + Next dev, http://localhost:3000
pnpm build           # next build (production bundle)
pnpm start           # NODE_ENV=production tsx server.ts — runs the production build
pnpm lint            # eslint .
pnpm lint:fix
pnpm format          # prettier --write .
pnpm format:check
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run (unit tests, tests/unit/)
pnpm test:watch
pnpm test:e2e        # playwright test (tests/e2e/) — boots its own server on :3100 against a temp DB
pnpm db:generate     # drizzle-kit generate — writes a new migration from schema.ts (from Phase 2)
pnpm db:migrate      # applies pending migrations by hand — server.ts also runs this at boot (Phase 12)
pnpm db:seed         # seeds countries (scripts/data/countries.fr.json) + categories + badges
pnpm db:studio       # drizzle-kit studio
```

After every phase: `pnpm lint && pnpm typecheck && pnpm test`, then a conventional commit
(`feat(auth): ...`, `chore(db): ...`).

## Folder layout

```
server.ts                      # HTTP server: Next handler + Socket.IO (from Phase 7)
src/
  app/
    (auth)/connexion/
    (app)/                     # authenticated shell — accueil, salon/[code], profil, classement, creer, admin
    api/                       # only where a route handler is genuinely needed
  components/
    ui/                        # design-system primitives — showcased at /dev/ui (dev-only)
    game/
    map/                       # GeoMap and friends — see /dev/map (dev-only)
    admin/
  server/
    db/ (schema.ts, index.ts, migrations/)
    auth/
    game/ (engine.ts, rooms.ts, scoring.ts, grading.ts)
    socket/ (index.ts, handlers/, events.ts)
  lib/ (schemas/, utils/, sound/, i18n copy constants)
  styles/ (tokens.css, globals.css)
scripts/ (seed-countries.ts, seed-categories.ts, seed-badges.ts, create-user.ts, migrate.ts,
          data/countries.fr.json, build-iso-lookup.ts [Phase 4], seed-demo.ts [dev fixtures, later phase])
public/geo/ (countries-110m.json, countries-50m.json)
tests/ (unit/, e2e/)
```

`src/server/db`, `src/server/auth`, `src/components/map`, `src/server/game`, and
`src/server/socket` exist (Phases 2–7); `src/components/room` (waiting room, question/reveal/
scoreboard/podium screens, per-type answer surfaces), `src/components/lobby` (room list, create
modal), `src/lib/socket/client.ts` (the `useSocket()` hook), and `src/hooks/useClockOffset.ts`
exist as of Phase 8; `src/server/progression` (badges.ts pure rules, award.ts DB orchestrator,
queries.ts for profile/leaderboard reads, actions.ts for profile edits), `src/components/profile`,
and `src/components/leaderboard` exist as of Phase 9; `src/server/admin` (guard.ts's
`requireAdmin()`, queries.ts, actions.ts) and `src/components/admin` exist as of Phase 10;
`src/lib/sound/engine.ts` (procedural WebAudio cues — no `public/sfx/` files, see DECISIONS.md)
and `src/components/app-shell/MobileNav.tsx` exist as of Phase 11. `src/components/game` only
has the authoring-time `QuestionPreview`. Don't assume a path exists; check first.

Progression (Phase 9): XP/level are computed from `game/scoring.ts`'s `xpFromPoints`/
`levelFromXp`/`xpForLevel` (brief §12 formula) — `user_stats.xp`/`.level` are a cache of that
computation over `totalPoints`, not an independent source of truth. `engine.ts`'s finishGame
calls `progression/award.ts` once per finished game; it owns `user_stats` and `user_badges`.

Admin (Phase 10): `/admin` is gated twice — `app/(app)/admin/layout.tsx` redirects non-admins
away (UX), and every mutation in `server/admin/actions.ts` calls `requireAdmin()` itself (the
actual trust boundary — a layout having run is never assumed). Question moderation is
archive/publish only, never a hard delete — a played question has `answers` rows keyed on it.
Category/media deletion are blocked (not silently ignored) while any `questions` row still
references them.
`user_category_stats` is instead updated live, per question, right next to the `answers` insert
in `engine.ts`'s question loop — see the comment there.

Realtime (Phase 7): `server.ts` attaches Socket.IO via `src/server/socket/index.ts` (path
`/ws`, cookie-handshake auth). The authoritative per-room game state is in-memory
(`src/server/game/engine.ts`, one process, a `Map<code, RoomState>`) with the DB as the durable
record — `RoomState` carries both `id` (the DB `rooms.id` ULID — use this for every
`room_players`/`room_questions`/`answers` foreign key) and `code` (the public 6-char join code
— use this for Socket.IO channel names and client-facing lookups). Mixing the two up compiles
fine (both are `string`) but fails at runtime with a `FOREIGN KEY constraint failed` — see
DECISIONS.md, this exact bug happened once already.

Map (Phase 4): only import `GeoMap` via `next/dynamic(() => import("@/components/map"), { ssr:
false })` — never a static import — so d3 stays out of shared bundles (verified against a real
build, see DECISIONS.md). `src/lib/geo/*.ts` (iso-lookup, country-names, country-centroids) are
generated by `scripts/build-iso-lookup.ts`; regenerate after any change to
`scripts/data/countries.fr.json` or the `public/geo/*.json` topology files, don't hand-edit them.

Auth (Phase 3): `middleware.ts` is a coarse, Edge-compatible, cookie-presence-only gate: it
doesn't touch the DB. The authoritative check is `getSession()` (`src/server/auth/session.ts`),
called from the `(app)` and `(auth)` layouts. Sliding session renewal happens via
`POST /api/session/touch` (a Route Handler), not inside `getSession()` — Next.js forbids
mutating cookies during a plain Server Component render. See DECISIONS.md for why.

## Conventions

- **TypeScript strict, no `any`.** `@ts-ignore` requires a one-line justification comment.
- **Zod at every trust boundary.** Define a schema once in `src/lib/schemas/`, import it from
  both the client and server side of that boundary — never re-derive the same shape twice.
- **No placeholder/mock data in production code paths.** Seed scripts (`scripts/`) are the only
  place fixtures live.
- **Correct answers never reach the client before reveal.** Sanitisation is an explicit
  whitelist mapper (`SanitisedQuestion`), not "just don't render the field" — see Phase 5/8.
  Any change touching question payloads needs a test asserting no answer leakage.
- **Server-authoritative timing.** Clients render countdowns from a server-provided deadline
  plus a measured clock offset; never trust a client-reported elapsed time.
- **Design system:** see `src/styles/tokens.css` for the "Forest Night" palette and the
  brief's §4 for the full list of forbidden "AI slop" patterns (indigo/violet gradients,
  glassmorphism, gradient text, emoji-as-icons, etc.). If you're about to reach for a purple
  gradient or a `backdrop-blur` card, stop — that's explicitly out.
- **`/dev/ui` and `/dev/map`** are dev-only playgrounds; they must 404 in production
  (`NODE_ENV === 'production'`).
- French strings live inline in components/copy constants (`src/lib/i18n`), not in a generic
  i18n framework — this app is French-only by design, no locale switching.

## Build plan status

The brief's §16 defines 12 phases in order (scaffold → design system → database → auth → map
engine → grading/scoring → authoring → realtime → game UI → progression → admin → polish →
hardening). Phase N+1 doesn't start until phase N's acceptance criteria pass. Check
`DECISIONS.md` and recent commit history for where the build currently stands.

**Addenda A and B** (question library, and a set of authoring/room fixes — inline category
creation, duration moving from question to room, a rebuilt geo editor, empty-room deletion,
category management) landed after the original 12 phases as a second wave of work, on top of an
already-complete build. Where they supersede a decision from the original brief (§5, §6, §10.1,
§11.3), the addendum wins — see `DECISIONS.md` entries dated after the Phase 12 hardening one.

## Do not

- Add a sign-up route, OAuth, or "forgot password" flow — accounts are admin-created only, by
  design, not by oversight.
- Write deployment config beyond `.env.example` and what `server.ts`/`/healthz` already do.
  No CI, no `railway.json`. The user provisions Railway/Turso themselves.
- Serve uploaded media from `public/` — it goes through the authenticated `/media/[id]` route
  reading from `UPLOAD_DIR` (`./.uploads` locally).

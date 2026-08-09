# ASPI Quiz

A private, invite-only, real-time multiplayer quiz for a small group of friends — categories,
timed questions (open-answer, multiple-choice, image, and geography/map), live scoring,
progression (XP/levels/badges), and leaderboards. French-only interface; no public sign-up —
an admin creates every account.

## Stack

Next.js 15 (App Router, TypeScript strict) + Socket.IO 4 on one custom Node server, Drizzle ORM
over Turso/libSQL, Tailwind CSS v4, hand-rolled session auth, and a hand-rolled vector map engine
(`d3-geo`/`d3-zoom`/`topojson-client` — no bitmap map images). See `CLAUDE.md` for the full
stack table and the conventions this codebase follows; see `DECISIONS.md` for a running log of
the judgement calls made while building it, phase by phase.

## Requirements

- Node ≥ 22
- pnpm (`corepack enable` is enough — see `devEngines` in `package.json`)

No other services are required to run this locally: with `DATABASE_URL` unset, the app falls
back to a local libSQL file (`./local.db`), and uploaded media is stored under `./.uploads`.

## Getting started

```bash
pnpm install
cp .env.example .env        # defaults already work for local dev — see below
pnpm db:migrate              # creates local.db and applies the schema
pnpm db:seed                 # countries, categories, and the static badge catalog
pnpm tsx scripts/create-user.ts --username admin --password <a-real-password> --role admin
pnpm dev
```

Open http://localhost:3000, log in with the account you just created. There's no sign-up route
— every other account also comes from `create-user.ts` (or the in-app admin panel at `/admin`
once you're logged in as an admin) — see the "No public sign-up" note below.

## Environment variables

See `.env.example`. Everything has a working local default except `DATABASE_URL`/
`DATABASE_AUTH_TOKEN`, which only need to be set to point the app at a real Turso database
instead of the local file fallback.

| Variable               | Default            | Notes                                                                             |
| ----------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `file:./local.db`   | A `libsql://...` Turso URL in production.                                        |
| `DATABASE_AUTH_TOKEN`   | (unset)             | Required alongside a real `DATABASE_URL`.                                        |
| `SESSION_COOKIE_NAME`   | `aspi_session`      | Rarely worth changing.                                                           |
| `UPLOAD_DIR`            | `./.uploads`        | Where uploaded question images live — needs to be a persistent volume in prod (a redeploy without one loses every uploaded image, though the DB rows/question text survive). |
| `PORT`                  | `3000`              |                                                                                    |
| `NODE_ENV`              | `development`       | `production` disables Next's dev-mode extras and switches cookies to `secure`.    |

## Commands

```bash
pnpm dev             # custom server + Next dev, http://localhost:3000
pnpm build           # next build (production bundle)
pnpm start           # NODE_ENV=production tsx server.ts — runs the production build
pnpm lint            # eslint .
pnpm format          # prettier --write .
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run (tests/unit/)
pnpm test:e2e        # playwright test (tests/e2e/) — boots its own server on :3100 against a temp DB
pnpm db:generate     # drizzle-kit generate — writes a new migration from a schema.ts change
pnpm db:migrate      # applies pending migrations by hand (server.ts also does this at boot)
pnpm db:seed         # seeds countries + categories + the static badge catalog
pnpm db:studio       # drizzle-kit studio, a DB browser
```

## Accounts

There is no sign-up route, by design (brief §9) — this is a private app for a known group.
Create accounts either from the CLI:

```bash
pnpm tsx scripts/create-user.ts --username alice --password <...> --role player
# --role admin for an admin account; --display-name to set a display name other than the
# username; --stdin to pipe the password in instead of putting it in shell history
```

or, once at least one admin account exists, from `/admin` in the app itself (create users,
promote/demote roles, deactivate accounts — never delete one, see `DECISIONS.md` Phase 10).

## Deployment

The brief deliberately rules out any deployment config beyond this README, `.env.example`, and
what `server.ts`/`/healthz` already do — no CI config, no `railway.json`, nothing that assumes
a specific provider. In practice that means:

- **Process**: `pnpm build` then `pnpm start` (`NODE_ENV=production tsx server.ts`) — one process,
  one port, serving both the Next app and the Socket.IO `/ws` endpoint.
- **Migrations run automatically at boot**, before the server starts accepting connections
  (`server.ts` calls `scripts/migrate.ts`'s `runMigrations()` first thing) — there's no separate
  migration step to remember as part of a deploy.
- **`/healthz`** returns `{ ok, dbOk, version, uptimeS }` — `ok` reflects the process itself,
  `dbOk` is a real round-trip to the database so a DB outage is visible without making the
  container's basic liveness check flap.
- **Graceful shutdown** on `SIGTERM`/`SIGINT`: every in-flight game loop is cancelled, every
  connected client gets a `server_shutdown` notice so the UI can show something better than a
  silent disconnect, and every non-finished room is marked `abandoned` immediately rather than
  waiting for the next boot's stale-room cleanup to notice.
- **Persistent storage needed for two things**: the SQLite file if you're using the local
  fallback instead of Turso (`DATABASE_URL` unset — fine for a single small deployment, not for
  anything that needs to survive a redeploy without a volume), and `UPLOAD_DIR` for uploaded
  question images either way. A managed Turso database sidesteps the first; the second always
  needs a volume regardless of which database you use.

## Project layout

See `CLAUDE.md`'s "Repo layout" section for the annotated folder tree and which phase each part
of the codebase was built in.

## Testing notes

Unit tests (`pnpm test`) cover the pure logic — grading, scoring/XP, the map's iso lookup,
sanitisation, badge rules, room-code generation. `tests/e2e/` exists for Playwright but wasn't
built out to a full suite in this pass; the realtime game loop was instead verified with
scripted two-client `socket.io-client`/Playwright runs during development (see `DECISIONS.md`,
Phases 7 onward) rather than as a committed, repeatable e2e suite.

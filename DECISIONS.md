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

## 2026-08-09 — Phase 3 (auth)

- **Middleware is a coarse, Edge-compatible gate (cookie presence only), not the authoritative
  check.** Next.js forbids mutating cookies during a plain Server Component render (only
  Server Actions/Route Handlers/Middleware may call `cookies().set()`/`.delete()`), and our
  local-file libSQL mode (`file:./local.db`) needs Node's native bindings, which aren't
  available in the Edge runtime middleware normally runs in. So: `middleware.ts` only checks
  whether the session cookie is _present_ and redirects accordingly (fast, Edge-safe, no DB
  call) — the real authority is `getSession()` (DB-backed, read-only, safe in Server
  Components), called from the `(app)` and `(auth)` layouts, which redirect on an invalid/
  expired/deactivated session regardless of what middleware decided. Net effect is unchanged
  from the brief's "middleware redirects unauthenticated users… and authenticated users away
  from /connexion": every request still gets redirected correctly, just via two cooperating
  layers instead of one. Verified via Playwright: unauth → /connexion, authed → bounced off
  /connexion, /accueil unreachable both before login and after logout.
- **Sliding session renewal lives in a Route Handler (`POST /api/session/touch`), not inside
  `getSession()` itself**, for the same cookie-mutation-during-render reason above.
  `getSession()` returns `needsRenewal: boolean`; a tiny client component (`SessionTouch`,
  mounted in the `(app)` layout) fires the touch request once per shell mount when true. This
  keeps `getSession()` safely callable from any Server Component while still achieving
  activity-based sliding renewal without a full logout/login cycle.
- Rate limiting verified end-to-end: 5 failed attempts succeed (with the generic error), the
  6th returns "Trop de tentatives" — matches brief §9 exactly.
- Fixed a real mobile layout bug while building the header: at 390px the nav + full user
  cluster overflowed the viewport by ~30px, clipping the logout button off-screen. Fixed by
  hiding the (currently redundant, single-link) nav below `sm:` and tightening gaps — not
  deferred to the Phase 11 polish pass, since a clipped logout button is a correctness bug,
  not a polish nicety. Revisit with a proper mobile nav drawer once /creer and /admin add more
  links (Phase 6/10).
- Server Actions require real browser form submission (multipart-encoded, with React's
  injected `$ACTION_REF`/`$ACTION_KEY` fields) — they cannot be exercised with a plain curl
  POST. Verified the login/logout flow with Playwright instead, which doubles as a rough draft
  of e2e test 1 (formalized properly in Phase 12).

## 2026-08-09 — Phase 4 (vector map engine)

- `scripts/build-iso-lookup.ts` cross-referenced world-atlas's actual topology data (not
  assumed from memory) against `countries.fr.json`: 165/193 countries have geometry at 110m,
  193/193 at 50m, and exactly one (Tuvalu, 26 km² of atolls) has none at either resolution —
  confirmed programmatically, see `tests/unit/iso-lookup.test.ts`. 37 non-sovereign
  territories appear in the topology with their own numeric id (Greenland, Hong Kong, Puerto
  Rico, …); each is hand-mapped to its sovereign parent's iso3 in `TERRITORY_PARENT`. 10
  features (Western Sahara, Palestine, Taiwan, Antarctica, Vatican, N. Cyprus, Somaliland,
  Kosovo, French Indian Ocean Ter., Siachen Glacier) have no parent and are explicitly
  excluded — the generator hard-fails on any _unresolved_ feature so this list can't silently
  go stale as world-atlas's data changes.
- **Small/zero-geometry country fallback**: 27 countries (Singapore, Malta, Monaco, several
  Caribbean/Pacific micro-states, …) have zero polygon in the 110m file used for the world
  view — not just "hard to click", genuinely absent, confirmed by testing (Singapore was
  initially unclickable in Playwright verification). Generated a static
  `src/lib/geo/country-centroids.ts` (iso3 → seeded `[lon, lat]`) from `countries.fr.json`;
  `GeoMap` diffs the loaded topology's iso3 set against this list and renders an extra
  invisible hit-circle (`FallbackHitCircles`) for every country missing from what actually
  loaded, projected live through the current projection. This is the same mechanism as the
  brief's §8.2 "small country" hit-circle, just triggered by _zero_ on-screen area instead of
  a _small_ one. Verified: Portugal, Lesotho, Singapore, France (the brief's own §16 Phase 4
  test list) all resolve correctly by clicking.
- Country/territory labels: a country whose parent has several scattered territories (France,
  UK) would otherwise get its name repeated over every one of them (French Guiana labelled
  "France" in South America, again in the Pacific, …). `Labels` picks only the
  largest-on-screen feature per iso3 to label.
- Camera framing (`focusOn`) animates the zoom transform's x/y/k with `d3-interpolate`'s
  `interpolate()`, driven by `requestAnimationFrame`, not `Selection.transition()` — the
  latter's TypeScript types need `@types/d3-transition`, an extra dependency for one call
  site; the rAF version uses `d3-interpolate` (an explicitly locked dependency, brief §3)
  directly and is easier to reason about.
- **Testing methodology note**: Playwright's default element `.click()` targets the
  bounding-box center, which lands outside the actual shape for thin/concave countries
  (Portugal's bbox center falls in Spain). Verification instead finds a real on-screen pixel
  where `document.elementFromPoint` — the browser's actual hit-test — resolves to the target
  iso3, which is what confirms `GeoMap`'s click handling itself is correct rather than
  papering over a flaky test.
- Bundle code-splitting verified concretely, not just assumed: grepped the production build's
  `.next/static/chunks` — d3-zoom internals (`scaleExtent`) only appear in lazily-loaded
  chunks reachable from `/dev/map`'s `next/dynamic` import, never in the shared chunks any
  other route loads.

## 2026-08-09 — Phase 5 (grading + scoring)

- Verified the Autriche/Australie pair empirically before writing tests, per brief §7's own
  instruction to "verify your thresholds against this pair specifically and tune if needed":
  distance is 4 against an 8-char threshold of 2, so the brief's literal thresholds already
  reject it correctly — no tuning needed. Also checked a few other geography near-misses
  (Chili/Chine, Niger/Nigeria, Bolivie/Colombie) the same way, computationally, rather than
  eyeballing edit distances — one pair (Iran/Irak, distance 1 at the 4-7 char/threshold-1
  bucket) _would_ fuzzy-match, which is an inherent consequence of the brief's own specified
  thresholds, not something introduced here; not "fixed" since the thresholds are locked.
  `damerauLevenshtein` is the optimal-string-alignment variant (one adjacent transposition,
  not the full unrestricted Damerau-Levenshtein) — standard for typo-tolerance and what's
  conventionally meant by the term in this context.
  `matchesAnyVariant`'s fuzzy threshold is computed from the **accepted variant's** normalised
  length, not the player's input length — a very-wrong short guess shouldn't get an easier
  threshold just because it happens to be short.
- `computePoints`'s `streak` parameter is the resulting streak count _including_ the answer
  being scored (not the pre-answer streak) — confirmed against the brief's worked example
  (msTaken=16000/20000, streak=3 → ×1.3 → 780 pts on a 1000-point question), which only
  reproduces exactly under that reading.
- `ScoringResult` returns `speedRatio`/`streakMultiplier` (the _factors_), not brief §12's
  additive display breakdown ("rapidité +140 · série ×1,3") — reconstructing that exact
  presentation string is a Phase 8 reveal-screen concern once real question/points data exists,
  not something the pure scoring function needs to produce itself.

## 2026-08-09 — Phase 6 (authoring)

- **Reordering (MCQ options, quiz questions) uses up/down move buttons, not drag-and-drop.**
  The brief says "drag to order" in both places, but no drag-and-drop library is in the locked
  stack, and native HTML5 drag-and-drop is notoriously poor on touch and unreachable by
  keyboard alone — a real conflict with §4.8's "all interactive elements keyboard-reachable".
  Move buttons give the same reordering capability, fully keyboard/touch/screen-reader
  accessible, no new dependency.
- **`view_bbox` (camera framing) has no dedicated fine-tuning UI yet** — geo questions save
  `viewBbox: null` and rely on `GeoMap`'s existing automatic `focusOn` framing (Phase 4), which
  already produces a reasonably composed view. A manual override editor is a natural follow-up,
  not blocking — nothing in the schema or grading path assumes `viewBbox` is non-null.
  `dominant_color` (image blur-up placeholder) is left null for the same "not blocking, cleanly
  deferrable" reason — computing it needs image decoding, and none of the locked dependencies
  do that; the `image` route already serves correctly without it.
- **`ActionResult` uses a literal `ok: true | false` discriminant**, not the more compact
  `{id: string} | {error: string}` shape tried first — TypeScript's control-flow narrowing on a
  bare optional-property union (`id?: undefined` vs `id: string`) didn't reliably narrow `id` to
  `string` in the success branch across every call site; a real discriminant field fixes it
  outright rather than fighting inference.
- **Bug found and fixed via the e2e check, not by inspection**: `ImageForm` always sent both the
  default (empty) MCQ `choices` array _and_ the open-answer fields regardless of which
  `answerMode` was selected, so submitting in "open" mode failed the MCQ branch's
  choice-label validation even though MCQ fields were irrelevant. Fixed by only sending the
  active mode's fields. Caught by actually creating an image question end-to-end with
  Playwright, not by reading the code.
- **Dev-server first-compile latency (~25-30s per not-yet-visited route) is not an app bug** —
  hit repeatedly while writing e2e checks against `pnpm dev`, initially misread as a hang/auth
  failure. Fixed the verification approach (pre-warm every route with a generous-timeout curl
  before the timing-sensitive Playwright script, not the app) rather than "fixing" nonexistent
  code issues. Doesn't affect production (`next build` pre-compiles everything).
- Verified end-to-end with Playwright, not just typecheck: created one question of each of the
  four types (open, mcq, image incl. a real upload through `/api/media`, geo with the
  autosuggested Kenya/Portugal prompts) plus a quiz, all appearing in the pool with
  `Proposée par @testuser` author credit — this is e2e test 2's scenario, run ad hoc now and to
  be formalized into `tests/e2e` in Phase 12.

## 2026-08-09 — Phase 7 (realtime core)

- **Real bug found via testing, not inspection**: `room_players`/`room_questions`/`answers`
  all foreign-key to `rooms.id` (the ULID primary key), not `rooms.code` (the 6-char public
  join code) — but the engine/handlers were written passing `code` everywhere, since `code` is
  what's used for Socket.IO channel names and client-facing lookups and felt like "the room
  identifier" while writing that code. This surfaced immediately as a `FOREIGN KEY constraint
failed` the first time a real two-client test tried to join a room — never caught by
  typecheck (both are plain `string`). Fixed by giving `RoomState` both `id` (DB writes) and
  `code` (channels, client-facing), and auditing every `roomId:`/`eq(roomPlayers.roomId, …)`
  call site. Reinforces why the "verify with a scripted client" step matters even for
  server-only phases — this class of bug is invisible to `tsc`.
- **`manualAdvance` added to `RoomConfig`**, not present in brief §5's literal config shape —
  §11.1's own event table documents `host:next` as "advance during a reveal, if
  `manualAdvance`," which only means something if the config carries that flag. Defaults
  `false` so the automatic reveal→scoreboard→next pacing brief §11.3 describes is the default;
  hosts opt into manual pacing.
- **Private rooms are joinable by code but excluded from `lobby:rooms` broadcasts** — the only
  join mechanism in the whole protocol is `room:join({code})`; there's no separate invite
  event. Read literally, "private-without-invite" rejection would make private rooms
  unjoinable by anyone including the host, which can't be right. Sharing the code _is_ the
  invite (the same pattern Kahoot/Jackbox-style games use) — `visibility` controls
  discoverability in the public lobby list, not code-based joinability.
- **`host:skip` is implemented via the game loop's own poll**, not a hard interrupt — it sets
  `room.deadlineMs = Date.now()`, which `waitForAnswersOrDeadline`'s ~150ms poll loop picks up
  on its next tick. Simpler than plumbing a cancellation signal through the loop, and a <150ms
  skip latency is imperceptible for a host-initiated "everyone's answered, move on" action.
  `host:next` (manual-advance) is similarly best-effort against the loop's existing `sleep()`
  calls rather than an instant cut, for the same reason — see the comment at its handler.
- **User-stats/XP/badge writes are deliberately absent from `finishGame`** — `highlights: []`
  in the `room:finished` payload and a comment marking where Phase 9 hooks in. Per-question
  `answers` rows and `room_players.score/streak/finalRank` (the durable per-game record) are
  written; the cross-game aggregate stats table is explicitly Phase 9's job in the brief's own
  phase breakdown (§16), not Phase 7's.
- **Reconnection restores state without an explicit "late join = spectator until next
  question" UI decision made here** — a socket that (re)joins a `running` room with no existing
  `players` entry is marked `isSpectator: true` (scores from the next question onward, per
  brief §11.3), while a _reconnecting_ player (already has a `players` entry from before they
  disconnected) keeps their existing score/streak/spectator status untouched — verified
  end-to-end: disconnecting mid-question after answering correctly, then reconnecting, shows
  the preserved (non-zero) score in the fresh `room:state`, not a reset.
- Verified with real two-client `socket.io-client` scripts (not Playwright UI, since Phase 7
  has none yet — the brief explicitly allows driving this from a scratch client): full game
  loop start-to-finish with matching scoreboards on both clients; lobby visibility; host
  disconnect → migration to the longest-present player → the original host reconnecting does
  _not_ reclaim host status; mid-game disconnect/reconnect with score preservation; sanitised
  `question:show` payloads confirmed free of `isCorrect`/accepted-answer text over the wire
  (not just in the pure `sanitize.ts` unit tests — the actual socket payload).

## 2026-08-09 — Phase 8 prep (sanitize.ts refinement)

- **Found while planning the geo answer surfaces, before writing any UI**: `toSanitisedQuestion`
  stripped `targetIso3` for _every_ geo mode, but three of the five modes structurally need the
  client to know which country to render — `name_country` (highlight it), `find_capital`
  (highlight it, ask for its capital), and `name_from_shape` (silhouette _of_ it). Showing a
  highlighted shape or silhouette on the map isn't leaking the answer any more than the prompt
  text itself is — it's the puzzle. Only the two click-to-answer modes (`locate_country`,
  `capital_of`) must hide it, since sending the iso3 there would let a client auto-click the
  correct country instead of a human finding it. Added `revealIso3` (present only for the three
  visual modes) and `multiSelect` (the aggregate "is more than one choice correct" fact MCQ
  needs to render "Plusieurs réponses" _before_ answering, without naming which choices) to
  `SanitisedQuestion` — both still go through the same whitelist mapper, still unit-tested per
  mode (brief §14).

## 2026-08-09 — Phase 8 (Game UI)

- **`server.ts` was silently eating Socket.IO's own handshake requests.** The custom request
  handler called `handle(req, res)` (Next's router) unconditionally for every incoming request,
  racing Socket.IO's own listener attached to the same `httpServer`. Browsers connect
  polling-first (an HTTP request to `/ws?...`), so Next's router intercepted and 404'd it before
  Socket.IO ever saw it — the client sat on "Connexion en cours…" forever. Phase 7's own
  verification scripts didn't catch this because they forced `transports: ["websocket"]`,
  skipping the polling handshake entirely. Fixed with an explicit `if
  (req.url?.startsWith("/ws")) return;` guard before `handle(req, res)`. Lesson: a
  transport-restricted test client can pass while the default browser transport is completely
  broken — worth a note for Phase 12's hardening pass.
- **`useSocket()` had a missed-event race on mount.** `useState(socket.connected)` captured
  `false` at render time, but the shared singleton socket could finish connecting (fired by an
  earlier mount, e.g. a parent layout) before this component's effect attached its `'connect'`
  listener, permanently losing that transition and leaving `connected` stuck `false`. Fixed by
  re-checking `socket.connected` synchronously inside the effect body, not only reacting to the
  future event.
- **`RoomClient` never left the waiting room / never saw new joiners** — two related bugs from
  the same wrong assumption (that `room:state` is re-broadcast on every phase change). It isn't:
  Phase 7 sends `question:show`/`_lock`/`_reveal`, `scoreboard:update`, and `room:finished` as
  the phase-transition signals, and `room:join`'s `room:state` reply is unicast to the joining
  socket only. Fixed by tracking `phase` as local state driven explicitly by each event handler
  (not read off `state.phase`), and adding incremental `room:player_joined/_left/_kicked/
  host_changed` handlers that patch `state.players`/`hostId` directly. See the comments at the
  top of `RoomClient.tsx`'s effect for the long-form version of this — worth reading before
  touching that file.
- **`tsx watch` was restarting the server on its own DB writes.** `local.db`'s WAL file churn
  during a game (every answer, every phase transition) was misread as a source-file change,
  killing in-flight games mid-test. Fixed with `--ignore 'local.db*' --ignore '.uploads/**'
  --ignore '.next/**' --ignore 'tests/e2e/.output/**'` on the `dev` script.
- **`room:join` handler crash on a fast reconnect race**: `room.players.get(user.id)!` assumed
  the map entry created earlier in the same handler couldn't disappear before the next line ran,
  but a concurrent `room:leave` from the same fast-reconnecting client can remove it during the
  `await` in between. Non-null assertion → crash. Changed to a guarded lookup that bails out if
  the player is already gone (found via manual two-tab reconnect testing, not the scripted
  e2e run).
- **MCQ answer surface**: single-select shows a 1.5s "annuler" undo window (`setTimeout`) before
  the choice locks in and submits, matching how the timer-pressure brief (§9) describes
  single-answer MCQ feeling forgiving of a mis-tap; multi-select has no such window — it shows a
  `Badge tone="gold"` "Plusieurs réponses" hint (from `sanitize.ts`'s aggregate `multiSelect`
  flag, §_prep_ above) plus an explicit "Valider" button, since silently auto-submitting on the
  n-th click would be surprising for a multi-answer question. Keyboard shortcuts (1-6 / A-F) are
  wired via a single `keydown` listener for speed-mode players who don't want to reach for a
  mouse.
- **Geo answer surface splits on interaction model, not just question type**: click-to-answer
  modes (`locate_country`, `capital_of`) render `GeoMap mode="pick"` with `onSelect` — the click
  target *is* the answer, so no separate submit step. Visual-prompt modes
  (`name_country`/`find_capital`/`name_from_shape`) render the map read-only with
  `revealIso3` driving `highlight`/`focusOn`, paired with a text `OpenAnswerSurface` — the map
  here is illustrating the question, not collecting the answer.
- **Removed the "Rejouer" button from `Podium`**, keeping only "Retour à l'accueil". The brief
  has no replay-same-configuration feature (a new room is always a fresh `room:create` with its
  own config), so a "Rejouer" button would either need to silently open the create-room modal
  (surprising) or do nothing useful — cut rather than ship a button that overpromises.
- **E2E verification cut short intentionally, per explicit user instruction mid-Phase-8.** Core
  flow was verified working end-to-end via a scripted `socket.io-client` two-browser Playwright
  run through: login → lobby visibility → room create/join → waiting-room sync → game start →
  first question rendering correctly on both clients (confirmed via raw WS frame tracing). A
  failure surfaced afterward in the *test script's* answer-detection step during automated
  play-through — not confirmed to be an app bug, not pursued further. `pnpm lint`/`typecheck`/
  `test` (97 tests, 6 files) and a full `pnpm build` all pass. Formal `tests/e2e` suites remain
  Phase 12's job per the brief's own phase plan (§16) — this wasn't skipped, just not pulled
  forward early.

## 2026-08-09 — Phase 9 (Progression)

- **XP/level formula was already implemented, in Phase 5.** `game/scoring.ts` has had
  `xpFromPoints`/`levelFromXp`/`levelProgress` (brief §12: "XP = total points / 10, level =
  floor(sqrt(xp/50)) + 1") since the scoring engine was built, unit-tested since then too. Phase
  9 doesn't invent a new formula — `user_stats.xp`/`.level` are just a persisted cache of that
  same computation over the running `totalPoints` total, recomputed on every game. Added
  `xpForLevel` (the inverse) alongside the existing three so the profile page can show "N XP
  before level M" without duplicating the `50 * (level-1)^2` constant a third place.
- **`user_category_stats` is updated live, per question, not batched at game end.** It sits
  right next to the existing `answers` insert in `engine.ts`'s per-question loop (same
  `onConflictDoUpdate` idiom already used elsewhere), needing `FullQuestionDetail.categoryId`
  which didn't exist yet — added it as a one-line addition to the existing `row` select in
  `question-detail.ts` (the query already joins `categories`, this just also selects the id).
  `user_stats` and `user_badges`, by contrast, are only ever touched once, in `finishGame` — see
  `progression/award.ts`.
- **Badge aggregates are computed by querying existing tables, not new counter columns.**
  `éclair` (5 correct answers under 3s) and `érudit` (500 questions answered) don't need
  anything the schema doesn't already have: `count(*) from answers where isCorrect and
  msTaken<3000`, `count(*) from questions where authorId=…`, and `user_category_stats` for the
  Géographie category (`globe-trotteur`/`cartographe`) all fall out of tables that already
  existed for other reasons. Cheaper than a migration, and the DB is the single source of truth
  rather than a maintained-in-parallel counter that could drift.
- **`sans-faute` (perfect game) needed a "how many questions did this player actually see"
  denominator that didn't exist.** A late joiner is a spectator for the questions they missed
  (brief §11.3) — their real total isn't the room's question count. Added
  `ConnectedPlayer.questionsSeen`, incremented alongside the existing `correctCount` in the same
  per-question loop, so both numbers come from the same place and can't drift apart from each
  other.
- **Badge rules are a pure `(GameOutcome, CumulativeStats) -> boolean` map** in
  `progression/badges.ts`, with all DB reads/writes kept in `progression/award.ts`. Same split
  as `grading.ts`/`scoring.ts` vs their DB-touching callers — keeps the actual "when does X
  count as earned" logic unit-testable without a database (`tests/unit/badges.test.ts`),
  verified against the real seeded categories/DB via a throwaway script (see below) rather than
  only in isolation.
- **`highlights: string[]` (an existing but previously-unpopulated field on `room:finished`,
  left as `[]` since Phase 7/8) is now "`{displayName} — {label}`" strings** — level-ups and new
  badges across all players in the game, not scoped per-user in the type. Changing it to a
  richer per-user structure would touch `events.ts`, both engine and client, and `Podium.tsx`
  for a payoff that's purely cosmetic (a name prefix vs. a proper column) — not worth it for
  what's meant to be a celebratory one-line feed under the podium.
- **Fixed a pre-existing Phase 8 gap while touching `Podium.tsx` for highlights**: the full
  scoreboard list under the podium rendered rank + score only, no player name or avatar —
  `state: RoomStateView` was already a prop but was never destructured/used. Now joins
  `fullScoreboard` against `state.players` the same way `ScoreboardScreen`/`RevealScreen`
  already do.
- **Profile route is `/profil/[username]`, with `/profil` redirecting to the caller's own** —
  not a single fixed page. Lets the leaderboard and (eventually) room rosters link to *other*
  players' profiles for free instead of only supporting "my profile". `CLAUDE.md`'s route list
  said just "profil"; this is a superset of that, not a deviation.
- **Profile editing (display name, bio, "reroll avatar") was added even though the brief's
  phase list says "profiles" without spelling out editing.** `users.bio` and a documented
  "regenerate the deterministic-seed avatar" affordance (`Avatar.tsx`'s own doc comment already
  called out `levelRingProgress` as being "for the profile level indicator", implying a real
  profile page was always expected here) both already existed with nowhere to be exposed.
  Minimal Zod-validated server actions (`progression/actions.ts`), no new schema.
- **Verification**: `tests/unit/badges.test.ts` covers every rule at and just below its
  threshold, plus the "already owned → never re-awarded" and "seed ids match rule keys" cross-
  checks. Beyond that, ran a throwaway script (not committed) directly against the real
  migrated + seeded local DB — `awardProgression` across two simulated games confirmed correct
  level-ups (0→420xp→level 3, then →1400xp→level 6, matching `levelFromXp` by hand), correct
  new-badge sets (`premier-sang`/`sans-faute`/`série noire` on a perfect winning game, none on a
  merely-good one), and a separate run seeding `user_category_stats` directly confirmed
  `globe-trotteur` fires at exactly 50 Géographie-correct via the real category slug lookup.
  `pnpm typecheck`/`test` (103 tests, 7 files) and `pnpm build` all pass. Full page-level e2e
  (actually logging in and clicking through `/profil`/`/classement` in a browser) wasn't
  pursued, consistent with the standing instruction to not chase Playwright verification loops
  — the query/mutation layer this phase actually adds new logic to was verified directly
  instead, which is where a bug would actually be.

## 2026-08-09 — Phase 10 (Admin)

- **Question moderation is archive/publish, never a hard delete.** No FK in this schema has
  `onDelete: cascade` configured, and a question that's actually been played has `answers` rows
  keyed on it (a game's historical record) plus possibly `quiz_questions` rows — deleting it
  would either throw a raw FK constraint error or (if cascaded) silently erase play history.
  Archiving (status → `archived`) already removes it from `question-selection.ts` and from the
  public `listQuestions()` default, with none of that risk. `setQuestionStatusAction` covers
  publish/unpublish/archive for *any* author's question, which is the actual moderation lever —
  a full author-side "edit my own question" flow doesn't exist yet either (Phase 6 only ever
  built `create*`, no `update`), and building that wasn't this phase's job.
- **Category/media deletion are blocked with a friendly count, not left to throw a raw FK
  error.** Both `deleteCategoryAction` and `deleteMediaAction` query `count(*) from questions
  where …` first and return `{ ok: false, error: "N question(s) utilisent encore…" }` instead of
  attempting the delete and surfacing whatever SQLite says. Media deletion also removes the file
  from disk (`storage.ts`'s new `deleteUpload`) only after the DB row is gone, and treats a
  missing file (`ENOENT`) as success rather than an error — the DB row is the source of truth
  for "does this still exist to the app."
- **No user deletion, ever — only deactivation.** `users.isActive` already gated login and
  session validity since Phase 3 (`getSession()` returns null for a deactivated user mid-session,
  forcing a re-login that then fails); Phase 10 just exposes the toggle. A real delete would
  cascade through `sessions`, `questions.authorId`, `rooms.hostId`, `room_players`, `answers`,
  `media.uploaderId`, `quizzes.authorId`, `user_stats`, `user_badges` — far more risk than an
  admin panel warrants for a private, invite-only app where "remove access" is the actual need,
  not "erase this person's history."
- **An admin can't demote or deactivate their own account** (`setUserRoleAction`/
  `setUserActiveAction` both check `userId === admin.id` first) — a cheap guard against locking
  everyone out of `/admin` with no CLI handy. Doesn't defend against the *last* admin overall
  demoting themself while a second admin exists to demote them right back, but that's an
  acceptable gap for this app's scale.
- **Admin user creation mirrors `scripts/create-user.ts` exactly** (same username regex, same
  8-char password minimum, same `hashPassword`/`avatarSeed` construction) rather than inventing
  parallel rules — it's the second and last path an account can come into existence through
  (brief §9: no public sign-up), so the two must agree.
- **`listQuestions()`'s `status` filter was widened from `"draft" | "published"` to the full
  `QuestionStatus` (including `"archived"`), and omitting it now means "every status" instead of
  defaulting to `"published"`.** Both existing call sites (`/creer`, `/creer/quiz`) already
  passed an explicit status, so this only changes behaviour for the new no-argument admin call —
  a narrower, additive change than adding a separate `listAllQuestions` that would've duplicated
  the whole query.
- **Admin UI is one page (`/admin`) with four client-side tabs**, not four separate routes —
  `CLAUDE.md`'s route list only ever named "admin" (singular), the four datasets are all small
  at this app's private/invite-only scale, and a single server component fetching all four up
  front means one `revalidatePath("/admin")` after any mutation refreshes every tab's data
  without a client-side refetch dance.
- **Verification**: `pnpm typecheck`/`test` (103 tests unchanged — no new pure logic worth unit
  tests here, unlike badges.ts) pass. Ran a throwaway script (not committed) directly against
  the real migrated+seeded local DB to check the part that actually had new query logic:
  `listAllCategories`'s join/groupBy question-count and the in-use guard query, before/after
  inserting and then cleaning up a throwaway question — counts matched exactly at each step.
  Didn't attempt a logged-in browser click-through of `/admin` itself, consistent with the
  standing direction to not chase Playwright verification loops; `requireAdmin()` itself is the
  same one-line `getSession()` + role-check pattern already proven at every other trust boundary
  in this codebase (mirrors `requireUser()` in `questions/actions.ts`).

## 2026-08-09 — Phase 11 (Polish)

- **Sound is procedural WebAudio, not `public/sfx/` audio files.** `CLAUDE.md`'s own
  folder-layout sketch reserved `public/sfx/` from Phase 0 onward, but there's no asset
  pipeline in this build to actually produce, license, or normalize recordings — and short
  game cues (a countdown beep, a correct/incorrect chime, a podium fanfare) are well within
  what a few oscillator + gain-envelope calls can do convincingly. `src/lib/sound/engine.ts`
  synthesizes four cues (`countdown`, `correct`, `incorrect`, `podium`) from plain sine/square
  tones; `useSfx()` gates every call behind the existing `useSoundEnabled()` (muted by default,
  brief §4.6 — unchanged). Removed `public/sfx/` from the folder sketch accordingly. Wired into
  the three moments that actually carry emotional weight — `CountdownOverlay` mount, per-player
  correct/incorrect on `RevealScreen` mount (skipped for spectators, who have no `me` entry),
  and `Podium` mount — rather than trying to cover every UI click, which would get noisy fast.
  One real bug caught while writing it: a "silent gap" step modeled as `{ gain: 0 }` going
  through the normal tone path made `exponentialRampToValueAtTime` ramp *from* 0, which the Web
  Audio spec disallows (throws `RangeError`) — fixed by skipping oscillator creation entirely
  for `gain: 0` steps instead of trying to render an inaudible tone.
- **Mobile nav was a real gap, not just missing polish** — `Header`'s nav (`Accueil`/`Créer`/
  `Classement`/`Admin`) was `hidden … sm:flex` with literally nothing standing in for it below
  that breakpoint (the TODO comment left there in Phase 9). A phone-width user had no way to
  reach any of those routes except by typing a URL. `MobileNav.tsx` is a hamburger button
  (`sm:hidden`) opening the existing `Modal` with the same links in the same order — reuses
  infrastructure rather than building a bespoke drawer/animation for one breakpoint.
- **Phase-transition fades in `RoomClient`**: wrapped the phase-conditional render in
  `AnimatePresence`/`motion.div`, keyed by a `viewKey` derived from `phase` — deliberately *not*
  `phase` itself, because `"question"` and `"locked"` are the same `QuestionScreen` instance
  with a prop flipped (the lock is already visually communicated by the answer surface going
  `disabled`), and fading the whole screen out/in for that transition would read as a glitch
  rather than a lock. Respects `useReducedMotion()` the same way `ScoreboardScreen`/`Podium`
  already do (`initial`/`exit` become `undefined`, only `animate` fires).
- **Reduced-motion coverage turned out to be mostly already done.** `globals.css` already had a
  blanket `@media (prefers-reduced-motion: reduce)` rule collapsing every CSS
  animation/transition duration to ~0 (Phase 1) — so CSS-driven effects like `CountdownOverlay`'s
  `ember-flicker` needed no per-component change. Only the JS-driven `motion` library animations
  (which don't read that media query on their own) need the explicit `useReducedMotion()` check;
  `ScoreboardScreen`/`Podium` already had it, `RoomClient`'s new phase-fade is the only addition.
- **Skip-to-content link added to the `(app)` layout** (`#main-content`, `sr-only` until
  focused) — the one concrete a11y gap found on inspection; everything else audited (icon-only
  buttons all already carry `aria-label`, `Modal` uses native `<dialog>` for focus-trap/Escape
  for free, `lang="fr"` was already set on `<html>` since Phase 0) was already in good shape
  from earlier phases' own conventions rather than needing a dedicated pass here.
- **390px mobile audit was reasoning-based, not visually verified in a real viewport** — traced
  through the Header's element widths by hand (hamburger + logo + sound toggle + avatar +
  logout, with nav and the display-name label already hidden below `sm`) and the existing
  `flex-wrap`/`grid-cols-2` patterns already used throughout the room/admin panels, rather than
  screenshotting at 390px. Consistent with the standing direction to not chase exhaustive
  browser-level verification loops — the concrete, high-value gap (no mobile nav at all) was
  fixed directly; a full pixel-level pass across every screen wasn't.
- **Verification**: `pnpm typecheck`/`test` (103 tests, unchanged) and `pnpm build` pass.

## 2026-08-09 — Phase 12 (Hardening)

- **`/healthz` and a graceful-shutdown skeleton already existed from Phase 0** — the Phase 0
  scaffold shipped `server.ts` with a `/healthz` route and `SIGTERM`/`SIGINT` handlers up front,
  since the custom-server decision made those easy to get right on day one rather than bolted on
  later. Phase 12's job was making both actually do what they'd always claimed to:
  - `/healthz`'s `dbOk` was hardcoded `true`. Now does a real `select 1` round-trip and reports
    the true result. Still answers HTTP 200 even when `dbOk: false` — a DB outage shouldn't make
    a basic orchestrator liveness probe flap-restart an otherwise-fine process; whoever's
    actually watching the JSON body decides what `dbOk: false` means for them. Also added
    `uptimeS`, cheap and useful for "did this just restart" at a glance.
  - Shutdown closed the HTTP server and Socket.IO but never told connected clients why they
    were being dropped, never stopped in-flight game loops before they got cut off mid-`sleep()`,
    and never marked their rooms `abandoned` in the DB — that only happened on the *next* boot's
    stale-room cleanup, leaving a "says running, nothing's driving it" window for however long
    the restart took. `engine.ts`'s new `prepareForShutdown(io)` cancels every loop, broadcasts
    a `server_shutdown` `error` event to every connected socket (reusing the same `error` event
    `RoomClient` already renders as a banner — zero client-side changes needed), and bulk-marks
    every non-terminal room `abandoned`, all before the socket/HTTP servers actually close.
    Guarded against a second `SIGTERM` re-entering the sequence, and the DB-touching part is
    wrapped so an unreachable DB at shutdown can't hang the process past its own SIGTERM
    deadline (a hung handler is how you get killed with `-9` instead of exiting cleanly).
  - `abandonStaleRunningRooms` (boot-time cleanup) only ever covered `status = 'running'`.
    Broadened to also cover `'lobby'` — a room the previous process crashed before anyone
    started is exactly as orphaned, it just never had a loop to interrupt — and renamed to
    `abandonStaleRooms` to match. Harmless to leave un-widened (a stale `'lobby'` row is
    invisible to the app either way, since the lobby list and `getRoom()` both read the
    in-memory `Map`, not the DB), but free to fix while touching this code, and it keeps the
    room-history the admin panel would eventually show accurate.
- **Migrations now actually run at server boot** — `scripts/migrate.ts`'s own doc comment said
  "also called at server boot (brief §15)" since Phase 2, and `runMigrations()` was already
  exported specifically for this, but nothing ever imported it into `server.ts`. Brief §15 rules
  out any deployment config beyond this file, so a Railway deploy that only runs `pnpm start`
  has no other point where a pending migration could apply — this was the actual gap, not
  optional polish. Runs before `app.prepare()`/`attachSocketServer()`, since the latter's own
  `abandonStaleRooms()` query would otherwise be the first thing to hit a not-yet-migrated table.
- **`README.md` didn't exist at all** — written from scratch: quick start, the env var table
  (cross-checked against every `process.env[...]` read in the codebase, not just `.env.example`),
  the full command list, how accounts actually get created (no sign-up route, by design), and a
  deployment section spelling out what "no deployment config beyond this" (brief's own rule)
  concretely means in practice — one process/one port, migrate-at-boot, `/healthz`'s contract,
  graceful shutdown's behaviour, and the two things that need a persistent volume.
- **Corrected two stale claims in `CLAUDE.md`** found while cross-checking the README against
  the actual codebase: the stack table still said "Sound: plain `HTMLAudioElement`, no audio
  library" (Phase 11 built a procedural WebAudio synth instead, see that phase's entry) and the
  commands table's `db:migrate` note still said migration-at-boot "will" happen "from Phase 12
  on" as a future promise rather than a present fact. Both now describe what's actually there.
- **Verification**: `pnpm typecheck`/`test` (103 tests, unchanged) and `pnpm build` pass. Ran the
  dev server for real (not just typechecked) to confirm: `/healthz` returns a genuine `dbOk:
  true` after a real query; a `SIGTERM` produces the exact `shutdown_start` → `shutdown_complete`
  log sequence with no hang; boot with `runMigrations()` wired in applies cleanly (a no-op
  against an already-migrated DB, as expected) with no `migrate_failed` event. Didn't spin up a
  live two-client game specifically to watch a room flip to `abandoned` mid-shutdown — the query
  itself (`inArray(status, ['lobby','running']) → 'abandoned'`) is the same shape already
  proven correct in `abandonStaleRooms` and the admin delete-guard queries, so this is
  low-risk without re-deriving a full game session to prove it live.

## 2026-08-10 — Post-Phase-12 fix (Railway build failure)

- **First real deploy attempt failed at `pnpm install --frozen-lockfile` on Railway** with
  `ERROR packages field missing or empty`. Root cause: `pnpm-workspace.yaml` existed only to
  record `pnpm approve-builds`'s decisions (`allowBuilds: esbuild/sharp/unrs-resolver` — native
  postinstall scripts pnpm won't run unattended without this), but the file's mere presence
  makes pnpm treat the repo as a monorepo workspace root, which then requires a `packages:` list.
  Fixed by adding `packages: ["."]` — declares the root itself as the sole workspace member,
  with no actual restructuring (this was never a monorepo).
- **Also fixed, same deploy**: Railpack's build log showed `pnpm │ 9.15.9 │ railpack default (9)`
  — it found no version hint and silently installed pnpm 9 against a lockfile written by the
  locally-pinned 11.21.0, which is also what produced the `could not detect pnpm lockfile
  version` warning right before the failure. `package.json` only had the non-standard
  `devEngines.packageManager` field; added the Corepack-standard top-level `"packageManager":
  "pnpm@11.21.0"` field, which Railpack (and most other build platforms) actually read to pin
  an exact version. Also changed `devEngines.packageManager.version` from `^11.21.0` to an exact
  `11.21.0` — pnpm itself warned the two fields "specify different versions" (a range vs. an
  exact pin reads as different even when one satisfies the other) and said it would ignore
  `packageManager` locally; matching them exactly removes that ambiguity for every tool reading
  either field, not just pnpm's own CLI.
- **Verification**: reproduced Railway's exact failure mode locally isn't possible (Railpack
  internals aren't runnable here), but ran the actual command from its build log —
  `pnpm install --frozen-lockfile --prefer-offline` — against a from-scratch `node_modules`
  (moved the existing one aside first, so this wasn't just a cached no-op), which is the
  precise step that failed in the Railway log. Succeeded cleanly post-fix, followed by
  `pnpm typecheck`/`test`/`build`, all green.

## 2026-08-10 — Addendum B.2 (duration moves from question to room)

- **Root cause of an accidental production migration, and a workflow fix.** Running
  `pnpm db:migrate` locally to test this phase's schema change applied it to the real Turso
  database instead of `local.db` — a direct consequence of the `.env`-auto-loading fix landed
  just before this addendum started. That fix was correct (standalone scripts need `.env` to
  reach the intended DB at all), but it means every bare script now targets whatever
  `DATABASE_URL` sits in `.env` by default, which is production once real Turso credentials are
  in there. No harm done this time (confirmed with the user: nothing is live yet), but the
  addendum's remaining chunks (a new `question_stats` table, an FTS5 virtual table, more schema
  changes) will need their own local migration testing — from here on, local verification runs
  with an explicit `DATABASE_URL="file:./local.db"` prefix, never relying on ambient `.env`.
- **Resolution centralised in one place.** `selectQuestionsForRoom` now returns `{questionId,
  type}` instead of `{questionId, timeLimitS}` — duration resolution (`timeLimitByType[type] ??
  timeLimitS`) happens once, in `engine.ts`'s `startGame`, right where `frozenQuestions` gets
  built and written into `room_questions.time_limit_s`. The old code had the same fallback
  formula half-duplicated (once in `question-selection.ts` for the random-source branch only,
  once again in `engine.ts`) and effectively dead, since `questions.time_limit_s` was never null.
- **`SanitisedQuestion.timeLimitS` (sent to clients in `question:show` and `room:state`) is now
  an explicit second argument to `toSanitised()`**, not read off `FullQuestionDetail` — the
  question-detail layer has no concept of duration anymore at all. Both call sites needed a
  source for it: the live-loop one already had `frozen.timeLimitS` in scope; the `room:state`
  reconnect-snapshot one (`toRoomStateView`) didn't previously distinguish "the question" from
  "the room's timing for that question" and had to look it up via
  `room.frozenQuestions[room.currentIndex]`.
- **`timeLimitByType` is an explicit 4-key partial object in the Zod schema, not `z.record` with
  an enum key** — Zod's `record()` with a literal-union/enum key schema can enforce every key be
  present depending on version, which would defeat "partial" entirely. An explicit
  `z.object({open, mcq, image, geo}).partial().optional()` is unambiguous regardless.
- **The waiting room's host config panel didn't exist before this** — `room:update_config` had a
  server handler since Phase 7 but zero client UI ever called it. Built a minimal one scoped to
  exactly what B.2 asks for (a "Rythme" section), not a full config editor: a local edit buffer
  (`RhythmSection`, shared with `CreateRoomModal`) plus an "Appliquer" button that only appears
  when the buffer actually differs from `state.config`. `room:update_config` has no ack in
  `events.ts`'s `ClientToServerEvents` — the "confirmation" is just the fresh `room:state`
  broadcast every client in the channel receives, which flows back into `state.config` as a prop.
- **Verification**: `pnpm typecheck`/`test`/`build` pass. Generated migration
  (`0001_typical_mentor.sql`, a single `ALTER TABLE questions DROP COLUMN time_limit_s`) applied
  clean against a from-scratch local DB. A throwaway script (not committed) inserted a `geo` and
  an `open` question, ran `selectQuestionsForRoom` with a `timeLimitByType: { geo: 40 }` config,
  and confirmed the geo question resolved to 40s and the open question to the 20s default.

## 2026-08-10 — Addendum A (Question Library)

Bigger than any single original phase, and several parts were deliberately simplified against
the addendum's own spec to fit this alongside everything else in Addendum B. Every simplification
below is a real, acknowledged gap — not an oversight.

- **FTS5 → plain `LIKE`.** The addendum itself hedges ("fall back to LIKE only if FTS5 is
  unavailable... detect at boot") — meaning even its author expected this might not always work.
  Given this app's likely pool size (a private group's questions: dozens to a few hundred, not
  the volume FTS5 exists for), building and maintaining a synced virtual table plus boot-time
  capability detection wasn't worth it. Search matches `prompt` directly plus `EXISTS` subqueries
  against `question_open_answers`/`question_choices` (not a join, which would duplicate rows) —
  verified directly: searching "Vinci" finds a question only via a choice label, not the prompt.
- **Offset pagination, not keyset.** The addendum explicitly says "not offset pagination", but
  true keyset cursors across *eight different sort orders* — several of them computed
  expressions (`success_rate_asc` sorts on `timesCorrect/timesAsked`, not a stored column) —
  would need a differently-shaped cursor per sort mode. Offset's known failure mode (skipped/
  duplicate rows under concurrent inserts during someone's own paging session) isn't a real risk
  at this app's scale and usage pattern. `PAGE_SIZE = 24`, "Charger plus" button (no
  `IntersectionObserver` auto-load — simpler, equally functional, one less thing that can misfire).
- **Facets in one query, not two.** A.10 says "one query for items plus one for facets" —
  `listLibraryQuestions` does `Promise.all([items, total, facetRows])`, with `facetRows` grouped
  by `(type, categoryId)` in a single grouped query, then split into `byType`/`byCategory` maps
  in JS. Facets deliberately ignore the `type`/`cat` filters themselves (while respecting every
  other filter) so the chips answer "how many if I added this", not "how many given I already
  did" — the more useful faceted-search convention.
- **Bulk actions (A.7) simplified to publish/archive.** "Changer de catégorie" and "ajouter à un
  quiz" each need their own picker modal for what's an admin-only, lower-traffic affordance —
  deprioritised against the rest of this addendum. No optimistic-update-with-6s-undo-toast either
  (this app has a `Toast` component from Phase 1 that was never actually mounted anywhere real —
  wiring up toast infra for the first time just for this felt like scope creep); mutations just
  refetch the current page directly instead.
- **Geo editing isn't wired into `/creer/question/[id]` yet.** Addendum B.3 (next) rebuilds
  `GeoForm` from the ground up, including reordering its fields entirely — building edit-mode
  support against the form that's about to be replaced would mean doing it twice. The edit page
  shows an explicit "coming soon" state for geo questions rather than either failing silently or
  (worse) rendering a blank create-mode `GeoForm` that would submit as a duplicate instead of an
  update. Still fixed here: `getFullQuestionDetail` gained `status`/`authorId` (needed by every
  edit form regardless of type) rather than writing a near-duplicate query just for this.
- **Preview panel (A.6) reuses the real per-type answer-surface components** (`OpenAnswerSurface`
  etc. from Phase 8), `disabled`, fed through the exact same `toSanitisedQuestion` mapper the live
  game uses — not a hand-rolled re-implementation (that's what the pre-existing `QuestionPreview`
  authoring-time component actually is, and it was deliberately *not* reused here for that
  reason). The "Réponse" section below it uses the raw, unsanitised detail, since this is the
  author/an admin previewing their own question, not a player mid-game.
- **`library.ts` (plain reads) vs. `library-actions.ts` ("use server")** is a hard split, not
  organisational preference: `library.ts`'s `listLibraryQuestions` takes `viewer: SessionUser` as
  a parameter, and a "use server" file's exports become client-callable RPCs where every argument
  is attacker-controlled — a viewer identity must never be one of them. `library-actions.ts`
  re-derives the viewer from `getSession()` itself for every action, even `loadMoreLibraryQuestions`
  (which re-validates the whole query through the same Zod schema again too, despite it already
  having passed through `parseLibraryQuery` server-side once for the initial page load).
- **No full focus-trap in the preview side-sheet** — it's a custom fixed overlay (not the
  existing centred `Modal`/native `<dialog>`, which doesn't support a side-anchored sheet
  layout), with `Esc`-to-close and `role="dialog"`/`aria-modal` but no hand-rolled trap. A
  documented gap, not an oversight — building a correct one from scratch was more than this
  addendum's budget could absorb on top of everything else in it.
- **Verification**: `pnpm typecheck`/`test` pass, `pnpm build` succeeds with the new `/creer`,
  `/creer/question`, `/creer/question/[id]` routes registered. `listLibraryQuestions` verified
  directly against a real seeded DB: the draft-visibility rule (a stranger asking `status=all`
  never sees another author's draft, admin does), prompt search, choice-label search via
  `EXISTS`, type filtering, and facet counts. The choice-distribution/stats aggregation logic
  (gated behind `getSession()`, not callable from a bare script) was verified by replicating its
  exact query shape against seeded `answers` rows — confirmed 2/3 → 67%, 1/3 → 33%. Didn't do a
  logged-in browser click-through, consistent with the standing direction to not chase
  Playwright verification loops.

## 2026-08-10 — Addendum B.1 + B.5 (inline category creation + management tab)

Built together — B.5 explicitly folds into the library rather than being a separate page, and
both revolve around the same new `src/server/categories/actions.ts` module.

- **Two `createCategoryAction`s now exist, deliberately.** Admin's own (server/admin/actions.ts,
  Phase 10) is a full-control tool — explicit slug/position, admin-only, used by /admin's own
  "+ Catégorie". The new one (server/categories/actions.ts) is B.1's "quick, inline, from
  wherever a category is picked" path — open to any logged-in user, slug always server-derived
  (`slugify()`, never trusted from the client), position always auto-appends
  (`max(position) + 1`). These aren't duplication so much as two different tools for two
  different trust levels or the same underlying table; admin's create was left untouched.
  `deleteCategoryAction`, however, *was* consolidated: the old admin-only version only blocked
  deletion when in use, the new shared one (in the new module) offers reassignment instead —
  `/admin`'s `CategoriesPanel` now uses the richer one too, a straight upgrade with no downside.
- **Name uniqueness is case/accent-insensitive, checked in JS, not SQL.** SQLite has no built-in
  accent folding without an extension; the category count is small enough (fetch all, normalize
  via the same NFD-strip-combining-marks approach grading.ts's `normalizeAnswer` uses, compare)
  that a full-table scan here is a non-issue. Verified directly: "Géographie" and "geographie"
  collide, "Le Sport" and "Sport" deliberately don't (this isn't the grading pipeline, which
  also strips French articles — a category legitimately named "Le Sport" shouldn't collide with
  "Sport").
- **Reorder is up/down arrows, not real drag-and-drop.** No DnD library is a dependency of this
  project, and the existing "reorder" UI elsewhere in this codebase (MCQ option ordering in the
  question form) already uses the same arrow-button pattern rather than drag — adding a new
  dependency just for a ~10-row admin list wasn't worth it. `moveCategoryAction` swaps
  `position` with the adjacent category in sort order; verified directly against a real DB.
- **`groupBy=category` only groups the cards view, not the table.** Grouping a `<table>` into
  per-category sections (nested tbodies or repeated table fragments) is materially more layout
  work for what the addendum itself treats as a secondary display mode. Grouping itself is
  client-side, over whatever page of results is already loaded (`useMemo` partitioning the flat
  `items` array by `categoryId`) — "the existing sort applied inside each group" falls out for
  free since it's just partitioning an already-sorted list, not a second server round trip.
  Collapsible sections are a native `<details>`/`<summary>`, not a hand-rolled disclosure widget.
- **Colour propagation**: every surface that shows a category colour (library cards/table,
  filter rail chips, the Categories tab, admin's own panel) reads `categories.colorToken` live
  from the DB on each server render — there's no cached/duplicated copy of the colour anywhere
  to go stale. The one thing that needed an explicit fix: `updateCategoryAction` only called
  `revalidatePath("/admin")`, but the new lighter `CategoryEditModal` (B.5's tab) calls that same
  action from `/creer` — added a second `revalidatePath("/creer")` there.
- **Verification**: `pnpm typecheck`/`test` pass, `pnpm build` succeeds. The pure slugify/
  normalize logic checked directly (`node -e`) against the addendum's own worked example
  ("Géographie Physique" → `geographie-physique`, matching its "Identifiant :
  geographie-physique" sample exactly). The DB-touching logic — position auto-append on create,
  case/accent-insensitive clash detection, position-swap on move, reassign-then-delete — was
  verified by replicating each action's exact steps against a real seeded local DB.

## 2026-08-10 — Addendum B.3 (geography question editor rebuild)

- **Every authoring-only map behaviour lives behind one new `GeoMap` prop, `editorChrome`,
  false by default.** Zoom controls, the lazy 50m swap above scale 3, auto-labels above scale
  2.5, disabling the small-country fallback circles above scale 4, the hover tooltip,
  double-click-to-zoom, and the touch/fullscreen-only pending-tap flow are all gated on it —
  every other call site (`GeoAnswerSurface`, `RevealScreen`, `QuestionPreview`, `/dev/map`)
  passes nothing and is byte-for-byte unaffected. This was the only way to add these behaviours
  without risking them leaking into the player-facing map by accident, and it means the
  in-game/editor split lives in one obvious place instead of being inferred from context.
- **Two real bugs found while writing the country-search combobox, both now permanent regression
  tests** (`tests/unit/country-search.test.ts`), not just a one-off manual check:
  - **`"USA"` matched Zambia and Israel ahead of the United States.** The original tier order
    checked name/official/capital substrings before an exact iso3 match — and "usa" is a
    literal substring of "Lusaka", Zambia's capital. An exact iso3 match now wins outright
    (tier 0), since a short code like that is always a deliberate, precise query, not something
    that should lose to an incidental hit elsewhere.
  - **`"cote divoire"` (no apostrophe, no space) found nothing for Côte d'Ivoire.**
    `normalizeAnswer` (reused per the addendum's own instruction, brief §7's pipeline) turns
    "Côte d'Ivoire" into "cote d ivoire" — the apostrophe becomes a literal space — so a query
    typed without it never substring-matches. Added a lowest-priority, space-stripped-on-both-
    sides fallback tier (both sides, ≥3 chars to avoid noise) that catches this without
    weakening any of the higher tiers above it.
  - Extracted the ranking (`rankCountryMatch`/`searchCountries`) into a pure module
    (`src/lib/geo/country-search.ts`) specifically so these could be real unit tests instead of
    logic buried in a client component — matches this codebase's existing grading.ts/scoring.ts
    pattern of keeping the actual decision logic DB/React-free and tested in isolation.
- **Search is client-side over the already-loaded country list, not a per-keystroke server round
  trip**, despite the addendum saying "debounced 150ms query against the seeded countries
  table". `listCountries()` already fetched the full ~193-row list once for the old (broken)
  search box; re-fetching per keystroke over the network would be strictly worse than filtering
  data already sitting in memory. The 150ms debounce is kept anyway, purely to avoid
  re-filtering/re-rendering the dropdown on every keystroke.
- **The "Cadrage" (`view_bbox`) capture uses a callback, not an imperative ref.** `GeoMap` reports
  the current viewport's geographic bounds via `onViewChange`, debounced 200ms after the zoom
  transform settles (inverting the four screen corners through the live zoom transform, then
  through the projection); the form just keeps the latest value in state and copies it into
  `savedViewBbox` when "Utiliser cette vue comme cadrage" is clicked. Simpler than
  `forwardRef`/`useImperativeHandle` through `next/dynamic`'s lazy wrapper, which is a known
  rough edge, and every other cross-component contract in this map layer is already
  callback-based (`onSelect`), not ref-based.
- **The floating-button overlap bug (B.3.3) was a sizing bug, not a positioning bug.** The
  button was already `absolute bottom-4 left-1/2 -translate-x-1/2` inside a `relative` container
  — correct CSS. The container just had no *real* height (`h-full` against an unconstrained
  parent collapses close to zero), so "bottom" sat near the top of the page, over whatever
  followed. Fixed by giving the map frame an explicit `aspect-[16/10] min-h-[420px]` (per
  B.3.1) with `overflow-hidden`, exactly as specified — no positioning logic needed to change.
- **Geo editing still isn't wired into `/creer/question/[id]`** — noted as a known gap in
  Addendum A's own entry, and deliberately not closed here either: `GeoForm` changed too much in
  this pass (full reorder, the confirmation strip, cadrage) to also retrofit initial-value
  hydration in the same commit. A near-term follow-up, not forgotten.
- **Verification**: `pnpm typecheck`/`test` (110 tests, +7 new) pass, `pnpm build` succeeds.
  The search-ranking bugs above were caught by *running* the new combobox logic against the
  real seeded 193-country DB (not just reading the code), which is exactly why they were found
  before being shipped rather than after. Didn't verify the map's zoom/fullscreen/hover
  interactions in an actual browser (no visual/pixel check of Luxembourg/Singapore at 390px/
  1440px) — the underlying hit-target mechanism (≥24px fallback circles) is Phase 4's own,
  already-proven code; `editorChrome`'s zoom clamp (12) and disable-above-scale-4 are new but
  straightforward, low-risk additions on top of it. Consistent with the standing direction to
  not chase browser-level verification loops.

## 2026-08-10 — Addendum B.4 (empty rooms deleted after 2 minutes)

- **`answers.roomId` is now nullable** (migration 0003, a table-recreate — SQLite's standard way
  to relax a column's NOT NULL) — the addendum's own "decide and document": deleting an empty
  `running` room's `rooms` row while it still has recorded `answers` needs those rows to survive
  *something*, and nulling the FK (rather than cascading the delete) is what actually satisfies
  "never lose recorded answers, since `question_stats` is derived from them" — `question_stats`
  and every per-user aggregate only ever key off `question_id`/`user_id`, never `room_id`, so a
  detached answer is exactly as useful to them as an attached one. Checked first: nothing in
  this codebase reads `answers.roomId` besides the insert itself, so nothing else needed to
  change to tolerate it going null.
- **Fixed a real pre-existing bug found while implementing this**: the empty-room-check handler
  ran for *every* room status, including `finished` — a player leaving the podium screen after
  the last game they were in would, 60s (now would-be 2 minutes) later, have their room's DB
  status silently overwritten from `finished` to `abandoned`, corrupting the historical record
  for no reason. Addendum B.4's own "rooms already finished are never deleted" requirement is
  what surfaced this; `deleteEmptyRoom` now returns immediately for a `finished` room's DB row
  (after still freeing its in-memory `RoomState`, so a played-out room doesn't just leak in
  memory for the rest of the process's life — the addendum didn't ask for that half explicitly,
  but leaving it unbounded once the DB-side deletion had a guard anyway would be a straightforward
  memory leak with no offsetting benefit).
- **Cancelling the timer on rejoin needed a second, `io`-free function.** The existing per-room
  `setTimeout` already re-checks emptiness when it *fires* (so it silently no-ops if someone
  rejoined in the meantime — the old code already got this right), but that's not the same as
  the *deadline shown to clients* (`closesAtMs`, new on `RoomStateView`) actually clearing the
  moment someone reconnects. Added `cancelEmptyRoomCheck(room)` (no `io` parameter — nothing
  gets deleted here, so it doesn't need one, unlike `scheduleEmptyRoomCheck`'s re-arm branch)
  and call it from `addOrReconnectPlayer`.
- **The "show a countdown to the remaining player" UI is real but structurally low-visibility.**
  Traced the actual reachability: `room:state` (the only thing that carries `closesAtMs`) is
  sent to a socket in response to `room:join` — and joining is itself what cancels the timer, on
  the same synchronous path, before that response is even built. A room with zero connected
  players has, by definition, nobody currently able to receive a fresh snapshot showing it
  counting down. The banner (`WaitingRoom.tsx`'s `EmptyRoomCountdown`) is still implemented
  correctly and cheaply for whenever `closesAtMs` *is* present in a snapshot, but this isn't a
  commonly-visible feature by construction, not because the implementation is incomplete —
  broadcasting it to lobby browsers instead (letting people see a dying room before joining it)
  would be a more reachable version of the same idea, but is a bigger, separate change and
  wasn't built here.
- **The periodic sweeper is a genuine no-op at boot, always.** `sweepEmptyRooms` reads the
  in-memory `rooms` Map, which is created fresh and empty on every process start — there is
  nothing in it to sweep the instant `attachSocketServer` runs. Boot-time orphan cleanup for
  rooms a *previous* process left behind is `abandonStaleRooms`'s job (already existed, Phase
  12), which runs first and is DB-driven, not memory-driven. The 60s interval is the sweeper
  that actually matters, as a redundant safety net behind each room's own `setTimeout`.
- **Verification**: `pnpm typecheck`/`test` (110 tests, unchanged from B.3) pass, `pnpm build`
  succeeds, boot/shutdown logs confirmed clean with the new sweeper interval wired in. Ran
  `deleteEmptyRoom` directly (not a replica — the real function, imported, called with a minimal
  fake `io` stub) against a real seeded local DB for all three cases: a `lobby` room (rooms/
  room_players/room_questions all gone, `lobby:room_removed` emitted), a `running` room with a
  recorded answer (room gone, the answer row survives with `room_id` now `NULL` and every other
  column — `question_id`, `is_correct`, `ms_taken` — intact), and a `finished` room (completely
  untouched, no event emitted).

## 2026-08-10 — Addendum A/B wrap-up: three pre-existing crashes found and fixed

Final pass across the whole addendum: full `pnpm typecheck`/`test`/`build`, then booting the
actual production build (`pnpm start`, not just `next build`) and curling every route
unauthenticated to confirm a clean redirect rather than trusting that it would. That last step
caught three real bugs — none introduced by this addendum, all three pre-dating it (Phase 9),
never caught before because Phase 8's e2e verification was cut short before this route pattern
was ever actually curled unauthenticated in production mode.

- **`/profil`, `/profil/[username]`, and `/classement` all crashed (500) instead of redirecting
  to `/connexion` when hit unauthenticated.** All three used `session!.user...` — a non-null
  assertion with no actual `if (!session)` check backing it, relying entirely on the `(app)`
  layout having already redirected. That reliance is exactly the anti-pattern this codebase's
  own convention (every server action's `requireUser()`, every other page built across every
  phase and this whole addendum) explicitly rejects: a layout running first is a UX nicety, not
  a trust boundary a page can lean on — and here, provably, it wasn't safe to lean on either.
  Fixed all three with the same explicit `if (!session) redirect("/connexion")` used everywhere
  else. Reported here rather than silently folded in, since none of the addendum work touched
  these three files.
- **This is exactly why the final verification step booted the real production server instead
  of stopping at `pnpm build`** — a successful build only proves the code compiles and
  prerenders; it says nothing about a runtime `null` dereference on an unauthenticated request
  path, which a build never exercises.

Addendum A/B status: all six chunks (B.2, A, B.1+B.5, B.3, B.4, this wrap-up) are complete,
committed, and documented. New Playwright suites (A.10/B.6's own test-additions asks) weren't
built — consistent with the standing direction from earlier in this engagement to not pursue
Playwright verification loops. Every chunk was instead verified by running its actual server-
side logic (queries, mutations, ranking functions) directly against a real seeded local
database, which is where the three bugs above and the two search-ranking bugs in B.3 were
actually found — in each case, by running the code, not by reading it.

## 2026-08-10 — Addendum C.1/C.2/C.3/C.5: MCP authoring server (ingestion, transport, tools)

Built in dependency order: schema → `ingest.ts` → token auth → transport mounting → tools/
resources/prompt, each verified against a real seeded local DB before moving on, plus a full
live protocol round trip (real `@modelcontextprotocol/sdk` client, real running server) at the
end — not just typechecking. That live round trip is what caught the one real bug below.

- **`createQuestionFromDraft` (ingest.ts) is now the only `insert(questions)` call site for
  creation** — `createOpenQuestion`/`createMcqQuestion`/`createGeoQuestion` (the web form) were
  rewired to build a `QuestionDraft` and call it, exactly like every MCP tool call will.
  `createImageQuestion` is the one deliberate exception: `image` has no MCP/import equivalent at
  all (C.6 — no upload channel off the web form), so ingest.ts's `QuestionDraft` schema has no
  `image` variant to route it through; it keeps its own direct insert, documented at the top of
  ingest.ts so `grep insert(questions)` finds exactly the two expected call sites.
- **The addendum's own ctx type snippet (`{ authorId, source }`) is smaller than the behaviour
  its prose describes.** "create it if `allowCreateCategory` and the name is new; otherwise
  error" only makes sense with an `allowCreateCategory` flag, which the illustrative type didn't
  list — added it (default `true`, matching B.1's "any logged-in user may create categories").
  Also added `initialStatus` (manual-only; MCP/import ignore it *by an explicit source check at
  the insert itself*, not merely by no caller passing it — belt-and-suspenders for the addendum's
  own "non-negotiable: no parameter lets a model publish directly") and `manualGeo` (see below).
- **The web geo form's richer capabilities (cadrage/`viewBbox`, editable accepted answers,
  `strict`) don't fit `QuestionDraft`'s narrow MCP shape** (name-only `pays`, no `viewBbox`, no
  editable answers — deliberately narrow so the model can't hand-author a capital/population that
  contradicts `countries`). Rather than fork the insert path to keep both capabilities, added
  `ctx.manualGeo` — an override only the web form's `createGeoQuestion` ever constructs, never
  reachable from MCP or import, that skips country-name resolution entirely and uses the
  already-resolved values verbatim. One insert path, no regression to B.3's authoring UI.
- **Open questions' MCP-facing `reponses` cap (1–8, per C.5's literal spec text) is tighter than
  the pre-existing web form's cap (1 primary + ≤20 variants).** Deliberately not widened to avoid
  quietly loosening what the addendum specifies MCP clients see in the tool's own input schema.
  In practice no existing question has anywhere near 8 accepted answers; if one ever did, the web
  form would now surface a validation error instead of silently truncating — an accepted, exceedingly
  unlikely edge case, not a silent data-loss path.
- **Dedup has no real FTS5** — same call already made for the library's search (Addendum A):
  `findSimilarPrompt` does a normalized (accent/case-insensitive) Damerau-Levenshtein nearest-
  neighbour scan across every existing prompt, length-proportional threshold (~15%, floor 3).
  Fine at this app's question-pool scale; a warning, never a hard error, so the caller decides.
- **Category-by-name resolution reuses B.1's exact create-inline semantics** (`createCategoryCore`,
  extracted out of the "use server" action so it's callable without a session cookie) — a brand
  new category gets a colour picked deterministically from a hash of its name (not meaningful,
  just avoids a monochrome batch when a model creates several categories in a row via
  `creer_question`'s inline `categorie` name).
- **Country resolution (`src/lib/geo/country-resolve.ts`) is a new, separate pure module from
  B.3's `country-search.ts`.** They answer different questions: the combobox ranks *live, partial*
  keystrokes for a picklist (capital included, no "nearest on a total miss" concept); ingest needs
  a one-shot "resolve fully or fail with the 3 closest suggestions" that also matches `iso2`/
  `name_en` per C.1 §3's explicit field list, which the combobox never needed to.
- **Real bug caught by the live-server round trip, not by typechecking**: `createCategoryCore`
  called `revalidatePath("/creer")` — a Next-request-scoped API. Once `ingest.ts`'s category
  resolution started calling it from an MCP tool handler (which runs on the raw `server.ts` HTTP
  server, never inside a Next request), every category-by-name creation over MCP crashed with
  "Invariant: static generation store missing". Fixed by moving `revalidatePath` out of the core
  function and into each "use server" action wrapper that actually has a Next request context;
  `ingest.ts` and every MCP tool call `*Core` functions that are now unconditionally revalidate-
  free. The same pattern was applied proactively to the three other new MCP-only category cores
  (`updateCategoryCore`, `mergeCategoriesCore`, `deleteCategoryStrictCore`, all new — the existing
  admin/web category actions are untouched and keep their own `revalidatePath` calls).
- **Token auth (C.3)**: `aspi_pat_` + 32 random bytes (`crypto.randomBytes`, base64url), sha256
  hashed, looked up by a 12-char prefix then compared with `crypto.timingSafeEqual`. Every check
  (missing/malformed header, unknown prefix, hash mismatch, revoked, expired, deactivated owner)
  collapses to the same `{ ok: false }` internally and the same byte-identical 401 JSON body at
  the HTTP layer — verified directly against a live server (a request with no token and one with
  a syntactically-plausible-but-wrong token both produced the identical error).
- **MCP sessions are bound to the token that opened them.** `StreamableHTTPServerTransport` is
  used in stateful mode (`sessionIdGenerator`); on every request for an existing session id, the
  freshly-reverified token's id must match the one recorded at session creation, or the request
  gets the same uniform 401 — otherwise a second, differently-scoped token could ride along on a
  session already opened by a first one.
- **Rate limiting is in-memory, per-process** (three `Map<tokenId, timestamp[]>` sliding windows:
  60 req/min, 200 questions/24h, 20 category mutations/24h) — the same "resets on restart, and
  that's fine at this app's scale" tradeoff already accepted for live game `RoomState` (Phase 7).
- **`creer_question`/`creer_questions_en_lot` reuse `questionDraftSchema` directly as the tool's
  `inputSchema`** (the MCP SDK's `registerTool` accepts a full Zod schema, not just a raw shape —
  checked the installed 1.30.0 API, didn't assume) rather than hand-duplicating the shape, so the
  JSON schema the model actually sees can never drift from what `ingest.ts` itself accepts.
- **`modifier_brouillon` only patches common metadata** (prompt/category/difficulty/hint/
  explanation) — not structural fields (accepted answers, MCQ choices, geo target). A structural
  change is delete-and-recreate via `creer_question`. Keeps the MCP edit surface to "fix a typo",
  not a full second editor.
- **Country-table caching**: `server/geo/resolve.ts` caches the ~193-row `countries` table
  in-process after first read (never edited at runtime) rather than re-querying per MCP call —
  same "small, effectively static reference table" precedent as `server/geo/actions.ts`.
- **Verification**: `pnpm typecheck`/`test` pass throughout. Ran `createQuestionFromDraft`
  directly against a real seeded local DB (transaction commit, category auto-create with a
  deterministic colour, geo auto-fill from `countries` while deliberately-wrong `pointsBase`/
  `status`/`author_id` arguments were passed and confirmed ignored, dedup warning on a repeated
  prompt, `image` rejection, unknown-country error with suggestions). Then booted the actual
  `server.ts` on a real port with `MCP_ENABLED=true`/`PUBLIC_BASE_URL` set, and drove it with the
  real `@modelcontextprotocol/sdk` `Client`/`StreamableHTTPClientTransport` — no token and a
  malformed token both rejected identically; a valid token walked `lister_categories` →
  `chercher_pays` → `creer_question` (geo) end to end, landing a real `draft` row; a
  `questions:read`-only token's `creer_question` call was rejected with the scope named; a
  player-role token with `categories:write` could call `creer_categorie` but not
  `fusionner_categories` (admin-only, uniform rejection).

Not yet built (next commits): the token management UI (C.4 — tokens exist only via direct DB
insert in the verification scripts above, deleted after use) and the "À relire" review queue
(C.7) that's the actual reason a machine-authored draft ever becomes a real question.

## 2026-08-10 — Addendum C.4/C.7: token management UI, review queue, and a real production-boot bug

- **C.4 — `/profil/parametres/mcp`**: create/list/revoke tokens (name, scope checkboxes with
  `questions:read` the only one checked by default — never a single "full access" preset, per
  spec), a one-time reveal modal with both the JSON `mcpServers` config block and the `claude mcp
  add` CLI form, generated from `PUBLIC_BASE_URL` (falling back to `window.location.origin` when
  unset, e.g. local dev). Admin gets a read-only, cross-user token view folded into a new "MCP"
  tab in `/admin` alongside the `audit_log` paper trail (one tab, not two — both answer "what
  happened over MCP" at a glance). `TokenList` is one shared component for both surfaces
  (`showOwner` toggles the extra column) rather than two near-duplicate tables.
- **C.7 — "À relire" tab**: a third `/creer` tab, count in the tab label itself (no separate
  badge slot on the shared `Tabs` component — not worth extending its API for this one caller).
  Reuses `LibraryCard`'s underlying visual language and `PreviewPanel` as-is (Addendum A.6's own
  point: the preview must never be a second, drifting implementation) but the row layout and
  action set (Publier/Modifier/Rejeter, explicit buttons rather than LibraryCard's hover-reveal
  icons) are a dedicated `ReviewQueueTab` — the existing card's hover actions are Aperçu/Modifier/
  Dupliquer/Archiver, a different verb set than what a review queue needs front-and-centre.
  Publish/reject is author-or-admin (checked in `review.ts`'s `requireReviewAccess`), deliberately
  a separate, less restrictive action set from `library-actions.ts`'s existing `bulkSetQuestionStatus`
  (admin-only, used by the main library's own bulk toolbar).
- **Rejection reason has nowhere to live on `questions`** — C.1's schema additions list is
  `source`/`reviewed_at`/`reviewed_by` only, no column for it. Rather than silently dropping an
  admin's typed reason, `rejectDraftAction`/`bulkRejectDraftsAction` write it to `audit_log`
  (action `question_reject`) when non-empty — preserved, just not on the row itself.
- **"Jamais relue" filter (C.7)** added to both surfaces it names: the library's own
  `FilterRail`/`questionLibraryQuerySchema` (a `neverReviewed` boolean — parsed from a raw `"1"`/
  absent URL param, not `z.coerce.boolean()`, which coerces literally any non-empty string
  including `"false"` to `true`) and `/admin`'s Questions panel (a client-side toggle over the
  already-loaded rows, plus a small badge per row — this list is capped at 200 and never
  paginated, so filtering client-side is simpler than threading a new server query param through
  for a view this size).
- **The "relire d'abord" nudge is genuinely once per browser session**, via `sessionStorage`
  (not a React state flag that resets on navigation) plus a permanent `localStorage` "Ne plus
  afficher" escape hatch, exactly as specified — nagging on every single publish would just
  train people to click through it without reading.
- **A real bug, found only by booting the actual production server** (`pnpm build` + `pnpm
  start`, not just `next build`) **and hitting a route — not by typechecking, which caught
  nothing wrong here**: the moment `server/mcp/register.ts` (statically imported by `server.ts`
  via `server/mcp/transport.ts`, for the `/mcp` mount) pulled in `createCategoryCore` et al. from
  `server/categories/actions.ts` — a `"use server"` file that imports `next/cache`'s
  `revalidatePath` at module scope — booting the production server and hitting **any** page at
  all (not just an MCP-related one; `/connexion` alone reproduced it) crashed the whole process
  with `Error: Invariant: AsyncLocalStorage accessed in runtime where it is not available`,
  thrown from deep inside Next's own `async-local-storage.js` the first time it got `require()`d.
  Root cause: `server.ts` isn't compiled by Next's own bundler (it runs directly under `tsx`), so
  a `"use server"` file's `next/cache` import reaching server.ts's top-level module graph this
  way — never through Next's own request-scoped bootstrapping — leaves Next's shared
  `AsyncLocalStorage` singleton in a state where Next's *own* internal code faults on first real
  use. Isolated by a binary-search of throwaway repro scripts (raw SDK imports alone: fine; SDK +
  `next` together: fine; the actual `transport.ts` import: crashed) before finding the exact
  culprit import. **Fixed at the root, not the symptom**: extracted the four MCP-only category
  mutation functions (`createCategoryCore`, `updateCategoryCore`, `mergeCategoriesCore`,
  `deleteCategoryStrictCore`) into a new `server/categories/core.ts` — a plain module that
  imports nothing from `next/cache` or `next/navigation`, ever — and made `server/categories/
  actions.ts` a thin `"use server"` wrapper around it (only `createCategoryAction`'s web path adds
  `revalidatePath`). `ingest.ts` and `register.ts` now import from `core.ts`. Verified the fix by
  re-running the exact same production boot: `/connexion`, `/creer`, `/admin`, `/profil/
  parametres/mcp` all render 200 with a real session cookie, `/mcp` still 401s a bad token and
  runs a full real-SDK-client tool call end to end. This is the same class of "only a real boot
  proves it" bug as the three unauthenticated-crash fixes at the end of Addendum A/B, and the
  `revalidatePath` bug ingest.ts's own category resolution hit earlier in this same addendum
  (C.1's commit) — same root cause pattern (a Next-request-scoped API reached from outside a Next
  request), different manifestation (there it errored obviously at the call site; here it corrupted
  shared state and crashed on an unrelated route).
- **New unit tests**: `country-resolve.test.ts` (mirrors `country-search.test.ts`'s fixture and
  regression cases, plus the iso2/name_en matching this resolver adds and an explicit test that a
  weak/space-stripped match is surfaced as a suggestion, not silently auto-resolved — a
  deliberate, documented conservatism difference from the combobox's own ranker, not a bug, and
  is exactly what a first draft of this test file got wrong before being corrected to match the
  intended behaviour), `mcp-tokens.test.ts` (format, uniqueness, prefix slicing, sha256
  determinism), `mcp-rate-limit.test.ts` (the exact 61st-request and 201st-question boundaries
  named in C.8's acceptance list, plus the 21st category mutation).
- **Verification**: `pnpm typecheck`/`test` (126 tests, 8→11 files) and `pnpm build` pass. Full
  production boot + curl pass repeated after the fix (see above) — this time clean on the first
  try for the parts already covered by the C.1 commit's own verification, and newly clean for
  every route this commit touches.

Addendum C status: C.1–C.5 and C.7 are complete and committed. C.6 ("what MCP deliberately
cannot do") was enforced throughout rather than built as a separate feature — see C.1's `image`
rejection, the hard 25-per-call/200-per-day caps, and the tool list itself having no admin/
publish/media surface. Not built: new Playwright suites (C.8's own e2e ask) — consistent with
the standing direction earlier in this engagement not to pursue Playwright verification loops;
every acceptance-criterion item that's meaningfully testable without a browser has a unit test or
was exercised directly against a real seeded DB and a real running server instead, per this
engagement's established methodology.

**Final C.8 checklist pass**, against the real running production server (booted twice — once
`MCP_ENABLED` default-true, once explicitly `false`):
- No/malformed/revoked/expired/deactivated-owner-user tokens: 5 real requests, identical `401`
  status and byte-identical body, asserted programmatically (not by inspection).
- `creer_questions_en_lot` with 5 drafts where #3 names a nonexistent country: exactly 4 created,
  1 failed naming the closest matches — asserted against the actual inserted row count in the DB.
- A `find_capital` geo question's accepted answer came back "Tokyo" from `countries`, never from
  anything the tool call supplied (the call didn't supply one at all — there's no field for it).
- `modifier_categorie` (admin token) renamed a real category; the `slug` was asserted unchanged
  and the new name read back from a fresh `select`, not from the tool's own echo.
- `MCP_ENABLED=false` on a fresh boot: `/mcp` 404s, `/healthz` and the rest of the app unaffected.
All items from the C.8 list not called out explicitly above were covered by the C.1 commit's own
verification pass (scope/admin gating, dedup warning, status-immutability, timingSafeEqual) or by
the new unit tests (rate-limit boundaries, token format).

<!-- New decisions appended below as phases progress. -->

## 2026-08-24 — Addendum D (geo data, difficulty as a real mechanic, question reports)

- **The country perimeter is now 198, not 193, and this REVERSES the 2026-08-09 "Confirmed via
  user" convention.** The criterion changed from "UN member states" to "has an official ISO
  3166-1 alpha-3 code AND a UN M49 numeric code, and is a state rather than a dependency". That
  adds the Holy See and Palestine (UN observers), Taiwan (ISO 3166-1 TWN / M49 158 since losing
  its UN seat in 1971), and the Cook Islands and Niue (self-governing states in free association
  with New Zealand, WHO/UNESCO members, COK/184 and NIU/570).
  - Kosovo is still excluded, but for a stated reason rather than by category: it has **no**
    official ISO 3166-1 code and no M49 code. Wikidata calls it `XKS`, the World Bank calls it
    `XKX`, neither is official — and `countries.un_numeric` is `NOT NULL`, so admitting it would
    mean either a migration or inventing a code, and inventing reference values is exactly what
    this addendum exists to stop.
  - Western Sahara and Gibraltar remain out: no recognised government exercising control, and a
    British Overseas Territory rather than a state, respectively.
  - The perimeter lives in `scripts/data/perimeter.json` as an explicit list, deliberately NOT
    derived from Wikidata's `P31` class hierarchy. That hierarchy is unreliable for this purpose,
    verified rather than assumed: querying sovereign states with an iso3 returns 198 rows that
    **include Gibraltar** (not a state) and **omit the Cook Islands and Niue** (states).

- **Reference values now carry their source, because the previous ones were admittedly invented.**
  The Phase 2 entry above records that `un_numeric` was "filled from memory" and that
  population/area/centroids were "approximations". For a quiz that grades answers as right or
  wrong, an approximate population is a wrong answer waiting to happen.
  `scripts/snapshot-countries.ts` writes `countries.snapshot.json`, where every value carries the
  publisher Wikidata itself cites, the URL, and the date the value is valid **for** (P585), not
  the fetch date. Committed, never resolved at runtime — the game does not depend on an external
  API being up. Re-run monthly.
  - **Wikidata statement rank is not optional.** A first cut ranked candidates by date alone and
    returned an area of **10 km² for Bosnia**, because area statements are usually undated and
    Bosnia carries three (51197 marked `PreferredRank`, plus 10 and 57187). Rank is now read
    first, `DeprecatedRank` is dropped outright.
  - **The World Bank is used for population only.** Its `AG.SRF.TOTL.K2` surface-area series
    reports **15,634,410 km² for Canada** against a real 9,984,670, and is similarly off for
    France and the UAE. A cross-check has to be more reliable than the thing it checks.
  - The remaining ~84 population disagreements above 5% are a freshness mismatch, not an error:
    Wikidata usually carries a census (2023-01-01, sometimes 2017) where the World Bank carries a
    2025 estimate. The delta is reported per country rather than silently reconciled.
  - **Known gap:** `countries.area_km2` is an integer, so the Vatican's 0.44 km² stores as **0**.
    An area question on the Vatican would be graded wrong. Not fixed here — it needs a column
    type change — but it must not become a quiz target until it is.

- **Several capitals per country, following the rule the country itself states.** `capital_fr` was
  a single nullable column, and `geoAcceptedAnswers` returned one string, so Bolivia had exactly
  one right answer. New `country_capitals` table, one row per capital, with `role` and `branch`
  copied from Wikidata's own qualifiers (P459 de jure/de facto, P518 branch of government) rather
  than from our judgement. `find_capital` accepts **every** row: answering "La Paz" for Bolivia is
  not wrong, and marking it wrong starts an argument instead of teaching anyone anything. The
  distinction is carried in the data for the reveal to explain.
  - Three filters were each found by reading what Wikidata actually returns, not by assuming:
    `DeprecatedRank` drops The Hague for the Netherlands and Tel Aviv for Israel (both flagged
    P2241 wrong-value); an end date (P582) drops **former** capitals, without which Dar es Salaam
    comes back as valid for Tanzania; and where no role is stated, the preferred statement leads,
    which is what puts Porto-Novo ahead of Cotonou for Benin.
  - 8 countries have more than one capital: Benin, Eswatini, South Africa (three co-equal
    branches, no de jure/de facto split at all), Malaysia, Sri Lanka, Yemen, Bolivia, Palestine.

- **Difficulty stopped being decorative.** `questions.points_base` defaulted to 1000 and
  `ingest.ts` set it to a constant, so a tier-1 and a tier-5 question were worth exactly the same
  and the whole 1–5 scale was a badge and a filter. `pointsForDifficulty` makes difficulty the
  multiplier, calibrated on 200 so tier 5 lands on the existing 1000 ceiling. 1000 was rejected:
  XP and level are derived from total points, so a 5x ceiling would silently rescale every level
  already earned by about 2.24x. Derived at read time, not stored — retuning needs no backfill.
  - Labels are in-group slang by explicit request: Golem, Macroniste, Chad, Aspi, 🙂. Tier 5 is
    the emoji itself. The category description now carries the ladder, which is why the
    description cap went from 200 to 400 characters.

- **The difficulty filter is a multi-select, replacing the bounded "Au moins / Au plus" pair.** A
  range cannot express "Golem and 🙂 but nothing between", and picking two or three specific tiers
  is the normal way to build a round. `dmin`/`dmax` become a repeated `diff` param; empty means
  every tier, since an empty `inArray` would match nothing and show an empty library on first load.

- **Question reports (`question_flags`) are a different thing from the review queue.**
  `review.ts` gates drafts *before* publication; this is the feedback loop on questions already in
  play, raised by any player from the question screen. Deliberate choices: reporting has **no**
  effect on the round (no score change, no skip, nothing the room sees), or it becomes a way to
  signal "this one's hard"; one open report per player per question via a unique index, so a
  mis-tap or a double click is a no-op rather than an inflated count; rows are stamped on
  resolution and never deleted, so a question reported again after being resolved as "kept" reads
  as a recurring pattern instead of looking brand new; and `room_id` is nullable and **not**
  cascaded, because an empty room is deleted two minutes after it empties and a report must
  outlive it. `flags.ts` is a plain module and `flag-actions.ts` the `"use server"` wrapper, per
  the `core.ts`/`actions.ts` split — and the viewer is resolved from the session there, never
  accepted as an argument, since a `"use server"` export is a client-callable RPC.

- **`onDelete: "cascade"` on the three question child tables — a straightforward bug.**
  `deleteDraft` deletes only the `questions` row, while `question_choices`, `question_open_answers`
  and `question_geo` referenced `questions.id` with no cascade, so **every** delete of a question
  that had choices or answers failed on a FK violation. `supprimer_brouillon` was therefore broken
  100% of the time, not intermittently.

- **Not in this change, and needing a decision:** a flag (drapeau) question mode. The five geo
  modes have no flag variant, and `countries.flag_emoji` is authoring chrome, never quiz content.
  Emoji flags are the wrong vehicle regardless — at badge size 🇹🇩 Chad and 🇷🇴 Romania are
  near-identical, as are 🇮🇩 Indonesia and 🇲🇨 Monaco — so a real mode needs committed SVG assets,
  a sixth `GeoMode`, and an answer surface.

## 2026-08-24 — Map fixes carried into gameplay; hit-circles dropped there too

- **`GeoMap`'s `editorChrome` flag was gating a mix of authoring convenience and genuine fixes
  together, so all of it stayed editor-only by accident.** Split it: zoom controls, fullscreen,
  the 50m high-res swap at high zoom, and the touch tap-to-confirm flow don't reveal anything, so
  they now also activate in-game (`GeoAnswerSurface`) via a new `showZoomChrome` flag
  (`editorChrome || zoomEnabled`) whenever a click-mode question (locate_country/capital_of) is
  still interactive. Auto-labels-at-zoom and the hover name tooltip stay strictly editor-only —
  either would let a player zoom or hover to read the answer instead of finding it, so widening
  those the same way would leak the answer during active play. Confirmed with the user before
  keeping this split rather than porting everything uniformly.

- **`HitCircles`/`FallbackHitCircles` — the invisible click targets for tiny/zero-geometry
  countries — removed from gameplay entirely, at the user's explicit request, matching their
  earlier removal from the editor (Addendum B.3.1).** This reverses that earlier decision's own
  stated rationale: the editor could drop them because `CountrySearchCombobox` is a working
  fallback there; gameplay has no fallback, so this is a real, acknowledged regression, not a
  wash. Per the "Small/zero-geometry country fallback" entry above, **27 countries (Singapore,
  Malta, Monaco, several Caribbean/Pacific micro-states, …) have zero polygon in the 110m
  topology gameplay renders at world zoom, and Tuvalu has none at any resolution** — any of them,
  if ever targeted by a `locate_country`/`capital_of` question, is now unclickable with no visible
  shape on screen at all, not just hard to hit. Nothing in `question-selection.ts` currently
  excludes these iso3s from being picked for a click-mode question — that's the natural follow-up
  if this surfaces as a real "unanswerable question" complaint, not yet done here since it wasn't
  what was asked. `HitCircles.tsx`/`FallbackHitCircles.tsx` and the `.geo-hit-circle` CSS rule
  were deleted rather than left dark, since nothing references them any more.

## 2026-08-24 — Taiwan (and Palestine/Vatican/Cook Islands/Niue) unclickable: Addendum D's own
generator was never updated for its own new data file

- **Root cause, reported as "can't click Taiwan":** `scripts/build-iso-lookup.ts` (which
  generates `src/lib/geo/iso-lookup.ts`, `country-names.ts`, `country-centroids.ts` — the map
  engine's only source of truth for numeric-topology-id → iso3, never resolved at runtime) still
  read only `scripts/data/countries.fr.json`, the pre-Addendum-D 193-UN-member file.
  `scripts/seed-countries.ts` reads `countries.fr.json` **and** `countries.extra.fr.json` (the 5
  Addendum-D additions — VAT/PSE/TWN/COK/NIU) and always has, but the generator was never given
  the same second file. Concretely, before this fix: Taiwan (158) and Palestine (275) were still
  in this script's own `EXCLUDED_BY_NUMERIC` list (stale copies of the pre-Addendum-D exclusion
  rule, now contradicted by DECISIONS.md's own Addendum D entry), Vatican (336) likewise, and
  Cook Islands (184)/Niue (570) were still in `TERRITORY_PARENT` mapping to `NZL` — meaning a
  click on Cook Islands would have silently graded as New Zealand, not merely failed. The DB
  `countries` table had the right 198 rows the whole time; only the map's own derived lookup
  tables were stale.
- Fix: the generator reads both files exactly like `seed-countries.ts` does, and the 5
  now-redundant hardcoded entries (3 in `EXCLUDED_BY_NUMERIC`, 2 in `TERRITORY_PARENT`) are
  removed rather than left as dead-but-harmless code, since a future reader skimming this file
  would otherwise still see "Taiwan — not a UN member" and reasonably (but wrongly) conclude the
  exclusion is live. `tests/unit/iso-lookup.test.ts` had the identical gap — it separately
  imports `countries.fr.json` to check the generated output against — and needed the same fix
  (`baseCountries` + `extraCountries` union) to keep passing once the generator started actually
  resolving all 5.
- Regenerated with `pnpm tsx scripts/build-iso-lookup.ts`: 198 names (was 193), 233 mapped
  topology features, 7 exclusions (Western Sahara, Antarctica, and the 5 name-keyed disputed
  territories — N. Cyprus, Somaliland, Kosovo, Indian Ocean Ter., Siachen Glacier).


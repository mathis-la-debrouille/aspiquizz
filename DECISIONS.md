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

<!-- New decisions appended below as phases progress. -->

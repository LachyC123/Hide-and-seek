# FALSE SAFE — project notes for Claude

Read this before touching anything. It carries the decisions that aren't obvious from the code.

## What this is

A real-world location game. Players physically run and hide outdoors; their phones supply the
map, roles, zone, votes and catches. Three factions: **hiders** (survive), **seekers** (catch
everyone; every catch converts that player into another seeker), and one hidden **imposter**
who looks exactly like a hider and wins alone by being the last uncaught hider.

Family-legible is the top design rule: every screen must tell a player what happened, what it
means, and what to do now, inside about five seconds. Strategic depth comes from what players
do to each other, never from operating the app.

## Layout

```
src/shell.html   markup + all CSS. Contains one empty <script>\n</script> block.
src/game.js      the entire game, one IIFE.
build.js         inlines game.js into shell.html -> index.html. No bundler, no deps.
index.html       BUILT ARTIFACT — never edit by hand, it is overwritten.
test/harness.js  315 pure-logic tests, no DOM. Runs in ~1s.
test/smoke*.js   7 jsdom runs that boot the real built file and drive the UI.
                 smoke7 is the important one: two windows, one fake Supabase, a whole
                 networked match including a rejoin and a dropped phone.
```

`src/game.js` is split by comment banners:

- `CORE_START` … `CORE_END` — **pure logic, no DOM, no globals from the runtime.** Geo maths,
  role assignment, zone generation, catching, voting, win conditions, missions, GPS filtering,
  tile maths, OSM parsing, the road graph, multiplayer presence/ack plumbing, Supabase request
  shaping, join-link encoding, preview scale maths. The harness extracts this block by its markers
  and runs it in a `vm` sandbox. If you rename or remove the markers, the whole test suite dies.
- PART 2 — runtime state, audio, procedural characters, storage/room sync helpers
- PART 3 — host simulation, bots, networking, location
- PART 4 — map rendering
- PART 5 — screens, HUD, alerts, dev tools, boot
- PART 6 — street data, settings preview

## Rules for changing things

1. **Never edit `index.html`.** Edit `src/`, then `npm run build`.
2. **Keep CORE pure.** No `document`, no `window`, no `G`. If a function needs game state,
   pass it in. This is what makes the logic testable, and the tests are the only thing that
   will tell a future session it broke a rule it never read about.
3. **Any logic change needs a harness test**, in the same style: one behaviour per test, named
   as a sentence a person would say. `npm test` before you call anything done.
4. Vanilla ES5-flavoured JS, `var`, no frameworks, no build tooling beyond `build.js`. It has
   to stay one file that works from a static host.
5. **No `localStorage` / `sessionStorage`.** Persistence goes through `window.storage` when
   present, and every call is wrapped so the game still runs when it isn't.
6. Prefer adding to the DEV panel over adding temporary debug UI. It already covers every
   phase jump, forced win, catch, vote and zone move. It is hidden unless the URL carries
   `#dev`, so the smoke tests that drive the game through it load the page with that flag —
   smoke5 and smoke6 deliberately do not, because they check what a player actually sees.

## Invariants the tests protect

Break any of these and the game stops making sense:

- The next zone is always fully contained in the current one, but its centre is **offset**, not
  concentric. Camping the original middle must never be a strategy.
- Imposter victory fires the moment the last genuine hider is caught, **before** any seeker win
  and before the clock. Seekers catching everyone can hand the imposter the win. That's intended.
- An exposed imposter (correctly voted out) loses the solo win condition and their powers, but
  stays in the game as an ordinary hider and can win with the hiders.
- Nobody is ever eliminated. Caught players convert to seekers after a grace period so they
  can't be chain-caught.
- `sees` is the only place that decides whether one player's marker appears on another's map.
  Seekers see other seekers, plus hiders only during FULL SIGNAL, a sustained zone violation, or
  the moment of a catch. Hiders never see seekers. Hiders see each other when `hiderSight` is on.
- **The imposter always sees the hiders while `imposterEligible`, and that is the point of the
  role** — knowing where everyone is is their power; the risk is being seen doing the missions
  that turn it into something the seekers can act on. It is not omniscience to be fixed. An
  exposed imposter loses that sight with the rest of their powers and sees what a hider sees.
  Their marker must stay indistinguishable from any other hider's, or the role is dead.
- How often a hider gives themselves away is `signalGap`, host-tunable down to never. Being
  outside the zone still exposes you with signals off — that is the punishment for it, not a
  tracking feature.
- **Nothing on screen may change because a seeker is near.** The mood colour used to shift at a
  fixed 70 m, which handed every hider a proximity detector they never asked for and could not
  switch off. The only proximity signal is a buzz, `CFG.nearWarn`, off unless the host turns it on.
- The imposter's mission is the one thing they must physically walk to, so `missionTarget` gives
  the card and the map a single answer and both show live distance. Progress ebbs at
  `CFG.missionDecay`, slowly, so losing contact for a few seconds is survivable — a mission that
  resets on a moment's inattention will not be attempted twice.
- Blips are approximate and tighten over the match; they never pin a hider exactly.
- The join link omits the connection when the page already carries it in `MP_DEFAULT`. That is
  what keeps it short enough for a scannable QR code; a link that has to carry a connection is
  ~290 characters and `qrEncode` correctly returns null rather than emitting something no camera
  will resolve.
- `qrEncode` is written out in CORE because this project has no dependencies. It is checked
  against the spec's own Reed-Solomon generator polynomials and by decoding its format bits back
  out — structural tests alone would not catch a field-arithmetic bug.
- Holding the screen awake is what actually flattens a phone. `powerTick` drops to a nearly black
  screen and one frame a second after `CFG.dimAfter` untouched, but never while a catch is one tap
  away or an alert is up.
- Canvases are sized to `window.devicePixelRatio` (up to 3x) and tile zoom is chosen for that
  density, not for CSS pixels. Drawing the map through a reduced-size buffer, or capping the
  backing store below the screen, is what made it look soft — a smoke test pins the preview's
  backing store to the device ratio.
- Smoothing stays off for the game layer, which is pixel art, and on for map tiles, which are
  photographs. Turning it off globally makes every upscaled tile blocky.
- Catch validation requires fresh location on both sides, correct roles, and the GPS allowance.
- Anything a player is told to physically walk to — objectives, the imposter's lure spot, bot
  spawns — goes through `reachableSpot`, so it lands on a real street when road data exists.
  Every one of those callers must still work when it doesn't; `roadPointNear` returns null and
  the old open-ground behaviour takes over.
- Presence means "this phone's input row changed", never "this row exists". A dead phone leaves
  its last row behind forever; reading it again is not a sign of life.
- A hider whose phone is lost for `CFG.dropLost` is caught, not deleted. Nobody is eliminated,
  and a dropped player must never be able to make a seeker win impossible.
- Vote quorum counts only players who are still answering. One dropped phone must not make
  every tribunal resolve as "no decision".
- Nearly every deadline in a match is a wall-clock stamp, so pausing cannot just stop a counter:
  `resumeShift` moves all of them, and anything added to the state that expires must be listed in
  `DEADLINES` or `PLAYER_DEADLINES` or it fires the instant play restarts.
- A paused match advances nothing at all — no clock, no zone, no bots, no catches.

## Current state

Working: volunteering to seek in the lobby, a scannable QR join code, low-power screen, seeker-proximity warning,
host pause/resume and end-early, host migration, a wake lock that survives
backgrounding, on-map guidance to the safe zone, profile and 12 procedural characters, room-code lobby over Supabase with a shareable
join link, mid-match rejoin, dropped-phone handling, roles, scatter, real-street map with a
walkable road graph driving objective and lure placement and bot movement, smooth character
movement, seeker blips, catching and conversion, moving/shrinking zone with preview, imposter
missions and anonymous tips, scheduled tribunals, full signal, all three win conditions, results,
host-tunable rules with a live scale preview, GPS filtering, diagnostics, solo mode with bots,
full dev panel.

## Multiplayer

Host-authoritative. The host runs `hostSim` and writes the whole room state; every other phone
writes one input row (position + unacknowledged actions) and reads the state back. `NET` has two
adapters behind one four-call interface (`netPutState` / `netGetState` / `netPutInput` /
`netListInputs`):

- **`supabase`** — plain REST via `fetch`, no SDK. The browser never touches a table: RLS is on
  with no policies and the grants are revoked, so everything goes through `security definer`
  routine `fs_rpc`, which always takes the room code. `rpcFor` is the single map from operation
  name to argument set and `MP_SQL` is the schema; harness tests fail if the client can send an
  operation the SQL has no branch for, and if MP_SQL grows past 50 lines — people paste it by
  hand on a phone. Config comes from the join link hash
  (`#room=CODE&mp=<url>~<anonkey>`), then the saved profile, then `MP_DEFAULT` baked into the
  build (filled in — the deployed page is pre-connected, so players never see the setup screen). This is the only adapter that works phone to phone from a static host.
- **`storage`** — the old `window.storage` bridge. Only works inside a host page that injects it.

Never send `Prefer: return=minimal` on an RPC call — PostgREST answers 204 with no body and
every read silently comes back empty. `supaRequest` omits the header unless asked.

An earlier schema gave every operation its own function. `rpcLegacyFor` still speaks it: the
first call tries `fs_rpc`, and on PGRST202 falls back once and remembers the answer in
`NET.dialect`. Deleting that shim is fine once no live project is still on the old schema.
PGRST202 also means "the routine exists but PostgREST has not reloaded" — which is why `MP_SQL`
ends with `notify pgrst, 'reload schema'` and the error text mentions waiting a few seconds.

Things that are load-bearing and easy to break:

- Actions are held in the client's outbox until `st.ack[playerId]` catches up. Never drop an
  unacked action, and never apply one twice — a replayed catch after a host restart is the bug
  this exists to prevent.
- `wireState` strips host-only bookkeeping and trims the event log before every push. A room is
  ~1 KB per player per push; at the current intervals a long match with eight players moves a
  few hundred MB, which matters on a free Supabase project.
- The room code is the only thing gating access to a match. Within a room, roles are still hidden
  by client-side convention alone — a player who reads the state can see the imposter. Fixing
  that properly means a server-side `hostSim` in an Edge Function handing each client only what
  its role may see; the CORE block ports across almost unchanged, which is why it is kept pure.

Known limits, in the order they'll hurt:

1. **Host migration is best-effort.** When `hostAt` goes stale every phone computes the same
   heir from the same room record (`hostHeir`: lowest id among present non-bots) and only that
   one claims, so a split brain needs two phones disagreeing about the record. The new host
   seeds `lastSeq` from `st.ack` — without that it replays every action still in the other
   phones' outboxes. A match whose last phone dies is still gone.
2. **Anyone holding a room code can read that room, including who the imposter is.** The code is
   the only secret; rooms cannot be listed or enumerated, but a leaked code is a leaked match.
3. Street data comes from public Overpass, now with four mirrors and failover. Fine for testing,
   one fetch per area, cached to the device, refetched as players move out of the loaded area.
   Self-host or move to a paid vector source before any real release.
4. Characters are drawn procedurally in `drawChar`. The call signature is sprite-sheet shaped,
   so swapping in real sheets is one function.
5. Objectives are two types (jammer, intel). Imposter missions are two types (follow, lure).
6. Bots follow roads by being nudged onto the nearest segment each tick. That is not pathfinding
   — they will still walk into a dead end and mill about.

## Commands

```
npm install        once, for jsdom
npm run build      src -> index.html
npm test           315 core tests + 7 smoke runs
npm run serve      localhost:8080 — geolocation works on localhost, unlike file://
```

Deploying: push to `main`. The Pages workflow builds, runs the full suite, and only deploys if
everything passes. GPS and street data need https, which Pages gives you.

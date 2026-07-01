# Class Timer as a feature of the bells app (alternate to the sibling PWA)

## Relationship to `class-timer.md`

This is the alternate design to `plans/class-timer.md`, which proposes a
**sibling PWA** at its own URL with its own manifest and service worker. Here
the same functionality is instead **built into the existing bell-schedule
app** — a new feature alongside alarms, not a new app.

The **core model is identical** and is not repeated here — see
`class-timer.md` for the full treatment of:

- routines (named, ordered chunk lists scoped to periods by `scopeNames`);

- chunks with two independent anchors (`{ base: "start"|"end", offset }`),
  which gives elastic middle segments for free across schedule variants;

- runtime resolution (resolve both boundaries against the current
  `Interval`'s real instants, clamp, sort, pick the chunk containing `now`);

- edge cases (boundary crossing, gaps, overlaps, no-routine periods);

- editor ergonomics (chain durations forward from start / backward from end,
  the stored form stays fully explicit).

The pure model module — called `timer-routines.js` there — is byte-for-byte
the same module here. That's deliberate: **the two plans differ only in
packaging and UI integration**, so building this version doesn't foreclose
extracting a sibling app later (or vice versa).

## Why integrate instead of a sibling app?

- **The audience is the same people at the same moment.** A teacher running a
  lesson wants the period countdown *and* the lesson segments; splitting them
  across two installed apps means two home-screen icons for one activity and
  flipping between apps mid-class.

- **Almost everything is already here.** The update loop, `now()` timezone
  handling, `setOffset` testing, the `BellSchedule`, calendar/teacher config,
  popup framework, progress bars, chime/banner machinery (`alarms.js`), the
  service worker, install flow, and deploy pipeline all exist. The sibling plan
  copies or re-instantiates most of these; this plan just calls them.

- **No new deployment surface.** No second manifest, service worker,
  cache-name scheme, icon set, install identity, Makefile targets,
  `publish.sh` parameterization, or CI job. The origin/`localStorage`
  questions from the sibling plan evaporate — one app, one origin, keys just
  need to not collide (they don't: routines get their own key, e.g.
  `timerRoutines`).

- **Precedent:** alarms. `alarms.js` is exactly this shape — a self-contained
  feature module wired into `bells.js` via three exports (`setupAlarms`,
  `tickAlarms`, `updateTeacherModeVisibility`), an icon in the header row, a
  popup for configuration, and a hook in `update()`. The timer follows the
  same pattern, so the integration cost is well understood.

Costs, honestly stated:

- The bells app's UI and bundle grow; students who never use routines carry
  the code (small — the model is tiny and the editor is comparable to the
  alarm editor).

- The main display gets a second claimant (see **Display integration**, the
  one genuinely new design problem in this plan).

- One shared service-worker cache means a timer bug fix redeploys the whole
  app (in practice this is how the app already ships).

## New modules

- **`timer-routines.js`** — the pure model from the sibling plan, unchanged:
  load/save routines, `resolveChunks(routine, interval)`,
  `activeChunk(chunks, instant)`, elapsed/remaining. No DOM, unit-testable.

- **`timer.js`** — the feature module, patterned line-for-line on
  `alarms.js`'s integration contract:

  - `setupTimer(getBellSchedule)` — wire the header icon, the routines popup,
    and the editor; called once at startup next to `setupAlarms`.

  - `tickTimer(instant, interval)` — called from `update()` each second
    (right beside `tickAlarms(instant)`); computes the active chunk for the
    current interval and updates the timer display region. Returns the active
    chunk (or null) so `bells.js` can let it influence the background color.

  - `updateTimerVisibility()` — analogous to `updateTeacherModeVisibility`,
    if we decide to gate the feature (see Open decisions).

`bells.js` changes are deliberately minimal: one import, one `setupTimer`
call, one `tickTimer` call in `update()`, and a small hook in the
background-color logic.

## Display integration

This is the real design work. Today `#main` shows: period name/times,
`#left` (period countdown), `#periodbar`, `#today` + `#todaybar`, and the
end-of-year `#countdown` block. The chunk display must join this without
crowding a screen that's often glanced at from across a room.

**Approach: an auto-appearing chunk section, not a mode.**

- Add a `#chunk` display block between `#periodbar` and `#today`:
  chunk **label** (large), **elapsed / to go** line (tap to toggle emphasis,
  same as `#left`'s `togo` toggle), and a `#chunkbar` progress bar.

- The section renders **only when the current interval is a `period` whose
  name matches a routine's `scopeNames`**; otherwise it's empty and takes no
  space, and the app looks exactly as it does today. No new global mode, no
  tabs, nothing to switch — walking into a period with a routine makes the
  segments appear, which matches the "never needs starting" philosophy of the
  core design.

- A small **next-chunk** line ("Exit ticket in 4:12") under the chunk bar,
  mirroring how the year-countdown block stacks small lines.

**Background color.** Both features want the container background: bells uses
blue/red/purple for period phase, and the sibling plan gave chunks a color
tint. Resolution: when a chunk is active, the **chunk's color wins** as the
base tint, and the existing last-minutes red warning applies to the *chunk*
boundary rather than the period boundary (the chunk transition is what the
teacher is pacing against; the period-end red still takes over inside the
final fixed segment anyway, since its end coincides with the period's). When
no chunk is active, current behavior is untouched.

**Chunk transitions.** Reuse `alarms.js`'s `playChime`/`showBanner` directly
(export them or lift them into a shared module) for an optional soft chime at
each chunk boundary — configurable per routine. This is where integration
visibly beats the sibling app: the machinery, its audio-unlock handling, and
its notification plumbing are already resident.

## Configuration UI

Pattern on the alarms popup wholesale:

- New header icon (a segmented-circle/timer glyph) in `#icons` next to the
  bell, toggling `#popup-routines`.

- Popup lists routines (`renderAlarmList` pattern): enable toggle,
  description ("Do Now 10m · Mini-lesson 15m · Group work ~ · Exit ticket
  10m — Period 1, Period 3"), Edit, Delete, and a Test button that previews
  the routine resolved against the *next occurrence* of a scoped period.

- Editor (`openEditor` pattern): routine name, period-name checkboxes
  (reusing `allPeriodNamesForToday`'s approach), and an ordered chunk list
  with label, duration, from-start/from-end anchor flip, optional color, and
  drag-or-buttons reordering. Live readout of the elastic middle's length for
  today's (or the next school day's) schedule, with a warning when the fixed
  segments exceed the shortest scheduled length of any scoped period — same
  authoring-time check as the sibling plan.

- Persistence in `localStorage` under `timerRoutines`, saved via the
  `saveAlarms`-style write-through with a version counter so the per-tick
  resolution can be cached per (date, routines-version), exactly like
  `computeFirings`/`getFirings` cache in `alarms.js`.

## What this plan deletes from the sibling plan

All of the packaging sections become no-ops:

- no `timer.html`, `timer-manifest.json`, `timer-sw.js.template`, separate
  icons/screenshots;

- no `timer-build` / `timer-watch` / `timer-publish` Makefile targets, no
  `publish.sh` parameterization, no CI changes — `timer.js` and
  `timer-routines.js` are pulled into `out.js` by the existing `make build`,
  and `pretty`/`lint` already glob `*.js`;

- no origin decision, no storage-isolation section, no install-flow work.

The service worker needs **zero changes** (no new static assets beyond
possibly one inline SVG icon in `index.html`); the cache-name hash already
covers `out.js`/`index.html`/`style.css` changes.

## Testing

- `timer-routines.js` unit tests carry over from the sibling plan verbatim
  (synthetic period instants; active-chunk selection, elastic stretch/shrink,
  boundary collapse).

- Manual date-travel with `setOffset()` as ever.

- One integration check worth doing by hand: a routine active during a period
  while an alarm fires in the same period (banner + chunk display + color
  precedence all at once).

- No library changes; golden tests untouched.

## Phasing

1. **Model + hidden wiring.** `timer-routines.js` with tests; `tickTimer`
   wired into `update()` rendering the chunk section for a hardcoded routine
   (no editor yet). Ship dark — with no routines defined, nothing changes for
   any user.

2. **Editor + persistence.** Routines popup, editor, `localStorage`,
   short-schedule warnings, header icon.

3. **Polish.** Chunk-transition chime (shared with alarms), chunk color /
   background precedence, next-chunk line, Test/preview button.

## Open decisions

- **Teacher-gated or not?** Alarms hide behind teacher mode
  (`updateTeacherModeVisibility`). Same leaning as the sibling plan: **not
  gated** — students pacing their own study benefit too, and the feature is
  invisible until you create a routine anyway. If gated later, the
  `updateTimerVisibility` hook is already in the shape of the alarms one.

- **Chunk red-warning threshold.** The period logic uses a fixed 10 minutes;
  chunks can be shorter than that. Leaning: `min(10 min, 20% of chunk
  length)` with a 1-minute floor, tuned during phase 3.

- **Which plan to build.** If both apps are truly for the same user at the
  same moment, this plan is less work and less surface (recommendation). The
  sibling plan wins only if the timer should have its own identity —
  shareable URL, separate install, non-BHS audiences someday. Because
  `timer-routines.js` is common to both, the decision is cheap to revisit.

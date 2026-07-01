# Class Timer as a mode of the bells app (chosen design)

## Relationship to `class-timer.md`

This is the alternate design to `plans/class-timer.md`, which proposes a
**sibling PWA** at its own URL with its own manifest and service worker. Here
the same functionality is instead **built into the existing bell-schedule
app** as a **mode with its own dedicated display**, switched by a header
icon. **This is the chosen direction** — the sibling-PWA plan is kept for its
core-model treatment and as a record of the alternative.

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

- The app grows a second full-screen display and a mode flag (see **Timer
  mode and its dedicated display**) — though the mode-switch idiom already
  exists in the `#main`/`#summer`/`#noCalendar` swapping.

- One shared service-worker cache means a timer bug fix redeploys the whole
  app (in practice this is how the app already ships).

## New modules

- **`timer-routines.js`** — the pure model from the sibling plan, unchanged:
  load/save routines, `resolveChunks(routine, interval)`,
  `activeChunk(chunks, instant)`, elapsed/remaining. No DOM, unit-testable.

- **`timer.js`** — the feature module, patterned on `alarms.js`'s
  integration contract:

  - `setupTimer(getBellSchedule)` — wire the mode-switch icon, the routines
    popup, and the editor; called once at startup next to `setupAlarms`.

  - `isTimerMode()` / `toggleTimerMode()` — the mode flag, persisted in
    `localStorage` (important: the app force-reloads every 24 hours, so a
    classroom device left in timer mode must come back in timer mode).

  - `tickTimer(instant, interval)` — called from `update()` each second
    (right beside `tickAlarms(instant)`). Always computes the active chunk
    (chimes fire regardless of mode); renders the dedicated display when
    timer mode is on.

  - `updateTimerVisibility()` — analogous to `updateTeacherModeVisibility`,
    if we decide to gate the feature (see Open decisions).

`bells.js` changes are deliberately minimal: one import, one `setupTimer`
call, and a mode dispatch in `update()` — timer mode renders the timer
display, bells mode runs the existing path untouched.

## Timer mode and its dedicated display

The timer is a **mode**: a header icon toggles between the normal bells
display and a dedicated timer display that owns the whole screen. This gives
the lesson view room to breathe (it's glanced at from across a classroom)
instead of squeezing chunk info between the existing countdown elements, and
it leaves the bells display byte-for-byte untouched for everyone else.

**Mode switch.**

- A new icon in `#icons` (a segmented-circle/timer glyph) toggles the mode;
  it gets a visually "active" state while timer mode is on. All the other
  header icons (config, schedule, alarms, QR) remain available in both modes.

- Implementation follows the app's existing display-swap idiom: `#main`,
  `#summer`, and `#noCalendar` are already mutually exclusive `div`s toggled
  via `style.display`. Timer mode adds a `#timer-main` sibling; `update()`
  dispatches on the mode flag to decide which one renders. Summer and
  no-calendar states behave the same in both modes.

- The mode persists in `localStorage` and survives the 24-hour auto-reload,
  so a device parked in timer mode stays there.

**The dedicated display** (in a scoped period with a routine):

- Active chunk **label**, large — the primary element.

- **Elapsed / to go** in the chunk (tap to toggle emphasis, same as `#left`'s
  `togo` toggle) and a full-width `#chunkbar` progress bar.

- The **whole routine as a list** — each chunk with its resolved times for
  this occurrence, completed ones dimmed, the active one highlighted, the
  elastic middle shown at its actual stretched length. The dedicated screen
  has room for this, and it's the at-a-glance lesson map the compact design
  couldn't afford.

- A small **period line** at the bottom: period name, start–end times, and
  the period countdown — so switching to timer mode never loses the one thing
  the bells display was for.

**Idle states in timer mode** (passing period, unscoped period, before/after
school): show the current interval name and a countdown to the next scoped
period's first chunk, plus a preview of the routine that will run then. The
display is never blank; it answers "when does my next planned lesson start."

**Background color.** In timer mode the **chunk's color** is the base tint,
with the last-minutes red warning keyed to the *chunk* boundary rather than
the period's (the chunk transition is what the teacher is pacing against;
period-end red still effectively applies in the final fixed segment, whose
end coincides with the period's). Bells mode keeps today's colors untouched.

**Chunk transitions.** Reuse `alarms.js`'s `playChime`/`showBanner` directly
(export them or lift them into a shared module) for an optional soft chime at
each chunk boundary — configurable per routine, and fired from `tickTimer`
regardless of which mode is showing (a teacher who flips back to the bells
view mid-lesson still wants the pacing chime). This is where integration
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

1. **Model + mode shell.** `timer-routines.js` with tests; the mode icon,
   persisted mode flag, and `#timer-main` display rendering active chunk,
   elapsed/to-go, chunk bar, and the routine list for a hardcoded routine (no
   editor yet). With no routines defined and the mode off, nothing changes
   for any user.

2. **Editor + persistence.** Routines popup, editor, `localStorage`,
   short-schedule warnings.

3. **Polish.** Chunk-transition chime (shared with alarms), chunk-keyed
   background color, idle-state preview, Test/preview button.

## Open decisions

- **Teacher-gated or not?** Alarms hide behind teacher mode
  (`updateTeacherModeVisibility`). Same leaning as the sibling plan: **not
  gated** — students pacing their own study benefit too, and the feature is
  invisible until you create a routine anyway. If gated later, the
  `updateTimerVisibility` hook is already in the shape of the alarms one.

- **Chunk red-warning threshold.** The period logic uses a fixed 10 minutes;
  chunks can be shorter than that. Leaning: `min(10 min, 20% of chunk
  length)` with a 1-minute floor, tuned during phase 3.

- ~~**Which plan to build.**~~ Decided: this one — a mode within the bells
  app with its own dedicated display and a mode-switch icon. The sibling-PWA
  plan remains cheap to revive later because `timer-routines.js` is common to
  both.

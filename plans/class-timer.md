# Class Timer — a period-anchored lesson timer PWA

> **Superseded by decision:** the chosen design is
> `plans/class-timer-in-bells.md` — the same functionality as a *mode within
> the bells app* with its own dedicated display, rather than a sibling PWA.
> This document remains the authoritative treatment of the core routine/chunk
> model (referenced from there) and the record of the sibling-app packaging
> alternative.

## Motivation

The bell-schedule app tells you *which* period you're in and how much of it is
left. A teacher running a lesson wants the next level of detail: a plan for the
period broken into labeled segments — "Do Now", "Mini-lesson", "Group work",
"Exit ticket" — and, at any moment, which segment is active and how much time is
left in it.

Ordinary interval timers make you press *start* at the exact moment class
begins. That's fragile: you forget, you start late, the app reloads, the phone
sleeps. The insight this app is built on is that a class already has a canonical
clock — the bell schedule. If every segment boundary is expressed **relative to
the period's start or end** ("5 min after the bell", "the last 10 minutes"),
then the timer never needs to be started. It reads the wall clock, asks the
bells library which period is running right now and when it began and ends, and
computes the active segment. Open the app mid-class and it's already correct.

A second payoff falls out of the same design: because boundaries are anchored to
*this occurrence's* real start/end instants, a plan authored once works across
every schedule variant — a normal 90-minute block, a late-start short block,
a minimum day — with no per-schedule editing. Start-anchored segments stay
pinned to the front, end-anchored segments stay pinned to the back, and an
elastic middle segment absorbs the difference.

This is a **sibling** of the bell-schedule app: a separate installable PWA,
separate URL, but built from the same repo and sharing the `@peterseibel/bells`
library, the calendar data, and most of the existing plumbing.

## What it is not

- Not the existing "Custom Countdown" (`gigamonkeys.com/misc/countdown`), which
  is a free-standing stopwatch. This one is anchored to the BHS schedule.
- Not a replacement for the alarms feature in the bells app. Alarms fire
  discrete point-in-time chimes; this shows a continuous, always-correct view of
  where you are in a structured lesson. (They share mechanism — see reuse
  notes — and could later cross-pollinate.)

## Core model

### Routines and chunks

A **routine** is an ordered, named list of **chunks** that applies to one or
more periods:

```js
{
  id: "abc123",
  name: "Block schedule lesson",
  scopeNames: ["Period 1", "Period 3"],   // period names this routine drives
  chunks: [ /* … */ ],
}
```

`scopeNames` mirrors the alarms feature (`alarms.js`, `periodMatchesScope`):
routines attach to periods **by name**, so the same routine can drive every
occurrence of "Period 3" all year, and a teacher with different preps can define
one routine per period.

A **chunk** is a labeled span with two boundaries, each anchored to the period
start or the period end:

```js
{
  id: "c1",
  label: "Do Now",
  color: "#4f46e5",                    // optional; used for background tint
  start: { base: "start", offset: 0 },    // 0s after the bell
  end:   { base: "start", offset: 600 },  // 10m after the bell
}
```

- `base` is `"start"` or `"end"`.
- `offset` is a non-negative number of seconds, interpreted **forward from the
  period start** (`base: "start"`) or **backward from the period end**
  (`base: "end"`). This matches the alarm anchoring vocabulary
  (`after-start` / `before-end`).

### Why two independent anchors per chunk (elasticity for free)

A chunk anchored `start`→`start` is pinned to the front; `end`→`end` is pinned
to the back. A chunk anchored **`start` on one side and `end` on the other** is
elastic — it occupies whatever is left between a fixed front block and a fixed
back block, stretching on a long block and shrinking on a short one. No special
"flex" type is needed in the stored model; the two-anchor representation
expresses it directly, and the runtime stays a single resolve-and-compare loop.

Worked example — a 90-minute block that degrades gracefully to a short one:

| Chunk        | start            | end              |
| ------------ | ---------------- | ---------------- |
| Do Now       | start + 0        | start + 10m      |
| Mini-lesson  | start + 10m      | start + 25m      |
| Group work   | start + 25m      | **end − 10m**    |  ← elastic
| Exit ticket  | **end − 10m**    | end − 0          |

On a 90-minute period Group work gets ~55 min; on a 55-minute short block it
gets ~20 min; the front and back segments never move. The teacher authors this
once.

### Editor ergonomics vs. stored form

The stored form is the fully-explicit two-anchor object above (dead simple for
the runtime). The **editor** hides that behind friendlier entry so a boundary is
rarely typed twice:

- Add a segment with a **label** and a **duration**; consecutive
  from-the-start segments chain (each new chunk's `start` = previous chunk's
  `end`).
- A segment can be flipped to **anchor from the end** ("last N minutes"); those
  chain backward from the period end.
- The segment between the last start-anchored one and the first end-anchored one
  is the elastic middle — the editor shows its live length for the currently
  selected schedule and flags it if it would go negative.

(Exact editor interaction is a UI-polish detail; the data contract above is the
committed part.)

## Runtime

The update loop is a near-copy of `bells.js` `update()`:

- `now()` — the same timezone kludge that converts wall-clock to
  `America/Los_Angeles`, plus `setOffset()` for manual future-date testing.
- `setTimeout(update, 1000 - t.getMilliseconds())` — tick once a second, synced
  to the second rollover.
- 24-hour auto-reload guard (`reloadAt`).

Each tick:

1. `interval = bellSchedule.currentInterval(instant)` (from
   `@peterseibel/bells`). The `Interval` carries `name`, `start`, `end`,
   `type` (`period` | `passing` | `before-school` | `after-school` | `break`),
   and `left(now)` / `done(now)`.

2. **In a period** (`interval.type === "period"`): find the routine whose
   `scopeNames` includes `interval.name`. Resolve every chunk against *this
   occurrence's* instants:

   ```js
   const resolve = (a, period) =>
     a.base === "start"
       ? period.start.add({ seconds: a.offset })
       : period.end.subtract({ seconds: a.offset });
   ```

   Clamp each boundary to `[period.start, period.end]`, sort chunks by start,
   and pick the active chunk as the one with `start ≤ now < end`. Compute
   `elapsed = start.until(now)` and `remaining = now.until(end)` — the same
   pattern as `Interval.done()` / `Interval.left()`, formatted with
   `hhmmss` / `timeCountdown` from `datetime.js`.

3. **Between/around periods** (passing, before/after school, summer, or a period
   with no routine): idle state — show the period name if any, and a countdown
   to the next scoped period's first chunk. Use
   `bellSchedule.currentOrNextPeriodNumber` / `scheduleFor(date)` /
   `nextSchoolDayStart` to find the next relevant period. During summer, mirror
   the bells app's summer panel.

### Edge cases

- **Boundaries cross** (period shorter than the fixed front+back segments): after
  clamping, the elastic middle collapses to zero and neighboring fixed segments
  meet; nothing throws. The editor warns at authoring time using the shortest
  period length across the selected calendar's schedules.
- **No routine for the current period:** idle/preview state, not an error.
- **Gaps between chunks** (chunks needn't tile the period): if `now` falls in a
  gap, show a neutral "between segments" state with a countdown to the next
  chunk's start.
- **Overlap:** first match by sorted start wins; the editor discourages overlap
  but the runtime is total.

## Display

Reuses the bells app's visual language (`style.css` classes: `.display`,
`.bar`, `#container` background tinting, popup overlays).

- **Primary:** active chunk **label** (large), **elapsed** (count up) and
  **time to go** (count down) in the chunk, and a chunk progress bar
  (`updateProgressBar` pattern).
- **Secondary:** period name and overall period progress bar; **next chunk**
  label with a small countdown to it.
- **Background color:** per-chunk `color` tint, shifting to red in the last
  minute of a chunk (reusing the bells `inLastTen`-style logic, tuned for
  shorter spans), and the pink summer tint when out of session.
- Tap the elapsed/to-go line to toggle count-up vs count-down emphasis
  (the bells `togo` toggle).

## Reuse map

Shared, imported **unchanged** from the repo root:

- `@peterseibel/bells` and `@peterseibel/bhs-calendars` (already deps).
- `calendar.js` — gives `getBellSchedule()`, calendar picker, optional-period
  config, and the teacher/student toggle. It persists to `localStorage`, and
  whether that state is *shared* with the bells app depends entirely on the
  deployment origin (see **Storage isolation** below). The timer's own routine
  data lives under its own key regardless.
- `datetime.js` (`hhmmss`, `timestring`, `timeCountdown`) and `dom.js`
  (`$`, `$$`, `text`, …).

Adapted (copied and trimmed), not imported:

- The **update loop / `now()` / `setOffset` / 24h-reload** block from
  `bells.js`.
- The **PWA registration** (`registerServiceWorker`, `forceReload`,
  online-check, install prompts) from `bells.js`.
- The **chime + banner** mechanism from `alarms.js` (Web Audio `playChime`,
  `showBanner`) — optional, to sound a soft tone on each chunk transition.
  Phase 2.

New files:

- `timer.js` — entry point (UI orchestration + update loop).
- `timer-routines.js` — routine/chunk model: load/save, resolve-against-period,
  active-chunk selection. Pure logic, unit-testable in isolation.
- `timer.html`, `timer.css` (or shared `style.css` + additions).
- `timer-manifest.json`, `timer-sw.js.template`.
- New icons under `images/icons/` and screenshots under
  `images/pwa-screenshots/`.

## Repository layout & deployment

Keep it in **this repo as a second entry point** (not a new repo): it depends on
`calendar.js`, `datetime.js`, `dom.js`, and the same library/calendar packages,
and "sibling app" is exactly what a second bundle + manifest + service worker
gives us. It deploys to a **sibling URL**, e.g.
`https://gigamonkeys.com/misc/timer/` (final path TBD — the working branch is
`period-timer`, so "Period Timer" / `/misc/timer/` is the leading name).

Each PWA needs its own scope, so the timer gets its own manifest, its own
service worker with its own cache-name prefix (`timer-…`), and its own file
list.

### Storage isolation (origin decision)

An **origin** is scheme + host + port, matched exactly, so this choice governs
`localStorage`, service-worker scope, and Cache Storage all at once:

- **Path** (`gigamonkeys.com/misc/timer/`) — *same origin* as the bells app.
  `localStorage` is shared. That lets the two apps deliberately share the
  calendar/teacher config written by `calendar.js` (`selectedCalendar`,
  `extraPeriods`, `otherData`) — "configure once" — while app-specific keys
  (`alarms` vs the timer's routines) stay distinct and never collide. Fits the
  existing `/misc/bhs/` deploy pattern and `publish.sh` (just a new subdir).
- **Subdomain** (`timer.gigamonkeys.com`) — a *different host is a different
  origin*, so `localStorage`, service workers, caches, and cookies are all
  isolated automatically. No namespacing needed, but the calendar/teacher config
  can't be shared (the user picks a calendar in each app), and it costs a new
  vhost/DNS entry and a separate deploy target dir.

**Namespacing.** Only relevant on the shared-origin (path) option. App-specific
keys already differ by name, so the only truly shared surface is the
`calendar.js` config — which we *want* shared. If full isolation on a shared
origin is nonetheless desired, prefix keys (`bhs:` for shared config, `bells:` /
`timer:` for app-specific) — but note this requires a **one-time migration in
the bells app** to copy existing users' unprefixed keys to the new names, or
installed users silently lose their teacher mode / optional periods / selected
calendar on next load.

Recommendation: **path + intentionally-shared config**, no migration. Reach for
the subdomain only if hard isolation between the two apps is a goal in itself.

### Build (Makefile additions)

Mirror the existing `build` / `watch` / `publish` targets:

- `timer-build`: `esbuild timer.js → timer-out.js` (sourcemap, bundle, esm),
  then hash `timer-out.js` + `timer.css` + `timer.html` + `timer-manifest.json`
  into a `timer-<hash>` cache name substituted into `timer-sw.js.template` →
  `timer-sw.js`.
- `timer-watch`: esbuild watch for `timer.js`.
- `timer-publish`: copy the timer file set to the sibling web dir.

`publish.sh` currently hardcodes `webdir=~/web/www.gigamonkeys.com/misc/bhs/`.
Parameterize it to take the target subdir (default `bhs/`) so `timer-publish`
can pass `timer/`, or add a thin `timer-publish.sh`. The GitHub Actions
`publish.yml` workflow gets a parallel job (or a matrix) for the timer bundle.

`pretty` / `lint` already glob `*.js`, so `timer*.js` are covered automatically.

## Testing

- **`timer-routines.js` is pure** and gets unit tests: resolve chunks against a
  synthetic period (fixed start/end instants), assert active-chunk selection,
  elapsed/remaining, elastic-middle stretch/shrink, and the boundary-crossing
  collapse. These can run under the `libs/ts` Vitest setup or a small standalone
  test file — no DOM needed.
- **Manual/date-travel:** `setOffset(year, month, day, h, m, s)` to jump into a
  known period on a known schedule and watch the segments advance, exactly as
  the bells app is tested today (per `CLAUDE.md`).
- No behavior is added to `@peterseibel/bells`, so the golden tests are
  untouched.

## Phasing

1. **Skeleton + model.** `timer-routines.js` (load/save/resolve/active-chunk)
   with unit tests; `timer.html` shell reusing `calendar.js`; the update loop
   rendering the active chunk, elapsed, time-to-go, and chunk progress bar for a
   hardcoded routine.
2. **Editor.** Routine list + chunk editor (label, duration, anchor-from-start /
   anchor-from-end, color), `localStorage` persistence, per-period `scopeNames`,
   short-schedule warnings.
3. **PWA.** `timer-manifest.json`, `timer-sw.js.template`, service-worker
   registration, icons, install prompts, offline check; Makefile + publish +
   CI wiring; deploy to the sibling URL.
4. **Polish (optional).** Chunk-transition chimes/banners (reuse `alarms.js`
   audio), idle/preview state refinements, next-chunk countdown, background
   color tuning.

## Open decisions

- **Deployment origin (URL / product name):** path (`/misc/timer/`, shared
  origin, shared config) vs. subdomain (`timer.gigamonkeys.com`, isolated
  origin). See **Storage isolation** — this one choice decides the namespacing
  question too. Leaning: path, product name "Period Timer" (branch is
  `period-timer`).
- **Teacher-only?** Alarms are gated behind teacher mode. Should routines be
  too, or is the timer useful to students (who'd author their own study
  segments)? Leaning: available to everyone, no teacher gate — but reuse the
  shared calendar/teacher config so the *schedule* matches what the user sees.
- **One routine per period vs. a routine picker:** `scopeNames` supports
  many-periods-per-routine; do we also want to let the user pick a routine
  ad-hoc for "today only" independent of the period? Leaning: no for v1 — keep
  it purely schedule-driven, which is the whole point.
- **Storage isolation / namespacing** — folded into the origin decision above.
  On a shared origin, leaning: share the calendar/teacher config as a feature
  and rely on already-distinct app keys (no bells-app migration). Full key
  namespacing is only worth its migration cost if hard isolation is a goal.
</content>
</invoke>

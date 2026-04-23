# Alarms

Let users set alarms that fire relative to the start or end of periods, with a
visual + audible signal when they go off.

## User model

An **alarm** is:

- **Offset** — a signed number of seconds. Negative = before the anchor,
  positive = after. (UI exposes minutes+seconds; storage is seconds.)
- **Anchor** — `start` or `end` of the period.
- **Scope** — which periods this alarm applies to. v1 options:
  - `all` — every period on the schedule for the day
  - `class` — any period where `duringSchool` is true and it isn't a passing
    period or break (i.e. an actual class block)
  - `named:<name>` — periods whose `name` matches exactly (e.g. `Lunch`, `3`).
    Lets someone set "5 min before end of lunch" without it also firing for
    every class.
- **Label** — optional user text shown when it fires (defaults to something
  like "5 min before end of Period 3").
- **Enabled** — toggle.
- **id** — stable uuid/random string for list operations.

Example: `{ offset: -300, anchor: 'end', scope: 'class', label: '5 min left',
enabled: true }` fires 5 minutes before the end of each class period.

## Storage

Append to the existing localStorage config pattern used by [calendar.js](calendar.js)
for zero/seventh/ext. Key: `alarms` → JSON array of alarm objects. One module
`alarms.js` owns read/write/list/add/update/remove.

## Firing logic

The update loop in [bells.js:228](bells.js:228) already runs every second with
the current `instant` and can get the day's schedule via
`bellSchedule.scheduleFor(today)`. In that loop:

1. Compute, for the current school day, the set of `{alarm, period, fireAt}`
   tuples where `fireAt = period[anchor] + offset` and the alarm's scope
   matches the period. Cache this per (date, alarms-version) — recompute only
   when the date rolls over or alarms are edited.
2. Each tick, find tuples where `fireAt` is within the last second (i.e.
   `previousInstant < fireAt <= instant`). Track `previousInstant` across
   ticks; on first tick set it to `instant` to avoid a burst of firings when
   the app loads mid-day.
3. Persist `lastFiredAt` per alarm id in memory (not localStorage) so a single
   alarm that matches multiple periods still fires for each, but a single
   (alarm, period, date) tuple never fires twice if the tab is reloaded (use a
   `firedKeys` Set scoped to the current date, keyed by
   `${alarmId}|${periodName}|${fireAtMillis}`, persisted in sessionStorage so
   a refresh doesn't re-fire).

Edge cases to call out:

- **Missed alarms** (tab was backgrounded, laptop asleep). On resume the gap
  between `previousInstant` and `instant` may be large. Decision: if the
  missed window is ≤ 60s, fire the alarm late; otherwise drop it silently. A
  small "missed" toast is noisy and not worth it.
- **Scope `named`**: period names in the library include things like `"3"`,
  `"Lunch"`, `"Passing"`. Show the actual names from the current year's
  schedule in the picker rather than a free-text field — less error-prone.
- **Passing-period anchors**: allow the user to set alarms on passing periods
  if they pick them by name, but `scope:class` excludes them.

## Signal

**Visual:** a full-width banner slides down from the top of `#container` with
the alarm label and a dismiss (×) button. Auto-dismisses after ~8s. While
active, `#container` gets a pulsing outline (CSS animation). Stack multiple
banners vertically if two fire together.

**Audible:** synthesized tone via the Web Audio API — a short two-note chime
(e.g. 880Hz then 660Hz, 200ms each, with a quick envelope to avoid clicks).
Using Web Audio instead of an `<audio>` file keeps the bundle small and
sidesteps having to ship a sound asset through the service worker.

**iOS audio unlock:** Web Audio is suspended until a user gesture. Resume the
`AudioContext` on first interaction (any click on the page). Additionally,
the alarm config popup gets a **"Test"** button next to each alarm that plays
the chime — this doubles as the unlock gesture and as a way for the user to
verify their volume. Without at least one gesture per page load, alarms will
fire visually but silently; surface this state as a one-line warning at the
top of the alarm config ("Tap Test to enable sound on this device") that
disappears once the context is running.

## UI

New icon in [index.html:17](index.html:17) `#icons` (🔔) next to gear/sched/apple, opening a new
`#popup-alarms` overlay. Inside:

- List of existing alarms, each row: enable toggle, human-readable summary
  ("5m before end of class"), Test button, Edit, Delete.
- "Add alarm" button opens an editor with: offset (minutes + seconds with
  +/− buttons or a signed number input), anchor (start/end radio), scope
  (dropdown: All periods / Class periods / Specific period → second dropdown
  of names from the current schedule), label (optional text).
- Match the existing popup/overlay styling in [style.css](style.css) and wire close
  behavior into the shared handler at [bells.js:607](bells.js:607).

## Module layout

- `alarms.js` — data model, storage, scope matching, `computeFirings(date,
  bellSchedule)`, `tick(previousInstant, instant, bellSchedule)` returning a
  list of `{alarm, period}` that should fire now.
- `alarm-ui.js` — banner rendering, sound synthesis, config popup.
  Alternatively fold the UI into `bells.js` to match current structure — it's
  a small app and there isn't much separation today. Preference:
  `alarms.js` for logic (easy to unit-test), inline the UI wiring in
  `bells.js`.

## Out of scope (v1)

- **Background / locked-screen alarms.** The app can't reliably fire when the
  tab is closed or the screen is locked. Doing so would require either the
  Notifications API with periodic background sync (poor browser support,
  especially iOS) or local push notifications, which the library/server
  architecture can't supply. Document the limitation in the config popup:
  "Alarms only fire while this page is open."
- Per-alarm custom sounds.
- Recurring alarms with their own schedule independent of periods.
- Snooze.

## Rollout order

1. `alarms.js` logic + unit tests (add under `lib/` testing pattern or a new
   lightweight test file — there's no current web-app test harness, so
   probably just exercise via `setOffset` manually).
2. Banner + Web Audio chime, hard-coded single alarm for smoke testing.
3. Config popup + storage.
4. Polish: test button, audio-unlock warning, missed-alarm handling.

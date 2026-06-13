# Spec: Abstract-time API for `@peterseibel/bells`

This spec is self-contained: it describes new functionality to implement in
the bells library itself. References to **bhs-cs** — the Berkeley High School
CS course-management app that is the primary consumer of bells — are
background and compatibility context only; implementing this spec does not
require access to that codebase.

## Background

bhs-cs has a notion of an *abstract time*: a moment described not as a wall
clock time but as an offset from a schedule-defined point in the day, e.g.
"five minutes before the end of the period on 2025-10-01". It stores these in
a SQLite table as `(date, offset, offset_point)` tuples with the *period*
deliberately left unbound: the period is supplied at query time (from the
class a student is enrolled in, or the current wall-clock period), so a
single stored time like "start of period" resolves differently for a
period-2 class than a period-5 class.

Today bhs-cs implements all of this itself in a module layered on top of
`BellSchedule` (`scheduleFor`, `periodAt`): the five offset points named
above, `[-+]HH:MM` offset parsing, and resolution to `ZonedDateTime`/epoch
seconds. Alongside that there is an unimplemented design sketch (referred to
below as *the original sketch*) for richer lesson-plan input: day offsets
("ideally school days"), week offsets that snap forward to a school day, and
a compact one-line string syntax. Neither the implemented code nor the
sketch supports relative days — there is no way to say "start of period next
Monday" or "start of next week".

Everything these features need to know — which days are school days, what the
periods are on a given date, where weeks begin and end across holidays — lives
in `@peterseibel/bells`. This spec defines an API to add to bells so that the
abstract-time logic moves into the library and bhs-cs (and other consumers)
just bind dates and periods.

## Concepts

An abstract time has three independent parts:

1. **A day spec** — which calendar date, possibly relative to a *base date*
   (for lesson plans, the date the lesson meets): "+2 school days", "next
   Monday", "end of week", "start of next week", or an absolute date. Omitted
   means the base date itself.

2. **A time anchor** — the schedule-defined point in that day: start/end of a
   period, start/end of the school day, or midnight.

3. **An offset** — a signed `HH:MM` duration applied to the anchor.

Resolution happens in **two phases**, matching how bhs-cs uses these:

- **Day binding** (lesson-plan load time): the day spec is resolved against
  the base date and the school calendar, producing a concrete date. The
  result is exactly the `(date, anchor, offset)` shape the app already stores,
  so no schema change is needed.

- **Time resolution** (query time): the bound time plus a period number (when
  the anchor needs one) produces a concrete `Temporal.ZonedDateTime`.

## Data model

```ts
/** Schedule-defined points in a day. Tokens match bhs-cs's existing
    offset_point values so stored data needs no migration. */
type TimeAnchor =
  | 'start_of_period'
  | 'end_of_period'
  | 'start_of_day'
  | 'end_of_day'
  | 'midnight';

/** Which day, possibly relative to a base date supplied at bind time. */
type DaySpec =
  | { type: 'date'; date: string }        // absolute ISO date
  | { type: 'schoolDays'; n: number }     // n school days from base
  | { type: 'weeks'; n: number }          // n calendar weeks from base
  | { type: 'weekday'; weekday: number }  // next <weekday>, ISO 1=Mon..7=Sun
  | { type: 'week'; edge: 'start' | 'end'; n: number };
    // first/last school day of the week n weeks from the base date's week
    // (n = 0: this week, n = 1: next week)

/** A fully abstract time, before day binding. */
interface AbstractTime {
  day?: DaySpec;       // omitted = the base date
  anchor: TimeAnchor;
  offset?: string;     // '[-+]HH:MM', default '+00:00'
}

/** After day binding. Period (if the anchor needs one) still unbound.
    Field-compatible with what bhs-cs stores in its times table. */
interface BoundTime {
  date: string;        // ISO date
  anchor: TimeAnchor;
  offset: string;
}
```

Offset strings are `HH:MM` with an optional leading sign; no sign means
positive. (The compact string *syntax* below requires the sign so a
time-offset token is unambiguous, but the object fields must accept unsigned
values: bhs-cs's existing stored data has offsets like `00:00` and `-00:05`.)

## String syntax

Lesson plans want a compact one-line form. The grammar, extending the
original sketch's `offsetPoint [-+]offset +N days` idea with the
relative-day forms (all tokens are case-insensitive):

```
abstract-time := anchor [time-offset] [day-part]

anchor        := 'start_of_period' | 'end_of_period'
               | 'start_of_day' | 'end_of_day' | 'midnight'

time-offset   := ('+' | '-') H{1,2} ':' MM

day-part      := ('+' | '-') N ('day' | 'days')     # school days
               | ('+' | '-') N ('week' | 'weeks')   # calendar weeks
               | weekday-name                       # 'monday'..'sunday', 'mon'..'sun'
               | ('start' | 'end') 'of' ['next'] 'week'
               | 'next week'                        # alias for 'start of next week'
               | iso-date                           # YYYY-MM-DD
```

Tokens are whitespace-separated; omitted time-offset defaults to `+00:00`;
omitted day-part defaults to the base date. Examples:

| String                       | Meaning                                              |
| ---------------------------- | ---------------------------------------------------- |
| `start_of_period`            | start of the (later-bound) period on the base date   |
| `end_of_period -00:05`       | five minutes before the end of the period            |
| `end_of_day +1 day`          | end of school on the next school day                 |
| `start_of_period monday`     | start of the period on the next Monday               |
| `start_of_day next week`     | start of school on the first school day of next week |
| `end_of_day end of week`     | end of school on the last school day of this week    |
| `midnight +1 week`           | midnight exactly one calendar week out               |
| `start_of_day 2026-01-05`    | start of school on an absolute date                  |

Parse errors (unknown anchor, malformed offset, unrecognized day part) throw
with a message naming the bad token.

## API surface

New module (e.g. `src/abstract-time.ts`), with the functions and the types
(`TimeAnchor`, `DaySpec`, `AbstractTime`, `BoundTime`) exported from the
package entry point alongside the existing exports.

### Standalone (no calendar needed)

```ts
parseTime(spec: string): AbstractTime;
formatTime(t: AbstractTime): string;   // canonical round-trip of parseTime
```

### On `BellSchedule`

```ts
/** Resolve a day spec against a base date. See semantics below. */
resolveDay(base: Temporal.PlainDate, day?: DaySpec): Temporal.PlainDate;

/** Phase 1: bind the day. Convenience for { date: resolveDay(...), ... }.
    Runs timeWarnings on the result and reports anything it finds via
    onWarning (default: console.warn). */
bindTime(
  base: Temporal.PlainDate,
  t: AbstractTime,
  onWarning?: (warning: string) => void,
): BoundTime;

/** Sanity-check a bound time: human-readable warnings for specs that don't
    make sense against the calendar (see Validation below). Empty = OK. */
timeWarnings(t: BoundTime): string[];

/** Phase 2: resolve to a concrete time, supplying the period if the anchor
    needs one. Null when the date has no schedule / no such period. */
resolveTime(t: BoundTime, period?: number): Temporal.ZonedDateTime | null;

/** n school days from `date` (n may be negative; 0 = date itself). */
addSchoolDays(date: Temporal.PlainDate, n: number): Temporal.PlainDate;

/** The numbered period on a date, per the periodNumber matcher, or null. */
periodOnDate(date: Temporal.PlainDate, n: number): ScheduledPeriod | null;

/** The number of the period containing `instant`, or the next numbered
    period later the same day, or null if neither exists. */
currentOrNextPeriodNumber(instant?: Temporal.Instant): number | null;
```

### New `BellScheduleOptions` entry

bells period names are strings (`"Period 1"`, `"Period 1 Final"`, `"Lunch"`);
the library needs to know which periods are "numbered" and what number they
carry. Make the bhs-cs heuristic the default but configurable:

```ts
interface BellScheduleOptions {
  // ...existing options...
  /** Extract a period number from a period, or null for non-numbered
      intervals. Default: name => /^Period (\d+)\b/ match. */
  periodNumber?: (period: { name: string }) => number | null;
}
```

(This lets bhs-cs delete its local copies of the same logic.)

## Semantics

### Day resolution (`resolveDay`, base date B)

- **omitted / `date`** — B, or the absolute date, as given. No school-day
  snapping: lesson-plan base dates are school days by construction and
  absolute dates are taken at face value (resolution-time leniency is the
  caller's concern, see below).

- **`schoolDays n`** — n = 0 returns B; n > 0 returns the nth school day
  strictly after B; n < 0 the nth school day strictly before. Counting works
  even if B itself is not a school day. (These are school days, not calendar
  days, by design.)

- **`weeks n`** — B plus 7·n calendar days, taken literally — no snapping.
  (The original sketch had this snapping forward, but the right direction is
  ambiguous: `+1 week` landing on a holiday Friday could equally mean
  Thursday or the following Monday.) If the result isn't a school day,
  validation warns and the author should say what they mean — a school-day
  offset, an explicit weekday, or a week boundary.

- **`weekday w`** — the first date *strictly after* B whose day-of-week is w.
  So "monday" on a lesson dated Monday means the *following* Monday. An
  explicit weekday is taken literally and is **never snapped** to a school
  day — if that Monday is a holiday, the date stands and validation (below)
  flags the combination with a school-anchored time. Someone who wants "the
  schedule-appropriate day around here" should use a week-boundary spec
  instead. `saturday` and `sunday` are allowed (fine with a `midnight`
  anchor, flagged with school anchors).

- **`week (edge, n)`** — let W be the ISO week (Mon–Sun) containing B, plus n
  weeks. `start`: the first school day on or after the Monday of W. `end`:
  the last school day on or before the Sunday of W. These are the loose,
  calendar-aware specs: "start of next week" is usually a Monday but
  sometimes a Tuesday; "end of week" is usually a Friday but sometimes a
  Thursday. If W contains no school days at all (e.g. February break),
  `start` advances into the following week — "the first day back" — with a
  validation warning; `end` is a load-time **error** (`resolveDay` throws).
  Walking backward would land at or before the base date (a due date earlier
  than the assignment it's attached to), and guessing forward silently moves
  the date a week or more later than the literal reading — the intent is
  ambiguous in both directions, so the author has to say what they meant.

Snapping (where it applies) never produces a date outside the loaded
calendars: if resolution runs past the last day, `resolveDay` throws a
`RangeError` rather than returning a fabricated date.

### Time resolution (`resolveTime`)

Resolution happens in the calendar's timezone; the offset is applied with
timezone-aware arithmetic (`ZonedDateTime.add`), so an offset that crosses a
DST transition does the right thing.

- **`midnight`** — 00:00 local on the date. Never null.

- **`start_of_day` / `end_of_day`** — start of the first / end of the last
  scheduled period on the date; null if the date is not a school day.

- **`start_of_period` / `end_of_period`** — requires the `period` argument;
  looks up the numbered period via the `periodNumber` matcher; null if the
  date has no such period (e.g. period 3 on an exam day running only periods
  1–2) or if `period` is omitted.

`resolveTime` returns null rather than guessing. bhs-cs's existing lenient
behavior — treating a missing period as midnight on the date so
assignment-loading queries don't blow up — stays in bhs-cs's wrapper code,
not in bells.

### Validation (`timeWarnings`)

Nonsensical specs should be caught at load time (when `bindTime` runs and a
human is watching) rather than silently resolving to null at query time.
`timeWarnings` checks a `BoundTime` against the calendar and returns a
warning for:

- a `start_of_period`, `end_of_period`, `start_of_day`, or `end_of_day`
  anchor on a date that is not a school day (e.g. `start_of_period monday`
  where that Monday is a holiday, or `+1 week` landing on one — neither
  explicit weekdays nor week offsets snap);

- a period anchor on a school day that has no numbered periods at all;

- a `start of week` spec whose target week contained no school days, so the
  date advanced into a following week. (The `end of week` analogue is a
  hard error at `resolveDay` time, not a warning.)

It cannot check whether a *specific* period meets on the date — the period
isn't bound yet — so e.g. "period 3 on an exam day running only periods 1–2"
still surfaces only as a null from `resolveTime`. `midnight` anchors are
never warned about: midnight on any date is well-defined.

## Testing notes

Tests should run against a small synthetic `YearData` fixture (not a real
school year) constructed to contain the interesting calendar shapes: a
Monday holiday, a full vacation week, a schedule variant where a period
doesn't meet (for `resolveTime` nulls), and non-numbered periods like
"Lunch". Cases worth covering beyond the obvious happy paths:

- `parseTime`/`formatTime` round-trip every grammar form, including
  defaults (omitted offset, omitted day-part) and parse errors.

- Each day-spec kind against the holiday Monday: `monday` stays put (and
  the bound time warns), `+1 week` landing there stays put (warns),
  `start of next week` snaps to Tuesday (no warning), school-day offsets
  count straight past it.

- The vacation week: `start of next week` advances to the first day back
  (with warning); `end of next week` throws.

- `resolveDay` past the end of the loaded calendars throws `RangeError`.

- An offset crossing a DST transition resolves via timezone-aware
  arithmetic.

- Unsigned offsets (`00:00`) accepted in `BoundTime`.

## Adoption sketch (bhs-cs side — context only, not part of the bells change)

How bhs-cs will use this once it ships, recorded here so the API can be
judged against its real consumer. None of this is work in the bells repo.

- bhs-cs's time module shrinks to a thin wrapper: its anchor table, period
  lookup, offset arithmetic, and period-number regex all delegate to bells.
  Its `abstractToZDT(date, offset, offsetPoint, period)` becomes
  `bells.resolveTime({ date, anchor: offsetPoint, offset }, period) ??
  midnight-on-date`, and its `currentOrNextPeriod` keeps a "default to
  period 1" quirk on top of `currentOrNextPeriodNumber`.

- The lesson-plan loader accepts a time as a string (fed to `parseTime`) or
  an object in `AbstractTime` shape, and calls `bells.bindTime(lessonDate,
  t)` so what flows into the database is the same `(date, offset,
  offset_point)` tuple as today. Relative days are fully resolved at load
  time; **no schema change**. The loader passes an `onWarning` that prints
  the warning with the lesson-plan file and time name, so calendar
  mismatches show up when the plan is loaded, not when a student's todo
  list renders.

## Resolved questions

- **Weekday specs are "strictly after" the base date** — "monday" in a
  Monday lesson plan means the following Monday.

- **Explicit weekdays never snap to a school day** — they are taken
  literally, and `saturday`/`sunday` are allowed. The loose, calendar-aware
  alternatives are the week-boundary specs (`start of [next] week`, `end of
  [next] week`). Validation warns when a literal day can't carry its anchor.

- **`bindTime` warns at load time when a spec doesn't make sense** — e.g. a
  period or start/end-of-day anchor on a non-school day — via `timeWarnings`,
  rather than leaving the problem to surface as a null at query time.

- **`±N weeks` doesn't snap either** — the original sketch had it advancing
  to the next school day, but the right direction is ambiguous (`+1 week`
  landing on a holiday Friday could mean Thursday or the following Monday),
  so it stays literal and warns like an explicit weekday. The only specs
  that adjust to the calendar are school-day offsets (by construction) and
  the week boundaries.

- **`end of week` on a week with no school days is a load-time error**, not
  a backward retreat. Walking backward yields a due date at or before the
  base date (e.g. a Friday-before-break lesson with `end_of_day end of next
  week` would come due the day it was assigned), and skipping forward
  guesses a week-plus later — `resolveDay` throws and the author fixes the
  spec. `start of week` on an empty week still advances to the first day
  back, with a warning.

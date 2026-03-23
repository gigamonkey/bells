# Library Plan

## Goal

Extract the schedule/calendar logic into a standalone npm package so it can be
used in other apps (e.g. a different frontend, a server-side API, a CLI). The
library loads calendar data provided by the user at runtime rather than bundling
it, so schedule updates don't require a library release.

---

## What Needs to Change in the Current Code

The main obstacles to extracting the library are:

1. **`localStorage` coupling** — `calendar.js` reads/writes `localStorage` at
   module load time. This must be removed; configuration is passed via the
   library constructor.

2. **Hardcoded period-name logic** — `Schedule.hasPeriod()` matches against the
   literal strings `'Period 0'`, `'Period 7'`, `'Period Ext'`. This should be
   generalized to a user-supplied predicate or a tag system in the data format.

3. **Temporal used only in `bells.js`** — The entire rest of the codebase uses
   `Date`. The library should use Temporal throughout (as the plan doc already
   calls out). The timezone kludge in `bells.js` (`now()`) becomes the library's
   responsibility and should be implemented cleanly with Temporal.

4. **Module-level mutable state** — `extraPeriods`, `otherData`, `isTeacher` are
   module globals. They become constructor parameters.

5. **No types** — The library should ship with TypeScript declarations (JSDoc is
   fine).

---

## Calendar Data File Format

The library accepts an array of year objects. The format is a documented
superset of the existing `calendars.json`:

```json
[
  {
    "year": "2025-2026",
    "timezone": "America/Los_Angeles",
    "firstDay": "2025-08-13",
    "firstDayTeachers": "2025-08-11",
    "lastDay": "2026-06-04",
    "schedules": {
      "default": {
        "NORMAL": [
          { "name": "Period 0",   "start": "7:26",  "end": "8:24",  "tags": ["optional", "zero"] },
          { "name": "Period 1",   "start": "8:30",  "end": "9:28" },
          { "name": "Period 2",   "start": "9:34",  "end": "10:37" },
          { "name": "Period 3",   "start": "10:43", "end": "11:41" },
          { "name": "Lunch",      "start": "11:41", "end": "12:21" },
          { "name": "Period 4",   "start": "12:27", "end": "1:25" },
          { "name": "Period 5",   "start": "1:31",  "end": "2:29" },
          { "name": "Period 6",   "start": "2:35",  "end": "3:33" },
          { "name": "Period 7",   "start": "3:39",  "end": "4:37",  "tags": ["optional", "seventh"] },
          { "name": "Period Ext", "start": "3:39",  "end": "5:09",  "tags": ["optional", "ext"] }
        ],
        "LATE_START": [ "..." ]
      },
      "2025-08-11": [ "..." ]
    },
    "holidays": ["2025-09-01", "2025-11-27"],
    "teacherWorkDays": ["2025-11-27"],
    "breakNames": {
      "2025-11-24": "Thanksgiving Break"
    }
  }
]
```

**Changes from current format:**
- `timezone` field is required per year.
- The `nonSchool` boolean is replaced by a `tags`-based system. A period tagged
  `"optional"` is excluded from the active schedule (and trimmed from day
  boundaries) unless one of its other tags appears in the caller's `includeTags`
  config. This covers two cases:
  - **User-configurable periods** (Period 0, 7, Ext): tagged `["optional", "zero"]`
    etc. — the user opts in by adding `"zero"` to `includeTags`.
  - **Always-excluded periods** (e.g. lunch after exam periods on special
    schedules): tagged `["optional"]` alone — no inclusion tag, so always
    excluded and always trimmed from the day boundary.
- Period times may be written without a leading 24-hour prefix. When an hour is
  ambiguous (0–12), the library resolves it using context: a period's `end` must
  be after its `start`, and each period in a schedule must start after the
  previous one ends. The algorithm walks the period list in order, tracking the
  last resolved time, and for each new time string picks the interpretation
  (AM or PM) that keeps the sequence monotonically increasing. Fully-qualified
  24-hour times (hour ≥ 13) are always unambiguous and need no inference.
  The validation tool reports an error if a time string is genuinely ambiguous
  even after applying context (e.g. two consecutive readings that are
  indistinguishable).

---

## Proposed Library API

### `Calendars` — loading per-year files

When calendar data is stored as one JSON file per academic year, use `Calendars`
to load and manage them. It is initialized with a directory path or a base URL
and fetches year files on demand.

```js
import { Calendars } from 'bells';

const calendars = new Calendars('./calendars/');
// or: new Calendars('https://example.com/calendars/');
```

Files are expected to be named `{year}.json` (e.g. `2025-2026.json`) under the
given path.

```js
// Get a BellSchedule for a specific academic year
const bells = await calendars.forYear('2025-2026', options);

// Get a BellSchedule appropriate for the current instant.
// During summer, loads both the just-ended and upcoming year files so that
// summer-bounds and next-year-start queries work correctly.
const bells = await calendars.current(options);
```

Both methods accept the same `options` object as `BellSchedule` directly
(`role`, `includeTags`). Omitting `options` entirely is equivalent to
`{ role: 'student' }` — the standard student schedule with no optional periods
included. `current()` returns a `BellSchedule` constructed from whichever
year(s) are needed; callers don't need to know whether it's summer.

---

### `BellSchedule` — direct construction

```js
import { BellSchedule } from 'bells';
import calendarData from './my-calendars.json' with { type: 'json' };

// Omitting options is equivalent to { role: 'student' } — standard student
// schedule with no optional periods included.
const bells = new BellSchedule(calendarData, {
  role: 'student',           // 'student' | 'teacher'  (default: 'student')
  // includeTags per day-of-week (1=Mon … 7=Sun). Omitted days include no optional periods.
  includeTags: {
    1: ['seventh'],
    2: ['zero', 'seventh'],
    3: ['seventh'],
    4: ['seventh'],
    5: ['seventh'],
  },
});
```

`includeTags` is a map from ISO day-of-week number to the set of optional period
tags to include on that day. A flat array is also accepted as a shorthand when
the same tags apply every day:

```js
includeTags: ['seventh']   // same tags Mon–Fri
```

### Core query methods

All methods accept an optional `Temporal.Instant` (defaults to `Temporal.Now.instant()`).

```ts
// What interval is happening right now?
bells.currentInterval(instant?): Interval | null
// null during summer when no calendar covers the instant.

// Convenience — is this instant inside a named period (not passing/break)?
bells.periodAt(instant?): Period | null

// Is this a school day?
bells.isSchoolDay(date?: Temporal.PlainDate): boolean

// Start/end of the current school day (null if not a school day)
bells.currentDayBounds(instant?): { start: Temporal.Instant; end: Temporal.Instant } | null

// Next/previous school day boundaries
bells.nextSchoolDayStart(instant?): Temporal.Instant
bells.previousSchoolDayEnd(instant?): Temporal.Instant

// Year-level queries
bells.schoolTimeLeft(instant?): Temporal.Duration
bells.schoolTimeDone(instant?): Temporal.Duration
bells.totalSchoolTime(instant?): Temporal.Duration   // for the current year
bells.nextYearStart(instant?): Temporal.Instant      // throws if calendar data absent

// School time between two instants (only counts time when school is in session)
bells.schoolTimeBetween(start: Temporal.Instant, end: Temporal.Instant): Temporal.Duration

// Days remaining
bells.schoolDaysLeft(instant?): number
bells.calendarDaysLeft(instant?): number

// Summer helpers (when outside a calendar year)
bells.summerBounds(instant?): { start: Temporal.Instant; end: Temporal.Instant } | null
```

### Return types

```ts
interface Interval {
  name: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
  type: 'period' | 'passing' | 'before-school' | 'after-school' | 'break';
  duringSchool: boolean;
  tags: string[];                               // from the period's tags in data
  left(now?: Temporal.Instant): Temporal.Duration;
  done(now?: Temporal.Instant): Temporal.Duration;
}

interface Period extends Interval {
  type: 'period';
}
```

### Validation tool

Exported as a named export and also as a CLI entry point (`bells-validate`):

```js
import { validateCalendarData } from 'bells/validate';
const result = validateCalendarData(data);
// result: { valid: boolean; errors: string[] }
```

CLI:
```sh
npx bells-validate calendars.json
```

Checks include (among others):
- Required fields are present (`timezone`, `firstDay`, `lastDay`, etc.)
- All dates appearing in `schedules` keys, `holidays`, `teacherWorkDays`, and
  `breakNames` keys fall within the range `firstDayTeachers` (or `firstDay` if
  absent) through `lastDay` for that year object.
- `firstDay` is not before `firstDayTeachers` (if both present).
- Period `start` and `end` times are valid and `start` < `end` for every period.
- No two non-optional periods on the same schedule overlap.

---

## Package structure

```
bells/
  src/
    index.js          # Public API — BellSchedule and Calendars classes
    calendars.js      # Calendars loader (directory/URL → per-year fetch)
    calendar.js       # Calendar + Schedule + Period + Interval (rewritten with Temporal)
    datetime.js       # Pure Temporal utilities
    validate.js       # Validation logic
  index.d.ts          # TypeScript declarations
  validate.d.ts
  package.json
  README.md
```

`package.json` shape:
```json
{
  "name": "bells",
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./validate": "./src/validate.js"
  },
  "peerDependencies": {
    "@js-temporal/polyfill": ">=0.4"
  }
}
```

The existing `bells.js`, `dom.js`, and `style.css` stay in this repo and are
not part of the library — they remain the BHS-specific web app layer.

---

## Migration notes for the web app

After extraction, `calendar.js` in this repo becomes a thin wrapper:

```js
import { BellSchedule } from 'bells';
import calendarData from './calendars.json' with { type: 'json' };

// Read config from localStorage as before, pass into constructor
const bells = new BellSchedule(calendarData, {
  role: isTeacher() ? 'teacher' : 'student',
  includeTags: buildIncludeTags(), // reads per-day config from localStorage
});

export { bells };
```

The `bells.js` update loop calls `bells.currentInterval()` etc. instead of the
current module-level functions.

---

## Open questions

- ~~**Package name**~~: Will be published as `bells`.

- ~~**Per-day optional periods**~~: `includeTags` is per-day-of-week as a first-class feature.

- **Temporal native vs. polyfill**: Node 22+ ships Temporal natively. The
  library can import from `temporal-polyfill` only if `Temporal` is not globally
  available, or just declare `@js-temporal/polyfill` as a peer dep and let
  callers handle it.

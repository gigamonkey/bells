# bells

A framework-agnostic JavaScript library for querying school bell schedules. Built on the [Temporal API](https://tc39.es/proposal-temporal/).

## Installation

```sh
npm install @peterseibel/bells @js-temporal/polyfill
```

The library is built on the [Temporal API](https://tc39.es/proposal-temporal/),
which it expects as a global (`globalThis.Temporal`) rather than importing it.
Supply it once, at startup, before using the library:

```js
import { Temporal } from '@js-temporal/polyfill';
globalThis.Temporal = Temporal;
```

`@js-temporal/polyfill` is a peer dependency. On a runtime that already provides
a native `Temporal` global, you can skip both the install and the assignment.

The library ships TypeScript declarations. Because it types `Temporal` against
`@js-temporal/polyfill`, having that peer dependency installed is enough for the
types to resolve — no `tsconfig` changes needed. (This handles typechecking; you
still need the runtime assignment above unless `Temporal` is already global.)

## Calendar data format

Calendar data is an array of year objects, one per academic year:

```json
[
  {
    "year": "2025-2026",
    "timezone": "America/Los_Angeles",
    "firstDay": "2025-08-13",
    "firstDayTeachers": "2025-08-11",
    "lastDay": "2026-06-04",
    "schedules": {
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
      "LATE_START": [
        { "name": "Staff meeting", "start": "8:03", "end": "9:33", "teachers": true },
        { "name": "Period 1",      "start": "10:00", "end": "10:43" }
      ]
    },
    "weekdaySchedules": {
      "monday": "LATE_START"
    },
    "dates": {
      "2025-08-13": [
        { "name": "Orientation", "start": "8:30", "end": "15:00" }
      ]
    },
    "holidays": ["2025-09-01", "2025-11-27"],
    "teacherWorkDays": ["2025-11-27"],
    "breakNames": {
      "2025-11-24": "Thanksgiving Break"
    }
  }
]
```

### Fields

- `year` — academic year label (e.g. `"2025-2026"`)
- `timezone` — IANA timezone identifier (e.g. `"America/Los_Angeles"`)
- `firstDay` — first student day (`"YYYY-MM-DD"`)
- `firstDayTeachers` — first teacher day, if different (optional)
- `lastDay` — last day of school (`"YYYY-MM-DD"`)
- `schedules` — map of schedule name to period list. `NORMAL` is required; any other names (e.g. `LATE_START`, `ASSEMBLY`) are user-defined.
- `weekdaySchedules` — optional map of lowercase weekday name (`monday`–`friday`) to a schedule name in `schedules`. Weekdays not listed fall back to `NORMAL`.
- `dates["YYYY-MM-DD"]` — schedule override for a specific date. The value is either a schedule name (string) from `schedules`, or an inline period array.
- `holidays` — array of holiday date strings
- `teacherWorkDays` — holiday dates that teachers still work
- `breakNames` — map of date string to break name (used in `"Break!"` interval labels)

### Time strings

Times may omit the leading 24-hour prefix for PM hours. `"1:25"` is resolved to 13:25 by context (each time must be after the previous one in the sequence). Times with hour ≥ 13 are unambiguous.

### Tags

Periods may have a `tags` array:

- A period with no `"optional"` tag is always included.
- A period tagged `"optional"` is included only if one of its other tags appears in the caller's `includeTags` config for that day.
- A period tagged `["optional"]` alone is never included (always trimmed from day boundaries).

The `teachers` boolean field marks teacher-only periods that are excluded for students.

## API

### `BellSchedule`

```js
import { BellSchedule } from '@peterseibel/bells';
import calendarData from './my-calendars.json' with { type: 'json' };

const bells = new BellSchedule(calendarData, {
  role: 'student',        // 'student' | 'teacher'  (default: 'student')
  includeTags: {
    1: ['seventh'],       // Monday: include Period 7
    2: ['zero', 'seventh'],
    3: ['seventh'],
    4: ['seventh'],
    5: ['seventh'],
  },
  // Or use a flat array for the same tags every weekday:
  // includeTags: ['seventh']

  // Which periods are "numbered" and what number they carry, for the
  // abstract-time API. Default: match /^Period (\d+)\b/ in the name.
  // periodNumber: (period) => ...number or null...
});

// What's happening right now?
const interval = bells.currentInterval();
console.log(interval.name);       // e.g. "Period 3"
console.log(interval.type);       // 'period' | 'passing' | 'before-school' | 'after-school' | 'break'
console.log(interval.left());     // Temporal.Duration until end of interval

// Other queries (all accept optional Temporal.Instant):
bells.periodAt()                  // Period | null (null if passing/break)
bells.isSchoolDay()               // boolean (accepts optional Temporal.PlainDate)
bells.currentDayBounds()          // { start, end } | null
bells.nextSchoolDayStart()        // Temporal.Instant
bells.previousSchoolDayEnd()      // Temporal.Instant
bells.schoolTimeLeft()            // Temporal.Duration
bells.schoolTimeDone()            // Temporal.Duration
bells.totalSchoolTime()           // Temporal.Duration
bells.schoolDaysLeft()            // number
bells.calendarDaysLeft()          // number
bells.nextYearStart()             // Temporal.Instant (throws if not loaded)
bells.schoolTimeBetween(a, b)     // Temporal.Duration
bells.summerBounds()              // { start, end } | null
```

### Abstract times

An *abstract time* describes a moment relative to the schedule — "five minutes
before the end of the period", "start of school next Monday" — rather than as
a wall-clock time. It has three independent parts: a *day spec* (which date,
possibly relative to a base date), a *time anchor* (a schedule-defined point
in that day: `start_of_period`, `end_of_period`, `start_of_day`, `end_of_day`,
or `midnight`), and a signed `HH:MM` offset.

Resolution happens in two phases, so the period can stay unbound until query
time (a stored "start of period" resolves differently for a period-2 class
than a period-5 class):

```js
import { parseTime, formatTime } from '@peterseibel/bells';

// Standalone — no calendar needed:
const t = parseTime('end_of_period -00:05 +1 day');
formatTime(t);                    // canonical round-trip

// Phase 1 (load time): bind the day spec against a base date. Warnings for
// specs that don't make sense against the calendar (e.g. a school anchor on
// a holiday) are reported via the callback (default: console.warn).
const bound = bells.bindTime(baseDate, t, (warning) => console.warn(warning));
// → { date: '2026-01-06', anchor: 'end_of_period', offset: '-00:05' }

// Phase 2 (query time): resolve to a concrete time, supplying the period if
// the anchor needs one. Null when the date has no schedule or no such period.
bells.resolveTime(bound, 3);      // Temporal.ZonedDateTime | null

// Pieces of the above, usable directly:
bells.resolveDay(baseDate, t.day);       // Temporal.PlainDate
bells.timeWarnings(bound);               // string[] (empty = OK)
bells.addSchoolDays(date, 3);            // n school days out (n may be negative)
bells.periodOnDate(date, 3);             // ScheduledPeriod | null
bells.currentOrNextPeriodNumber();       // number | null
```

The string syntax is `anchor [time-offset] [day-part]`, whitespace-separated
and case-insensitive:

| String                    | Meaning                                              |
| ------------------------- | ---------------------------------------------------- |
| `start_of_period`         | start of the (later-bound) period on the base date   |
| `end_of_period -00:05`    | five minutes before the end of the period            |
| `end_of_day +1 day`       | end of school on the next school day                 |
| `start_of_period monday`  | start of the period on the next Monday               |
| `start_of_day next week`  | start of school on the first school day of next week |
| `end_of_day end of week`  | end of school on the last school day of this week    |
| `midnight +1 week`        | midnight exactly one calendar week out               |
| `start_of_day 2026-01-05` | start of school on an absolute date                  |

Day-part semantics: `±N day(s)` counts *school* days; `±N week(s)` is literal
calendar arithmetic (no snapping); a weekday name means the first such day
strictly after the base date, taken literally even if it's a holiday; the week
boundaries (`start of [next] week`, `end of [next] week`) are the loose,
calendar-aware forms that snap to the first/last school day of the ISO week.
`start of week` on a week with no school days advances to the first day back
(with a warning); `end of week` on such a week throws. Resolution that runs
past the loaded calendars throws a `RangeError`.

### `Calendars`

For loading per-year JSON files from a directory or URL:

```js
import { Calendars } from '@peterseibel/bells/calendars';

const calendars = new Calendars('./calendars/');
// or: new Calendars('https://example.com/calendars/');

// Load a specific year:
const bells = await calendars.forYear('2025-2026', options);

// Load whatever is appropriate for right now (handles summer automatically):
const bells = await calendars.current(options);
```

Files must be named `{year}.json` (e.g. `2025-2026.json`). In Node.js, paths are read with `fs.readFile`. Under a URL base, `fetch()` is used.

### Validation

```js
import { validateCalendarData } from '@peterseibel/bells/validate';

const { valid, errors } = validateCalendarData(data);
if (!valid) {
  console.error(errors);
}
```

CLI:

```sh
npx bells-validate calendars.json
```

Checks include required fields, valid timezone, date range consistency, unambiguous time strings, `start < end` for every period, and no overlapping non-optional periods.

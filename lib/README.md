# bells

A framework-agnostic JavaScript library for querying school bell schedules. Built on the [Temporal API](https://tc39.es/proposal-temporal/).

## Installation

```sh
npm install bells @js-temporal/polyfill
```

`@js-temporal/polyfill` is a peer dependency. In Node 22+ you can use the native Temporal global and omit the polyfill.

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
import { BellSchedule } from 'bells';
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

### `Calendars`

For loading per-year JSON files from a directory or URL:

```js
import { Calendars } from 'bells';

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
import { validateCalendarData } from 'bells/validate';

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

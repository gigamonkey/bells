# bells (Python)

A framework-agnostic Python library for querying school bell schedules. This is
a port of the [`@peterseibel/bells`](https://github.com/gigamonkey/bells/tree/main/libs/ts) JavaScript library, kept
behaviorally identical to it.

Where the JS library is built on the [Temporal API](https://tc39.es/proposal-temporal/),
this port uses only the Python standard library:

| Temporal                | Python                                     |
| ----------------------- | ------------------------------------------ |
| `Temporal.PlainDate`    | `datetime.date`                            |
| `Temporal.PlainTime`    | `datetime.time`                            |
| `Temporal.Instant`      | timezone-aware `datetime.datetime` in UTC  |
| `Temporal.Duration`     | `datetime.timedelta`                       |
| `Temporal.PlainDateTime`| naive `datetime.datetime`                  |

An "instant" throughout the package is an aware `datetime` normalized to UTC.

Requires Python 3.9+ (uses `zoneinfo`). No third-party dependencies.

## Calendar data format

The calendar data format is identical to the JS library — see [`libs/ts/README.md`](https://github.com/gigamonkey/bells/blob/main/libs/ts/README.md)
for the full field reference. Briefly, calendar data is a list of year objects:

```json
[
  {
    "year": "2025-2026",
    "id": "bhs",
    "name": "Berkeley High School",
    "timezone": "America/Los_Angeles",
    "firstDay": "2025-08-13",
    "firstDayTeachers": "2025-08-11",
    "lastDay": "2026-06-04",
    "schedules": {
      "NORMAL": [
        { "name": "Period 1", "start": "8:30", "end": "9:28" },
        { "name": "Period 2", "start": "9:34", "end": "10:37" }
      ]
    },
    "weekdaySchedules": { "monday": "LATE_START" },
    "holidays": ["2025-09-01"]
  }
]
```

## API

The public API mirrors the JS one, with method names converted to
`snake_case` and options passed as a dict with snake_case keys (`role`,
`include_tags`).

```python
import json
from bells import BellSchedule

with open("my-calendars.json") as f:
    data = json.load(f)

bells = BellSchedule(data, {
    "role": "student",          # "student" | "teacher"  (default: "student")
    "include_tags": {
        1: ["seventh"],         # Monday: include Period 7
        2: ["zero", "seventh"],
    },
    # Or a flat list for the same tags every weekday:
    # "include_tags": ["seventh"],

    # Which periods are "numbered" and what number they carry, for the
    # abstract-time API. Default: match r"^Period (\d+)\b" in the name.
    # "period_number": lambda period: ...int or None...,
})

# What's happening right now?
interval = bells.current_interval()
print(interval.name)        # e.g. "Period 3"
print(interval.type)        # 'period' | 'passing' | 'before-school' | 'after-school' | 'break'
print(interval.left())      # timedelta until end of interval

# Other queries (all accept an optional aware datetime instant):
bells.period_at()                 # Interval | None (None unless a period)
bells.is_school_day()             # bool (accepts an optional date)
bells.current_day_bounds()        # {"start": ..., "end": ...} | None
bells.next_school_day_start()     # datetime
bells.previous_school_day_end()   # datetime
bells.school_time_left()          # timedelta
bells.school_time_done()          # timedelta
bells.total_school_time()         # timedelta
bells.school_days_left()          # int
bells.calendar_days_left()        # int
bells.next_year_start()           # datetime (raises if not loaded)
bells.school_time_between(a, b)   # timedelta
bells.summer_bounds()             # {"start": ..., "end": ...} | None
```

### Debugging with a simulated time

Every method that defaults to "now" (`current_interval()`, `period_at()`,
`school_days_left()`, `Calendars.current()`, `Interval.left()`, …) reads the
library's clock. You can point that clock at a simulated moment so you can
debug your app as if it were another time, without threading an instant into
every call:

```python
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from bells import set_debug_time, set_debug_offset, clear_debug_time, get_debug_offset

# Pretend it's 8:45am on a school morning. Time keeps ticking forward from here.
# set_debug_time takes a timezone-aware datetime.
set_debug_time(datetime(2025, 8, 19, 8, 45, tzinfo=ZoneInfo("America/Los_Angeles")))
bells.current_interval()          # resolves as if now were that instant → "Period 1"

# Or shift by a fixed delta instead of an absolute time:
set_debug_offset(timedelta(hours=-3))

get_debug_offset()                # timedelta | None (None = real clock)
clear_debug_time()                # back to the real system clock
```

The offset is **process-global** — it affects every time-defaulting method in
the library — and passing an explicit instant to a method still overrides it.
It's a debugging affordance, not something to rely on in a concurrent
multi-tenant server.

### School weeks & annotations

A calendar year may carry an optional `annotations` field — generic extra
information (an AP-testing date range, grading-period closes keyed by
school-week number, ad-hoc dates) that doesn't change the schedule. See the
[TypeScript README](../ts/README.md#annotations) for the data format; it is
identical across ports. The query API (snake_case here):

```python
# School-week numbering (Monday-anchored ISO weeks with >=1 school day,
# numbered 1..n; role-aware — bind role="student" for grading numbering):
bells.school_weeks()              # list[SchoolWeek dict] in chronological order
bells.school_week_count()         # int
bells.school_week(9)              # SchoolWeek dict | None (by 1-based number)
bells.week_for_date(d)            # SchoolWeek dict | None

# Resolved annotation accessors (raw keys -> real dates / school weeks):
bells.range_annotations()         # [{"id", "start", "end", "label"?, "kind"?, ...}]
bells.week_annotations()          # [{"week", "school_week", "label"?, "kind"?, ...}]
bells.date_annotations()          # [{"date", "label"?, "kind"?, ...}]
bells.annotations()               # the raw, unvalidated annotations dict

# Unified helpers (each entry tagged with "source": "range"|"week"|"date"):
bells.annotations_on(d)           # everything active on date d
bells.annotations_for_week(9)     # everything touching school week 9
```

A `SchoolWeek` is a dict `{"number", "monday", "first_school_day",
"last_school_day", "school_day_count"}`.

### Abstract times

An *abstract time* describes a moment relative to the schedule — "five minutes
before the end of the period", "start of school next Monday" — rather than as a
wall-clock time. It has three independent parts: a *day spec* (which date,
possibly relative to a base date), a *time anchor* (a schedule-defined point in
that day: `start_of_period`, `end_of_period`, `start_of_day`, `end_of_day`, or
`midnight`), and a signed `HH:MM` offset.

Resolution happens in two phases, so the period can stay unbound until query
time (a stored "start of period" resolves differently for a period-2 class than
a period-5 class). The types are plain dicts; `parse_time`/`format_time` need no
calendar.

```python
from bells import parse_time, format_time

# Standalone — no calendar needed:
t = parse_time("end_of_period -00:05 +1 day")
format_time(t)                     # canonical round-trip

# Phase 1 (load time): bind the day spec against a base date. Warnings for
# specs that don't make sense against the calendar (e.g. a school anchor on a
# holiday) are reported via the callback (default: print to stderr).
bound = bells.bind_time(base_date, t, lambda warning: print(warning))
# → {"date": "2026-01-06", "anchor": "end_of_period", "offset": "-00:05"}

# Phase 2 (query time): resolve to a concrete moment (an aware datetime in the
# schedule's timezone), supplying the period if the anchor needs one. None when
# the date has no schedule or no such period.
bells.resolve_time(bound, 3)       # datetime | None

# Pieces of the above, usable directly:
bells.resolve_day(base_date, t.get("day"))   # date
bells.time_warnings(bound)                    # list[str] (empty = OK)
bells.add_school_days(d, 3)                    # n school days out (n may be negative)
bells.period_on_date(d, 3)                     # period dict | None
bells.current_or_next_period_number()          # int | None
```

The string syntax is `anchor [time-offset] [day-part]`, whitespace-separated
and case-insensitive (e.g. `end_of_period -00:05`, `start_of_day next week`,
`end_of_day +1 day`, `midnight +1 week`, `start_of_day 2026-01-05`). Day-part
semantics: `±N day(s)` counts *school* days; `±N week(s)` is literal calendar
arithmetic (no snapping); a weekday name means the first such day strictly after
the base date, taken literally even if it's a holiday; the week boundaries
(`start of [next] week`, `end of [next] week`) snap to the first/last school day
of the ISO week. `start of week` on a week with no school days advances to the
first day back (with a warning); `end of week` on such a week raises. Resolution
that runs past the loaded calendars raises an `IndexError`.

### `Calendars`

For loading per-year JSON files from a directory or URL:

```python
from bells import Calendars

calendars = Calendars("./calendars/")        # or "https://example.com/calendars/"

bells = calendars.for_year("2025-2026", options)
bells = calendars.current(options)            # handles summer automatically
```

Files must be named `{year}.json` (e.g. `2025-2026.json`). Local paths are read
from disk; URL bases are fetched with `urllib`.

### `bhs-calendars` (bundled BHS data)

As an alternative to supplying your own `{year}.json` files, the companion
`bhs-calendars` package ships ready-to-use calendar data for Berkeley High and
nearby middle schools. `by_id()` groups the bundled years by school (each
group's years sorted chronologically); hand one group straight to
`BellSchedule`:

```python
from bhs_calendars import by_id, load_all
from bells import BellSchedule

years = by_id()["bhs"]                 # one school's years, oldest first
bells = BellSchedule(years, options)

all_years = load_all()                 # or the flat list of every school-year
```

Install it alongside the library (`pip install bhs-calendars`). Unlike
`Calendars`, the data is bundled with the package — no filesystem layout or
network access — but it only covers the BHS-area schools. Equivalent data
packages exist for the [TypeScript](https://github.com/gigamonkey/bells/tree/main/libs/ts) (`@peterseibel/bhs-calendars` on npm)
and [Java](https://github.com/gigamonkey/bells/tree/main/libs/java) (`com.gigamonkeys:bhs-calendars`) ports.

### Validation

```python
from bells import validate_calendar_data

result = validate_calendar_data(data)
if not result["valid"]:
    print(result["errors"])
```

CLI:

```sh
bells-validate calendars.json          # after `pip install .`
python -m bells.cli calendars.json     # without installing
```

## Tests

```sh
cd libs/python
python -m pytest
```

The test suite is a port of the JS test suite. A behavioral cross-check against
the JS library on the real BHS calendars produces identical results.

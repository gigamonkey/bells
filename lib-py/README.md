# bells (Python)

A framework-agnostic Python library for querying school bell schedules. This is
a port of the [`@peterseibel/bells`](../lib) JavaScript library, kept
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

The calendar data format is identical to the JS library — see [`../lib/README.md`](../lib/README.md)
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
cd lib-py
python -m pytest
```

The test suite is a port of the JS test suite. A behavioral cross-check against
the JS library on the real BHS calendars produces identical results.

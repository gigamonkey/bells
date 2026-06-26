# bhs-calendars (Python)

Bundled bell-schedule calendar data for Berkeley High School and nearby middle
schools, as a Python distribution. This is the Python counterpart of the npm
[`@peterseibel/bhs-calendars`](https://github.com/gigamonkey/bells/tree/main/bhs-calendars) package and ships the same
per-year JSON.

It is data, not logic — pair it with the [`bells`](https://github.com/gigamonkey/bells/tree/main/libs/python) library to build
schedules without supplying your own `{year}.json` files.

```sh
pip install bhs-calendars
```

## Usage

```python
from bhs_calendars import by_id, load_all
from bells import BellSchedule

# Grouped by school, each school's years sorted chronologically:
years = by_id()["bhs"]
schedule = BellSchedule(years, {})

# Or the flat list of every bundled school-year:
all_years = load_all()   # list[dict]
```

`load_all()` mirrors the npm package's default export (a flat list of yearly
calendar objects). `by_id()` groups those by their `id` field — `"bhs"`,
`"king-6"`, `"king-7"`, `"king-8"`, `"longfellow-6"`, `"longfellow-78"`,
`"willard-6"`, `"willard-78"` — with each group's years sorted by `firstDay`.

Unlike the library's `Calendars` loader (which reads `{year}.json` from a
directory or URL), this data is bundled on disk with the package: no filesystem
layout or network access required. The trade-off is that it only covers the
BHS-area schools.

## Data source

The JSON under `bhs_calendars/data/` is copied verbatim from the canonical
`bhs-calendars/` directory at the repository root (the npm package source). Run
`make sync-calendars` from the repo root to refresh it after the source data
changes.

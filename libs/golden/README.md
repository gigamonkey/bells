# Golden Tests

Language-neutral fixtures that pin the shared semantics of the three ports of
the bells library (`libs/ts`, `libs/python`, `libs/java`). Each port has a
thin "golden runner" in its regular test suite that loads every case file,
executes the queries against its own `BellSchedule`, serializes the results
to the canonical JSON form described below, and compares them against the
committed expected files. A behavioral divergence in any port fails that
port's normal test run.

## Layout

- `calendars/` — snapshot copies of calendar data used by the cases. These
  are deliberately **not** synced with the live `bhs-calendars/` data at the
  repo root: goldens pin semantics, not current data. Do not "helpfully"
  update them; doing so changes the expected outputs for no reason.

- `cases/` — one JSON file per scenario: which calendars to load, the
  `BellSchedule` options, and a list of queries.

- `expected/` — one JSON file per case (same basename) mapping query id to
  canonical expected result. **Generated** by the TypeScript reference
  implementation; see Regeneration below.

## Case file format

```json
{
  "description": "What this case covers",
  "calendars": ["bhs-2025-2026.json"],
  "options": { "role": "student", "includeTags": ["seventh"] },
  "queries": [
    { "id": "p1", "method": "currentInterval",
      "args": { "instant": "2025-08-26T16:00:00Z" } }
  ]
}
```

- `calendars` — files from `calendars/`, loaded in order. A file may contain
  a single year object or an array of them; the runner flattens to one list
  and passes it to the `BellSchedule` constructor.

- `options.role` — `"student"` (default) or `"teacher"`.

- `options.includeTags` — a flat list of tags or a map from ISO weekday
  (`"1"` = Monday … `"5"` = Friday, JSON keys are strings) to tag lists.
  Runners convert to their library's native form (Python `include_tags`
  keyed by `int`, Java `Options.of`/`ofFlat`).

- `queries[].method` — the TypeScript camelCase name. The Python runner maps
  to snake_case via an explicit dispatch table. Adding a method to the
  protocol means updating all three dispatch tables — deliberately.

- `queries[].args` — argument values by parameter name. Instants are ISO
  8601 UTC strings (`"2025-08-26T16:00:00Z"`), dates are `"YYYY-MM-DD"`.
  Which is which is fixed per method (see the dispatch tables); e.g.
  `schoolTimeBetween` takes two instants, `schoolDaysBetween` two dates.

Queries must be deterministic: every method call passes explicit
instants/dates, never "now". Methods that would throw for the given inputs
(e.g. `nextYearStart` with no later calendar loaded) must not appear in a
case.

## Methods in the protocol

`timezone` (property), `currentInterval`, `periodAt`, `isSchoolDay` (explicit
date only), `currentDayBounds`, `nextSchoolDayStart`, `previousSchoolDayEnd`,
`schoolTimeLeft`, `schoolTimeDone`, `totalSchoolTime`, `schoolTimeBetween`,
`schoolDaysBetween`, `schoolDaysLeft`, `calendarDaysLeft`, `nextYearStart`,
`currentYearStart`, `currentYearEnd`, `summerBounds`, `nextSchoolDay`,
`previousSchoolDay`, `scheduleNameFor`, `scheduleFor`, `periodsForDate`,
`nonClassDaysLeft`, `nonClassLabel`.

Excluded by design: the zero-argument "now" overloads and
`Calendars.current()` (clock-dependent, and the ports' zone-defaulting APIs
intentionally differ).

## Canonical serialization

- **Instant** → `"YYYY-MM-DDTHH:MM:SSZ"` — UTC, always exactly seconds
  precision, always the `Z` suffix. (TS:
  `instant.toString({ smallestUnit: 'second' })`; Python:
  `dt.astimezone(UTC).strftime(...)`; Java: explicit
  `uuuu-MM-dd'T'HH:mm:ss'Z'` formatter — do not rely on each library's
  default `toString`, which differ on fractional seconds.)

- **Date** → `"YYYY-MM-DD"`.

- **Duration** → integer seconds. (Schedule times are minute-granularity, so
  this is lossless.)

- **Interval** → `{ "name", "type", "start", "end", "duringSchool", "tags" }`
  with `type` as the lowercase hyphenated string (`"before-school"`, …).
  The derived `left()`/`done()` accessors are not serialized.

- **DayBounds / SummerBounds** → `{ "start": instant|null, "end":
  instant|null }`.

- **ScheduledPeriod / PeriodInstant** (from `scheduleFor`/`periodsForDate`)
  → `{ "name", "start", "end", "tags" }`.

- **NonClassDay** → `{ "date", "label" }`.

- **No result** (`null`/`None`/Java `null`) → JSON `null`.

## Regeneration

The TypeScript port is the reference implementation. To regenerate the
expected files after an intentional behavior change:

```bash
cd libs/ts && npm run golden:generate
```

Then review the diff in `expected/` — it is the semantic change, and the PR
must explain it. The flow for an intentional change is: change TS, regenerate
and review, then update Python and Java until their golden runs pass again.

A diff in `expected/` that you did not intend means you changed behavior.

## Running

Each port's normal test command includes its golden runner:

```bash
cd libs/ts && npm test
cd libs/python && python -m pytest
cd libs/java && mvn test
```

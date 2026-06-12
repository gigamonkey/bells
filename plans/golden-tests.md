# Golden Tests for Cross-Implementation Compatibility

## Goal

The three ports of the bells library — `libs/ts` (TypeScript, the reference
implementation), `libs/python`, and `libs/java` — are supposed to be
semantically identical. Today that parity is maintained by hand: each port has
its own ~33-test suite with mirrored fixtures, and nothing mechanically checks
that the three produce the same answers. This plan adds **golden tests**: a
shared, language-neutral set of (input, expected output) fixtures that all
three implementations load and assert against. A behavioral divergence in any
port then fails that port's normal test run.

## Approach

Committed golden files, asserted independently by each port:

1. A shared directory `libs/golden/` holds case files (calendar data + options
   + a list of queries) and expected-output files, all plain JSON with a
   canonical serialization for dates, instants, durations, and intervals.

2. Each port gets a thin **golden runner** inside its existing test suite
   (`node --test` / pytest / JUnit) that reads every case, executes the
   queries against its own `BellSchedule`, serializes the results to the
   canonical JSON form, and compares against the expected file.

3. A **generator script** in the TypeScript port (the reference
   implementation) produces the expected files. Regeneration is an explicit,
   reviewed step — a diff in `libs/golden/expected/` is a semantic change.

Why this over a "run all three and diff" orchestrator: each port's golden
tests run with that port's normal test command and toolchain (no need for
node + python + maven in one environment), failures show up where developers
already look, and the committed expected files give reviewable diffs when
behavior intentionally changes.

All queries take **explicit instants/dates** — nothing depends on the clock at
test time, so results are fully deterministic. `Calendars.current()` and the
zero-arg "now" overloads are deliberately out of scope (they are also where
the ports' APIs differ; see plans/done/library-parity.md §1.2 if context is
needed, but verify against current code).

## Directory Layout

```
libs/golden/
  README.md              # format spec, regeneration instructions
  calendars/             # snapshot copies of calendar data used by cases
    bhs-2025-2026.json
    bhs-2026-2027.json
    synthetic.json       # the existing shared test fixture, extracted to JSON
  cases/
    basic-school-day.json
    holidays-and-breaks.json
    late-start.json
    optional-periods.json
    teacher-role.json
    year-boundaries.json
    dst-transitions.json
    multi-year.json
  expected/
    basic-school-day.json  # one expected file per case, same basename
    ...
```

Calendar data is **copied** into `libs/golden/calendars/`, not referenced from
the repo-root `bhs-calendars/` directory. This keeps the golden corpus
hermetic: a correction to the live calendar data doesn't silently invalidate
goldens, and the libs remain self-contained. `synthetic.json` is the
CALENDAR_DATA fixture currently duplicated in all three test suites
(`libs/ts/test/bell-schedule.test.ts`, `libs/python/tests/conftest.py` /
`test_calendar.py`, `libs/java/.../Fixtures.java`), extracted once to JSON.

## Case File Format

```json
{
  "description": "Queries across a normal school day, fall 2025",
  "calendars": ["bhs-2025-2026.json", "bhs-2026-2027.json"],
  "options": { "role": "student", "includeTags": ["seventh"] },
  "queries": [
    { "id": "before-school", "method": "currentInterval",
      "args": { "instant": "2025-08-25T14:00:00Z" } },
    { "id": "days-between", "method": "schoolDaysBetween",
      "args": { "start": "2025-08-13", "end": "2025-09-15" } }
  ]
}
```

Notes on the format:

- `calendars` lists files from `libs/golden/calendars/`, loaded in order and
  passed as the calendar-data array to the `BellSchedule` constructor (TS/
  Python) or `new BellSchedule(List<CalendarData>, Options)` (Java).

- `options` uses the TS field names (`role`, `includeTags`); `includeTags`
  may be a flat list or a weekday-keyed map, matching what all three ports
  accept. The Python runner maps to `include_tags`; the Java runner builds
  `Options.ofFlat(...)` / `Options.of(...)`.

- `method` names use the TS camelCase form; the Python runner maps to
  snake_case. Each runner holds a small dispatch table — do not use
  reflection-by-name in Python (method names differ) and keep the table
  explicit so adding a method to the protocol is a deliberate act in all
  three runners.

- `args` values are typed by the method's signature: instants are ISO 8601
  UTC strings, dates are `YYYY-MM-DD` strings. Runners convert to
  `Temporal.Instant` / aware `datetime` in UTC / `java.time.Instant` and
  `Temporal.PlainDate` / `date` / `LocalDate` respectively.

The expected file maps query id to canonical result:

```json
{
  "before-school": {
    "name": "Before school",
    "type": "before-school",
    "start": "2025-08-25T12:00:00Z",
    "end": "2025-08-25T15:30:00Z",
    "duringSchool": false,
    "tags": []
  },
  "days-between": 22
}
```

## Canonical Serialization

Each runner implements one small serializer (≈50 lines) from its native types
to this form:

- **Instant** → ISO 8601 UTC string with `Z` and no sub-second digits when
  zero: `"2025-08-13T15:30:00Z"`. (TS: `instant.toString()` then normalize;
  Python: `dt.astimezone(timezone.utc).isoformat()` normalized; Java:
  `DateTimeFormatter.ISO_INSTANT` normalized. Write one shared normalization
  rule in `libs/golden/README.md` and test it — sub-second/offset formatting
  is the most likely source of false diffs.)

- **Date** → `"YYYY-MM-DD"`.

- **Duration** → integer **seconds**. Schedule times are minute-granularity
  so this is lossless, and it sidesteps ISO-8601 duration formatting
  differences between Temporal, timedelta, and java.time.

- **Interval** → `{ "name", "type", "start", "end", "duringSchool", "tags" }`.
  All three ports carry these six fields (TS `class Interval` in
  `libs/ts/src/calendar.ts:544` includes `duringSchool`; Java's `IntervalType`
  enum serializes to the lowercase hyphenated TS string, e.g. `BEFORE_SCHOOL`
  → `"before-school"`). The derived `left()`/`done()` methods are not
  serialized — they are covered indirectly by `start`/`end`.

- **DayBounds / SummerBounds** → `{ "start": <instant|null>, "end":
  <instant|null> }`.

- **ScheduledPeriod** (from `periodsForDate`) → `{ "name", "start", "end",
  "tags" }`.

- **NonClassDay** → `{ "date", "label" }`.

- **Absent / no result** → JSON `null`.

## Query Protocol (methods covered)

The intersection of the three ports' public surfaces, every method taking
explicit time arguments. Verified present in TS (`bell-schedule.ts`) and
Python (`bell_schedule.py`); confirm each against Java's `BellSchedule.java`
while implementing and drop or note any gaps:

- `currentInterval(instant)`, `periodAt(instant)`

- `isSchoolDay(date)` (with explicit date only)

- `currentDayBounds(instant)`, `summerBounds(instant)`

- `nextSchoolDayStart(instant)`, `previousSchoolDayEnd(instant)`

- `schoolTimeLeft(instant)`, `schoolTimeDone(instant)`,
  `totalSchoolTime(instant)`, `schoolTimeBetween(start, end)`

- `schoolDaysLeft(instant)`, `calendarDaysLeft(instant)`,
  `schoolDaysBetween(startDate, endDate)`

- `nextYearStart(instant)`

- `nextSchoolDay(date)`, `previousSchoolDay(date)`

- `periodsForDate(instant)`

- `nonClassDaysLeft(instant)`, `nonClassLabel(date)`

- `timezone` (property; one query per case is enough)

If a method exists in only one or two ports (e.g. Python's
`current_year_start`/`current_year_end`, `schedule_name_for`,
`schedule_for`), either port it to the others first or leave it out of the
protocol with a note in `libs/golden/README.md` — the golden corpus should
only encode the agreed-common surface.

## Case Corpus

Aim for ~8 case files, each with 15–40 queries. Moments worth pinning
(express all instants in UTC, derived from America/Los_Angeles wall times):

- **basic-school-day**: before school, during each period type, passing
  period, lunch, last 10 minutes of a period, after school, plus the
  bounds/time-left family at several points through one normal day.

- **holidays-and-breaks**: a holiday, a weekend, Thanksgiving week,
  `nonClassLabel` on labeled and unlabeled days, `nextSchoolDay` /
  `previousSchoolDayEnd` across a break.

- **late-start**: Monday late-start schedule vs other weekdays;
  `weekdaySchedules` resolution.

- **optional-periods**: same instants with no `includeTags`, a flat list
  (`["zero"]`, `["seventh", "ext"]`), and a weekday-keyed map — the area
  where the Options shapes differ most across ports.

- **teacher-role**: `role: "teacher"` — teacher work days, `firstDayTeachers`,
  teacher-only periods.

- **year-boundaries**: first day of school, last day, the summer between two
  loaded years (`summerBounds`, `nextYearStart`, `schoolDaysLeft` ≈ 0),
  instants before the first loaded year and after the last (null/edge
  handling).

- **dst-transitions**: instants straddling the fall-back (2025-11-02) and
  spring-forward (2026-03-08) transitions — schedule times are wall-clock,
  so the UTC offsets of period boundaries shift; this is where the three
  time libraries are most likely to disagree.

- **multi-year**: both BHS years loaded; `schoolTimeBetween` and
  `schoolDaysBetween` spanning the year gap; queries during the summer
  resolving against the following year.

## Implementation Steps

1. **Create `libs/golden/`** with `README.md` (format spec, serialization
   rules, regeneration instructions), the calendar snapshots, and the case
   files (queries only, no expected outputs yet).

2. **TS: serializer + generator + runner.**

   - `libs/ts/test/golden/serialize.ts` — canonical serializer.

   - `libs/ts/scripts/generate-golden.ts` — loads every case, runs queries,
     writes `libs/golden/expected/<case>.json` (stable key order, 2-space
     indent, trailing newline so regeneration diffs are clean). Wire as
     `npm run golden:generate`.

   - `libs/ts/test/golden.test.ts` — one `node --test` subtest per query so
     failures name the case and query id. Runs with the existing `npm test`.

3. **Hand-verify the generated expected files.** The generator makes the TS
   implementation the source of truth, so spot-check a meaningful sample
   (one query per category per case) against the published BHS schedule
   before committing. This review is what makes the files "golden" rather
   than just snapshots of whatever TS does.

4. **Python runner.** `libs/python/tests/test_golden.py` — pytest
   parameterized over (case, query). Includes the camelCase→snake_case
   dispatch table and a serializer mirroring step 2. Runs with the existing
   `pytest`.

5. **Java runner.** `libs/java/src/test/java/com/gigamonkeys/bells/GoldenTest.java`
   — JUnit 5 `@TestFactory` producing one dynamic test per query. Locate
   `libs/golden/` relative to the Maven basedir (e.g. resolve
   `../golden` from `${project.basedir}` via a system property set in
   `pom.xml`, with a sensible fallback for IDE runs). Runs with `mvn test`.

6. **Fix or document divergences the runners surface.** Expect some on first
   run (DST cases especially). For each: if it's a bug in a port, fix the
   port; if it's an accepted difference, record it in
   `libs/python/DIVERGENCES.md` (or a java equivalent) and exclude that
   specific query with an explicit, commented skip — never by loosening the
   serializer.

7. **Wire up developer ergonomics.**

   - Root `Makefile`: `make test-libs` (run all three suites) and
     `make golden-generate` (regenerate + remind to review the diff).

   - `libs/golden/README.md` documents the rule: a PR that changes
     `expected/` must explain the semantic change, and any intentional
     behavior change starts in TS, regenerates, then updates Python and Java
     until their golden runs pass again.

8. **(Optional, separate commit) CI.** There is currently no test workflow in
   `.github/workflows/` (only publish workflows). A `test.yml` running the
   three suites on push would make golden failures visible before publish;
   worth doing but independent of this plan's core.

## Phase 2 (optional follow-up): Validator goldens

`validateCalendarData` / `validate_calendar_data` / `Validator.validateJson`
have known robustness divergences (Python crashes on some malformed input;
error-message wording and ordering differ). A second corpus
`libs/golden/validator-cases/` of input JSON → expected outcome is valuable,
but compare only `valid` plus the *count* of errors and warnings — exact
message strings are not part of the compatibility contract. Do this after the
schedule-query goldens are stable, and only after reconciling the
crash-on-malformed-input divergence (a crash can't be compared, only
documented).

## Risks / Open Questions

- **Instant formatting false-positives.** The single most likely source of
  spurious failures. Mitigate by writing the normalization rule once in the
  README and unit-testing each port's serializer against a handful of shared
  examples (include a sub-second and a non-UTC-source value).

- **Java `Options` shape.** Java requires pre-built `Options` objects and
  (per the parity notes) non-optional options parameters. The runner absorbs
  this; if it gets awkward, that friction is itself a parity finding.

- **`isSchoolDay` zero-arg / zone-default variants** are excluded by design
  (clock-dependent). If parity for the defaulting behavior matters, that is
  a unit-test concern per port, not a golden-test concern.

- **Calendar snapshot drift.** Copies in `libs/golden/calendars/` will drift
  from `bhs-calendars/` as the live data is corrected. That is intended —
  goldens pin semantics, not current data — but note it in the README so
  nobody "helpfully" syncs them and wonders why expected files changed.

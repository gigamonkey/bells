# Generic calendar annotations (+ first-class school weeks)

## Motivation

A consumer of the bells library (the `lesson-planning` app) needs to attach
information to a school year that bells doesn't currently model:

- the **AP testing window** — a *date range*;
- **grading-period closes** — keyed by *week number in the school year* (e.g.
  "week 9 = Q1");
- ad-hoc one-off **dates** (the user wants this too, e.g. "Pi Day").

Today `lesson-planning` carries this in an out-of-band per-calendar **sidecar**
file (`calendar-extras/<id>.json`) that it merges onto the raw bells calendar
dict at load time:

```json
{
  "apExams": { "start": "2026-05-04", "end": "2026-05-15" },
  "gradingPeriods": { "5": "Q1 progress", "9": "Q1", "14": "S1 progress", ... }
}
```

It then reads those keys back off the raw `data` dict in `calendar_view.py`
(`data.get("apExams")`, `data.get("gradingPeriods")`) to badge weeks. This is
fragile: the data isn't validated, isn't versioned with the calendar, isn't
shared by the other ports, and the **week numbering it depends on lives only in
`lesson-planning`** (`calendar_view._weeks`) — bells has no concept of a
"school week," so "week 9" is meaningless to the library.

This plan promotes the sidecar to a **first-class, generic `annotations` field**
in the calendar data model, and — because week-number addressing can't be
first-class without it — adds **canonical school-week numbering** to bells.

## Decisions (already made)

- **Shape: three typed buckets** — `annotations.ranges`, `annotations.weeks`,
  `annotations.dates`. Closest to the existing sidecar; easy to read.
- **bells owns school-week numbering** — port `lesson-planning`'s `_weeks`
  algorithm into the library so a `weeks` annotation resolves to concrete dates
  inside bells (`weekForDate`, `schoolWeeks`, etc.).
- **Arbitrary payload** — each annotation entry is a free-form object;
  `label` and `kind` are *conventional* fields, everything else is opaque
  payload. Validation checks the **anchor** (key validity / in-range), never the
  payload.

## Data model

A new optional top-level field on each year object:

```json
"annotations": {
  "ranges": {
    "apExams": { "start": "2026-05-04", "end": "2026-05-15",
                 "label": "AP Exams", "kind": "testing" }
  },
  "weeks": {
    "5":  { "label": "Q1 progress", "kind": "gradingClose" },
    "9":  { "label": "Q1",          "kind": "gradingClose" },
    "18": { "label": "S1",          "kind": "gradingClose" }
  },
  "dates": {
    "2026-03-14": { "label": "Pi Day" }
  }
}
```

- `annotations.ranges` — map of an arbitrary **id** → `{ start, end, ... }`. The
  id (`"apExams"`) is the stable key a consumer looks the range up by. `start`
  and `end` are `YYYY-MM-DD`, inclusive, `start <= end`, both within
  `[firstDay, lastDay]`.
- `annotations.weeks` — map of **school-week number** (JSON string key, like
  `dates`/`nonClassDays` keys) → payload object. The number is 1-based in the
  bells school-week numbering (below).
- `annotations.dates` — map of `YYYY-MM-DD` → payload object. Unlike
  `nonClassDays`, a date annotation may fall on **any** in-range day, including a
  weekend or holiday (it annotates, it doesn't change the schedule).
- In every bucket the value is an **object**; `label` (string) and `kind`
  (string) are conventional, all other keys are passed through untouched.

This is purely **additive**: calendars without `annotations` behave exactly as
today.

## School-week numbering (prerequisite)

Port the numbering currently in `lesson-planning`'s `calendar_view._weeks`:

> A **school week** is a Monday-anchored ISO calendar week containing at least
> one school day. School weeks are numbered `1..n` in chronological order over
> `[firstDay, lastDay]`. Full-week breaks (an ISO week with no school days) get
> no number and are skipped, so the numbering is dense.

A school day is `is_school_day` as bells already defines it (weekday and not a
holiday) — so numbering is **role-aware** through the `Calendar`'s configured
role, exactly like the rest of the calendar. (Grading periods are student-facing;
binding the calendar with `role: "student"` — as `lesson-planning` already does —
gives the intended numbering. Note this in the docs.)

### `SchoolWeek` value object

| field            | type      | meaning                                  |
|------------------|-----------|------------------------------------------|
| `number`         | int       | 1-based school-week number             |
| `monday`         | PlainDate | Monday anchoring the ISO week            |
| `firstSchoolDay` | PlainDate | first school day in the week             |
| `lastSchoolDay`  | PlainDate | last school day in the week              |
| `schoolDayCount` | int       | number of school days in the week        |

### New query methods (TS camelCase / Python snake_case)

On `Calendar` (single year) and surfaced through `BellSchedule` (selecting the
calendar containing the given date, or the sole/first calendar when none is
implied):

- `schoolWeeks()` → `SchoolWeek[]`
- `schoolWeekCount()` → `int`
- `schoolWeek(n)` → `SchoolWeek | null` (by number)
- `weekForDate(date)` → `SchoolWeek | null` (null for a day in a no-school
  week or outside the year)

## Annotation query API

Resolved accessors (raw strings/keys become real dates and `SchoolWeek`s):

- `rangeAnnotations()` → `[{ id, start: PlainDate, end: PlainDate, label?, kind?, ...payload }]`
- `weekAnnotations()` → `[{ week: int, schoolWeek: SchoolWeek | null, label?, kind?, ...payload }]`
  (`schoolWeek` is `null` when the key exceeds the year's school-week count —
  see validation)
- `dateAnnotations()` → `[{ date: PlainDate, label?, kind?, ...payload }]`

Two unified helpers (what `lesson-planning` actually renders from):

- `annotationsOn(date)` → every annotation **active on** `date`, each tagged with
  its `source` (`"range" | "week" | "date"`): a `dates` entry with that exact
  date, a `ranges` entry whose span contains it, and a `weeks` entry whose
  school week contains it.
- `annotationsForWeek(n)` → every annotation **touching school week `n`**, each
  tagged with `source`: the `weeks[n]` entry, any `ranges` entry overlapping the
  week's school days, any `dates` entry inside the week. This directly replaces
  `lesson-planning`'s per-week `is_ap` (a `range` of `kind`/id `apExams`
  overlaps) and `grading_close` (a `week` entry on `n`).

Optionally expose the raw structure (`annotations()` → the unvalidated dict/
record) for consumers that want the payload verbatim.

## Validation (`validate.ts` / `validate.py` / `Validator.java`)

`annotations` is optional. When present:

- must be an object; unknown buckets beyond `ranges`/`weeks`/`dates` →
  **warning** (forward-compat, don't hard-fail).
- **`ranges`**: each value is an object with valid `start`/`end` dates, both
  in `[firstDay, lastDay]`, `start <= end`. Missing/invalid date → error.
- **`weeks`**: each key parses as an **integer ≥ 1** (error otherwise); value is
  an object (error otherwise). A key that **exceeds the year's school-week
  count** → **warning** (not error): compute the count during validation —
  `firstDay`, `lastDay`, `holidays`, and `weekdaySchedules` are all already
  available, so the same numbering used at runtime is cheap to run here. (If you
  prefer to keep the validator free of calendar construction, drop the overflow
  check to runtime: `weekAnnotations()` already returns `schoolWeek: null` for
  an overflow.)
- **`dates`**: each key is a valid date in `[firstDay, lastDay]` (error
  otherwise); value is an object. **No** weekend/holiday restriction (unlike
  `nonClassDays`).
- Payload keys (`label`, `kind`, anything else) are **never** validated for
  content. `label`/`kind`, if present, should be strings (warning if not).

Add matching cases to `test_validate.*` in each port: a valid annotations block,
an out-of-range range, a non-integer week key, an overflow week key (warning),
an out-of-range date, and a non-object payload.

## Cross-port implementation order

The TS package is the reference; Python and Java must stay behaviorally
identical (see `libs/python/DIVERGENCES.md`, which should remain "None"). Land
each behavior change in this order so the golden suite can be regenerated from TS
and the other ports brought back to green.

### 1. TypeScript reference (`libs/ts/src/`)

- `types.ts` — add `annotations?: Annotations` to `YearData`; new interfaces
  `Annotations`, `RangeAnnotation`, `Annotation` (open via index signature for
  arbitrary payload), and `SchoolWeek`. Export the new types from `index.ts`.
- `calendar.ts` — parse `annotations`; implement school-week numbering
  (mirror `_weeks`: collect school days in `[firstDay, lastDay]`, group by ISO
  `(year, week)`, number `1..n`); implement the resolved accessors + unified
  helpers.
- `bell-schedule.ts` — surface the new methods, selecting the right `Calendar`
  the same way `nonClassLabel`/`scheduleFor` do (`_calendarForDate`) and the
  whole-year ones via the sole/first calendar.
- `validate.ts` — the rules above.
- `libs/ts/README.md` — document `annotations` in the **Calendar data format**
  section and the new API methods in the **API** section.
- `cd libs/ts && npm test`.

### 2. Python port (`libs/python/bells/`)

Mirror in `calendar.py` (numbering + accessors), `bell_schedule.py` (surface),
`validate.py` (rules), `__init__.py` (export `SchoolWeek` etc.). Keep message
strings identical to TS where validation overlaps. `cd libs/python && pytest`.

### 3. Java port (`libs/java/src/main/java/com/gigamonkeys/bells/`)

`CalendarData` is a **typed record** with typed accessors, so model:

- `Annotations(Map<String,RangeAnnotation> ranges, Map<String,Annotation> weeks,
  Map<String,Annotation> dates)`;
- `RangeAnnotation(String start, String end, Map<String,Object> rest)` and
  `Annotation(Map<String,Object> payload)` — the **arbitrary payload** maps to an
  open `Map<String,Object>` (Jackson `@JsonAnySetter` / catch-all), since a Java
  record can't be open-ended; surface `label()`/`kind()` as convenience getters
  over the map.
- a `SchoolWeek` record; numbering in `Calendar.java`; accessors mirrored;
  rules in `Validator.java`.

`cd libs/java && mvn test`.

### 4. Golden tests (`libs/golden/`)

These pin all three ports identical, so the new methods must enter the protocol:

- **Protocol** — add `schoolWeeks`, `schoolWeek`, `weekForDate`,
  `rangeAnnotations`, `weekAnnotations`, `dateAnnotations`, `annotationsOn`,
  `annotationsForWeek` to the method list in `libs/golden/README.md` **and** to
  the dispatch table in each of the three golden runners (TS/Python/Java).
  Adding a method to all three tables is deliberate (per the README).
- **Canonical serialization** — define the canonical JSON form for the new
  return types: `SchoolWeek` → `{ number, monday, firstSchoolDay,
  lastSchoolDay, schoolDayCount }` with PlainDates as `YYYY-MM-DD`; annotation
  results as plain objects with dates as `YYYY-MM-DD`, `schoolWeek` nested or
  `null`, `source` strings preserved. Match the existing date/instant
  conventions in the runners.
- **Fixtures** — add an `annotations` block to a golden calendar (e.g. a copy of
  `bhs-2025-2026.json`, or the `synthetic.json`) — remember goldens are **frozen
  snapshots**, so add to a golden copy, don't sync from live data.
- **Case** — a new `annotations.json` case exercising each method (a range, a
  resolvable week, an overflow week → `null`, a date, `annotationsOn` for a day
  inside a range, `annotationsForWeek` for a week an `apExams`-style range
  overlaps).
- **Regenerate** expected from the TS reference: `make golden-generate`, review
  the diff, then bring Python/Java green. `make test-libs` runs all three.

## `lesson-planning` migration (separate, cross-repo follow-up)

Once bells ships annotations and `bhs-calendars` carries the values, do a clean
cutover in `lesson-planning` (its own commit, after a bells release):

1. Move the `apExams` / `gradingPeriods` values from each
   `calendar-extras/<id>.json` into the corresponding `bhs-calendars` year JSON
   under `annotations` (`apExams` → `ranges.apExams`; `gradingPeriods` →
   `weeks`). Re-validate with `bells-validate`; cut a `bhs-calendars` release.
2. In `calendar_view.py`: delete the sidecar merge in `load_calendar` (drop
   `extras_dir` / `LESSON_CALENDAR_EXTRAS_DIR` and the `calendar-extras/`
   directory). Replace `data.get("apExams")` / `data.get("gradingPeriods")` with
   the bells API: `is_ap` ← `annotationsForWeek(n)` containing a range of id/kind
   `apExams`; `grading_close` ← the `weeks[n]` entry's `label`.
3. **Week-numbering invariant** — bells' school-week numbering is the *same
   algorithm* `_weeks` uses, so "week 9" agrees by construction. To prevent
   future drift, have `build_calendar` get its week numbers from bells'
   `schoolWeeks()` rather than its private `_weeks` (which can keep producing
   the break-box layout, but should stop being the source of truth for the
   *number*). Add a test asserting the two agree on a known calendar.

(Transitional alternative, if you don't want a hard dependency on a bells
release: read `annotations` first and fall back to the old sidecar keys. Cleaner
to just cut over.)

## Backward compatibility & release

- Schema change is additive; no migration needed for existing calendars.
- Release the `@peterseibel/bells` lib (`make release-lib`), then the Python/Java
  artifacts, then `bhs-calendars` once the data is added. Bump consumers
  (`lesson-planning`'s `bell-schedule` / `bhs-calendars` pins) afterward.

## Open questions / risks

- **Validator ↔ Calendar coupling** for the week-overflow check (compute weeks in
  the validator vs. defer to runtime `null`). Recommended: compute it as a
  *warning*; it's cheap and keeps bad data from shipping.
- **Java open payload** — confirm the Jackson config used for `CalendarData`
  tolerates an `@JsonAnySetter` catch-all; if `FAIL_ON_UNKNOWN_PROPERTIES` is on,
  the payload map needs the any-setter, not record components.
- **Per-day vs. per-week grading keys** — week-number keys are sensitive to the
  numbering definition. They're what the user wants and resolve fine, but if a
  calendar's holidays shift after the fact, a hardcoded "week 9" can move; a
  `dates`-bucket grading close is immune. Worth a doc note; not a blocker.
- **`annotationsForWeek` range overlap semantics** — overlap against the week's
  *school days* (matches `lesson-planning`'s current `is_ap`), not the raw
  Mon–Sun span. State this in the doc + a golden case.

## Step-by-step checklist

1. TS: `types.ts` + `index.ts` (types/exports).
2. TS: `calendar.ts` school-week numbering + `SchoolWeek`.
3. TS: `calendar.ts` annotation parse + resolved accessors + unified helpers.
4. TS: `bell-schedule.ts` surface methods.
5. TS: `validate.ts` rules + tests; `README.md` docs.
6. Python: mirror 1–5; `pytest`; keep `DIVERGENCES.md` empty.
7. Java: mirror 1–5 (records + `@JsonAnySetter` payload); `mvn test`.
8. Golden: protocol + runners + fixture + case; `make golden-generate`;
   `make test-libs`.
9. Release lib + ports; add data to `bhs-calendars`; release calendars.
10. `lesson-planning` cutover (separate commit): move data, delete sidecar, wire
    API, assert week-number agreement.

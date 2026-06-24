# bells (Java)

A framework-agnostic Java library for querying school bell schedules. Built on
`java.time`. This is a port of the JavaScript [`@peterseibel/bells`](../ts) library
and shares the same calendar data format and semantics.

## Installation

Maven coordinates:

```xml
<dependency>
  <groupId>com.gigamonkeys</groupId>
  <artifactId>bells</artifactId>
  <version>0.5.0</version>
</dependency>
```

Requires Java 17 or later. The only runtime dependency is Jackson (`jackson-databind`),
used for parsing calendar JSON.

## Calendar data format

The calendar data format is identical to the JavaScript library; see
[`../ts/README.md`](../ts/README.md) for the full specification. In brief, calendar
data is one JSON object per academic year (or an array of them):

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
      ],
      "LATE_START": [
        { "name": "Period 1", "start": "10:00", "end": "10:43" }
      ]
    },
    "weekdaySchedules": { "monday": "LATE_START" },
    "dates": { "2025-08-13": [ { "name": "Orientation", "start": "8:30", "end": "15:00" } ] },
    "holidays": ["2025-09-01", "2025-11-27"],
    "teacherWorkDays": ["2025-11-27"],
    "breakNames": { "2025-11-24": "Thanksgiving Break" }
  }
]
```

### Type mapping

The library uses `java.time` where the JavaScript original used the Temporal API:

| Temporal               | java.time        |
| ---------------------- | ---------------- |
| `Temporal.Instant`     | `Instant`        |
| `Temporal.PlainDate`   | `LocalDate`      |
| `Temporal.PlainTime`   | `LocalTime`      |
| `Temporal.PlainDateTime` | `LocalDateTime` |
| `Temporal.Duration`    | `Duration`       |

ISO day-of-week numbering matches Temporal: 1 = Monday … 7 = Sunday.

## Usage

### `BellSchedule`

```java
import com.gigamonkeys.bells.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;

String json = Files.readString(Path.of("2025-2026.json"));

// Per-weekday optional tags: include Period 7 every day, plus Period 0 on Tuesday.
Map<Integer, List<String>> tags = Map.of(
    1, List.of("seventh"),
    2, List.of("zero", "seventh"),
    3, List.of("seventh"),
    4, List.of("seventh"),
    5, List.of("seventh"));

BellSchedule bells = BellSchedule.fromJsonString(json, new Options("student", tags));
// Or the same tags every weekday:
//   Options.ofFlat("student", List.of("seventh"))
// Configure which periods are "numbered" for the abstract-time API (default:
// match /^Period (\d+)\b/ in the name):
//   Options.defaults().withPeriodNumber(period -> ...Integer or null...)

// What's happening right now?
Interval interval = bells.currentInterval();
if (interval != null) {
  System.out.println(interval.name());        // e.g. "Period 3"
  System.out.println(interval.type());        // period | passing | before-school | after-school | break
  System.out.println(interval.left());        // Duration until end of interval
}

// Other queries (Instant overloads default to Instant.now()):
bells.periodAt();              // Interval | null (null if passing/break)
bells.isSchoolDay(LocalDate.now());
bells.currentDayBounds();      // Bounds | null
bells.nextSchoolDayStart();    // Instant
bells.previousSchoolDayEnd();  // Instant
bells.schoolTimeLeft();        // Duration
bells.schoolTimeDone();        // Duration
bells.totalSchoolTime();       // Duration
bells.schoolDaysLeft();        // int
bells.calendarDaysLeft();      // int
bells.nextYearStart();         // Instant (throws if not loaded)
bells.schoolTimeBetween(a, b); // Duration
bells.summerBounds();          // Bounds | null
bells.scheduleFor(date);       // List<PeriodInstant>
bells.periodsForDate();        // List<PeriodInstant>
```

You can also build from a Jackson `JsonNode` via `BellSchedule.fromJson(node, options)`,
or from already-parsed data via `new BellSchedule(List<CalendarData>, options)`.

### Abstract times

An *abstract time* describes a moment relative to the schedule — "five minutes
before the end of the period", "start of school next Monday" — rather than as a
wall-clock time. It has three independent parts: a *day spec* ({@link DaySpec},
which date, possibly relative to a base date), a *time anchor* ({@link TimeAnchor}:
a schedule-defined point in that day), and a signed `HH:MM` offset.

Resolution happens in two phases, so the period can stay unbound until query time
(a stored "start of period" resolves differently for a period-2 class than a
period-5 class). `AbstractTimes.parseTime`/`formatTime` need no calendar:

```java
import com.gigamonkeys.bells.*;

// Standalone — no calendar needed:
AbstractTime t = AbstractTimes.parseTime("end_of_period -00:05 +1 day");
AbstractTimes.formatTime(t);                 // canonical round-trip

// Phase 1 (load time): bind the day spec against a base date. Warnings for
// specs that don't make sense against the calendar (e.g. a school anchor on a
// holiday) go to the consumer (the no-arg overload prints to stderr).
BoundTime bound = bells.bindTime(baseDate, t, warning -> System.err.println(warning));
// → BoundTime[date=2026-01-06, anchor=end_of_period, offset=-00:05]

// Phase 2 (query time): resolve to a concrete moment, supplying the period if
// the anchor needs one. null when the date has no schedule or no such period.
bells.resolveTime(bound, 3);                 // ZonedDateTime | null

// Pieces of the above, usable directly:
bells.resolveDay(baseDate, t.day());         // LocalDate
bells.timeWarnings(bound);                    // List<String> (empty = OK)
bells.addSchoolDays(date, 3);                 // n school days out (n may be negative)
bells.periodOnDate(date, 3);                  // PeriodInstant | null
bells.currentOrNextPeriodNumber();            // Integer | null
```

The string syntax is `anchor [time-offset] [day-part]`, whitespace-separated and
case-insensitive (e.g. `end_of_period -00:05`, `start_of_day next week`,
`end_of_day +1 day`, `midnight +1 week`, `start_of_day 2026-01-05`). Day-part
semantics: `±N day(s)` counts *school* days; `±N week(s)` is literal calendar
arithmetic (no snapping); a weekday name means the first such day strictly after
the base date, taken literally even if it's a holiday; the week boundaries
(`start of [next] week`, `end of [next] week`) snap to the first/last school day
of the ISO week. `start of week` on a week with no school days advances to the
first day back (with a warning); `end of week` on such a week throws. Resolution
that runs past the loaded calendars throws an `IndexOutOfBoundsException`.

### `Calendars`

For loading per-year JSON files from a directory or base URL:

```java
Calendars calendars = new Calendars("./calendars/");
// or: new Calendars("https://example.com/calendars/");

// Load a specific year:
BellSchedule bells = calendars.forYear("2025-2026", Options.defaults());

// Load whatever is appropriate for right now (handles summer automatically):
BellSchedule bells = calendars.current(ZoneId.of("America/Los_Angeles"), Options.defaults());
```

Files must be named `{year}.json` (e.g. `2025-2026.json`). Directory paths are read with
`java.nio.file`; URL bases are fetched with `java.net.http.HttpClient`.

### `bhs-calendars` (bundled BHS data)

As an alternative to supplying your own `{year}.json` files, the companion `bhs-calendars`
artifact ships ready-to-use calendar data for Berkeley High and nearby middle schools,
parsed into `CalendarData`. `byId()` groups the bundled years by school (each group's years
sorted chronologically); hand one group straight to `BellSchedule`:

```java
import com.gigamonkeys.bhscalendars.BhsCalendars;
import com.gigamonkeys.bells.BellSchedule;
import com.gigamonkeys.bells.CalendarData;
import com.gigamonkeys.bells.Options;
import java.util.List;

List<CalendarData> years = BhsCalendars.byId().get("bhs");   // one school's years, oldest first
BellSchedule bells = new BellSchedule(years, Options.defaults());

List<CalendarData> all = BhsCalendars.loadAll();             // or the flat list of every school-year
```

Add the dependency:

```xml
<dependency>
  <groupId>com.gigamonkeys</groupId>
  <artifactId>bhs-calendars</artifactId>
  <version>2.8.1</version>
</dependency>
```

Unlike `Calendars`, the data is bundled on the classpath — no filesystem layout or network
access — but it only covers the BHS-area schools. Equivalent data packages exist for the
[TypeScript](../ts) (`@peterseibel/bhs-calendars` on npm) and [Python](../python)
(`bhs-calendars` on PyPI) ports.

### Validation

```java
import com.gigamonkeys.bells.*;

ValidationResult result = Validator.validateJson(jsonText);
if (!result.valid()) {
  result.errors().forEach(System.err::println);
}
```

Checks include required fields, valid timezone, date-range consistency, unambiguous time
strings, `start < end` for every period, and no overlapping non-optional periods.

CLI (built as `bells-0.5.0-cli.jar` by `mvn package`):

```sh
java -jar target/bells-0.5.0-cli.jar calendars.json [more.json ...]
```

## Building

```sh
mvn package      # compile, run tests, build library + CLI + sources + javadoc jars
mvn test         # run the test suite
```

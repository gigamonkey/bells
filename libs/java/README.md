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

# bhs-calendars (Java)

Bundled bell-schedule calendar data for Berkeley High School and nearby middle
schools, as a Maven artifact. This is the Java counterpart of the npm
[`@peterseibel/bhs-calendars`](../../bhs-calendars) package and ships the same
per-year JSON as classpath resources.

It is data, not logic — pair it with the [`bells`](../java) library to build
schedules without supplying your own `{year}.json` files.

```xml
<dependency>
  <groupId>com.gigamonkeys</groupId>
  <artifactId>bhs-calendars</artifactId>
  <version>2.8.1</version>
</dependency>
```

## Usage

```java
import com.gigamonkeys.bhscalendars.BhsCalendars;
import com.gigamonkeys.bells.BellSchedule;
import com.gigamonkeys.bells.CalendarData;
import com.gigamonkeys.bells.Options;
import java.util.List;

// Grouped by school, each school's years sorted chronologically:
List<CalendarData> years = BhsCalendars.byId().get("bhs");
BellSchedule bells = new BellSchedule(years, Options.defaults());

// Or the flat list of every bundled school-year:
List<CalendarData> all = BhsCalendars.loadAll();
```

`loadAll()` mirrors the npm package's default export (a flat list of yearly
calendar objects, parsed into `CalendarData`). `byId()` groups those by their
`id` — `"bhs"`, `"king-6"`, `"king-7"`, `"king-8"`, `"longfellow-6"`,
`"longfellow-78"`, `"willard-6"`, `"willard-78"` — with each group's years
sorted by `firstDay`.

Unlike the library's `Calendars` loader (which reads `{year}.json` from a
directory or URL), this data is bundled on the classpath: no filesystem layout
or network access required. The trade-off is that it only covers the BHS-area
schools.

## Building

This artifact depends on `com.gigamonkeys:bells`, so install the library to your
local Maven repository first:

```sh
cd ../java && mvn install        # publishes com.gigamonkeys:bells to ~/.m2
cd ../java-bhs-calendars && mvn package
```

## Data source

The single source of truth is the canonical `bhs-calendars/` directory at the
repository root (also the npm package source). The JSON under
`src/main/resources/bhs-calendars/` (and the `index.txt` that lists it) is a
verbatim, build-time copy of it and is **gitignored, not committed** — it is
regenerated from the source so it can never drift.

Run `make sync-java-calendars` (or `make sync-calendars` for both ports) from the
repo root once after checkout, and again after the source data changes, before
`mvn package` / `mvn test`.

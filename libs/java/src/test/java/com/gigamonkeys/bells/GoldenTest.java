package com.gigamonkeys.bells;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicContainer;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * Cross-implementation golden tests. Runs the shared cases from libs/golden/ against this port
 * and compares the canonically-serialized results with the committed expected files (generated
 * by the TypeScript reference implementation). See libs/golden/README.md.
 */
class GoldenTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  // Surefire's working directory is the module basedir (libs/java).
  private static final Path GOLDEN_DIR =
      Path.of(System.getProperty("golden.dir", "../golden")).toAbsolutePath().normalize();

  private static final DateTimeFormatter INSTANT_FORMAT =
      DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC);

  @TestFactory
  Stream<DynamicContainer> golden() throws IOException {
    assertTrue(
        Files.isDirectory(GOLDEN_DIR.resolve("cases")),
        "libs/golden not found at " + GOLDEN_DIR + " (override with -Dgolden.dir=...)");
    try (Stream<Path> files = Files.list(GOLDEN_DIR.resolve("cases"))) {
      return files
          .filter(p -> p.getFileName().toString().endsWith(".json"))
          .sorted()
          .map(GoldenTest::caseContainer)
          .toList()
          .stream();
    }
  }

  private static DynamicContainer caseContainer(Path caseFile) {
    String name = caseFile.getFileName().toString().replaceFirst("\\.json$", "");
    try {
      JsonNode caseDef = MAPPER.readTree(caseFile.toFile());
      JsonNode expected = MAPPER.readTree(GOLDEN_DIR.resolve("expected/" + name + ".json").toFile());
      BellSchedule bells =
          new BellSchedule(loadCalendarData(caseDef.get("calendars")), toOptions(caseDef.get("options")));

      List<DynamicTest> tests = new ArrayList<>();
      for (JsonNode query : caseDef.get("queries")) {
        String id = query.get("id").asText();
        tests.add(
            DynamicTest.dynamicTest(
                id,
                () -> {
                  assertTrue(
                      expected.has(id),
                      "no expected value — regenerate with npm run golden:generate");
                  JsonNode actual = MAPPER.valueToTree(runQuery(bells, query));
                  assertEquals(expected.get(id), actual);
                }));
      }
      return DynamicContainer.dynamicContainer("golden: " + name, tests);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static List<CalendarData> loadCalendarData(JsonNode files) throws IOException {
    List<CalendarData> data = new ArrayList<>();
    for (JsonNode f : files) {
      JsonNode parsed = MAPPER.readTree(GOLDEN_DIR.resolve("calendars/" + f.asText()).toFile());
      data.addAll(CalendarData.fromJson(parsed));
    }
    return data;
  }

  private static Options toOptions(JsonNode options) {
    String role = options.has("role") ? options.get("role").asText() : Options.STUDENT;
    JsonNode includeTags = options.get("includeTags");
    if (includeTags == null) {
      return Options.of(role, Map.of());
    }
    if (includeTags.isArray()) {
      return Options.ofFlat(role, stringList(includeTags));
    }
    Map<Integer, List<String>> byDay = new LinkedHashMap<>();
    includeTags
        .fields()
        .forEachRemaining(e -> byDay.put(Integer.valueOf(e.getKey()), stringList(e.getValue())));
    return Options.of(role, byDay);
  }

  private static List<String> stringList(JsonNode array) {
    List<String> result = new ArrayList<>();
    array.forEach(n -> result.add(n.asText()));
    return result;
  }

  // ─── Query dispatch ─────────────────────────────────────────────────────────

  private static Object runQuery(BellSchedule b, JsonNode query) {
    JsonNode args = query.get("args");
    return switch (query.get("method").asText()) {
      case "timezone" -> b.timezone();
      case "currentInterval" -> interval(b.currentInterval(instantArg(args)));
      case "periodAt" -> interval(b.periodAt(instantArg(args)));
      case "isSchoolDay" -> b.isSchoolDay(dateArg(args));
      case "currentDayBounds" -> bounds(b.currentDayBounds(instantArg(args)));
      case "nextSchoolDayStart" -> instant(b.nextSchoolDayStart(instantArg(args)));
      case "previousSchoolDayEnd" -> instant(b.previousSchoolDayEnd(instantArg(args)));
      case "schoolTimeLeft" -> duration(b.schoolTimeLeft(instantArg(args)));
      case "schoolTimeDone" -> duration(b.schoolTimeDone(instantArg(args)));
      case "totalSchoolTime" -> duration(b.totalSchoolTime(instantArg(args)));
      case "schoolTimeBetween" ->
          duration(b.schoolTimeBetween(instant(args, "start"), instant(args, "end")));
      case "schoolDaysBetween" -> b.schoolDaysBetween(date(args, "start"), date(args, "end"));
      case "schoolDaysLeft" -> b.schoolDaysLeft(instantArg(args));
      case "calendarDaysLeft" -> b.calendarDaysLeft(instantArg(args));
      case "nextYearStart" -> instant(b.nextYearStart(instantArg(args)));
      case "currentYearStart" -> optInstant(b.currentYearStart(instantArg(args)));
      case "currentYearEnd" -> optInstant(b.currentYearEnd(instantArg(args)));
      case "summerBounds" -> summerBounds(b.summerBounds(instantArg(args)));
      case "nextSchoolDay" -> b.nextSchoolDay(dateArg(args)).toString();
      case "previousSchoolDay" -> b.previousSchoolDay(dateArg(args)).toString();
      case "scheduleNameFor" -> b.scheduleNameFor(dateArg(args));
      case "scheduleFor" -> periods(b.scheduleFor(dateArg(args)));
      case "periodsForDate" -> periods(b.periodsForDate(instantArg(args)));
      case "nonClassDaysLeft" -> nonClassDays(b.nonClassDaysLeft(instantArg(args)));
      case "nonClassLabel" -> b.nonClassLabel(dateArg(args));
      default ->
          throw new IllegalArgumentException(
              "Golden query method not in protocol: " + query.get("method").asText());
    };
  }

  private static Instant instantArg(JsonNode args) {
    return instant(args, "instant");
  }

  private static Instant instant(JsonNode args, String key) {
    return Instant.parse(args.get(key).asText());
  }

  private static LocalDate dateArg(JsonNode args) {
    return date(args, "date");
  }

  private static LocalDate date(JsonNode args, String key) {
    return LocalDate.parse(args.get(key).asText());
  }

  // ─── Canonical serialization (see libs/golden/README.md) ───────────────────

  private static String instant(Instant i) {
    return INSTANT_FORMAT.format(i);
  }

  private static String optInstant(Instant i) {
    return i == null ? null : instant(i);
  }

  private static int duration(Duration d) {
    return Math.toIntExact(d.toSeconds());
  }

  private static Map<String, Object> interval(Interval interval) {
    if (interval == null) {
      return null;
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("name", interval.name());
    result.put("type", interval.type().label());
    result.put("start", instant(interval.start()));
    result.put("end", instant(interval.end()));
    result.put("duringSchool", interval.duringSchool());
    result.put("tags", interval.tags());
    return result;
  }

  private static Map<String, Object> bounds(DayBounds b) {
    if (b == null) {
      return null;
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("start", optInstant(b.start()));
    result.put("end", optInstant(b.end()));
    return result;
  }

  private static Map<String, Object> summerBounds(SummerBounds b) {
    if (b == null) {
      return null;
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("start", optInstant(b.start()));
    result.put("end", optInstant(b.end()));
    return result;
  }

  private static List<Map<String, Object>> periods(List<PeriodInstant> periods) {
    List<Map<String, Object>> result = new ArrayList<>();
    for (PeriodInstant p : periods) {
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("name", p.name());
      entry.put("start", instant(p.start()));
      entry.put("end", instant(p.end()));
      entry.put("tags", p.tags());
      result.add(entry);
    }
    return result;
  }

  private static List<Map<String, Object>> nonClassDays(List<NonClassDay> days) {
    List<Map<String, Object>> result = new ArrayList<>();
    for (NonClassDay d : days) {
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("date", d.date().toString());
      entry.put("label", d.label());
      result.add(entry);
    }
    return result;
  }
}

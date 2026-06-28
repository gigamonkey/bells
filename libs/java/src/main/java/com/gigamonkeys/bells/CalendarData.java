package com.gigamonkeys.bells;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One academic year's calendar data, parsed from JSON into a typed form.
 *
 * <p>Mirrors the calendar data format documented in the library README: a year label,
 * timezone, first/last days, named schedules, weekday overrides, date overrides,
 * holidays, teacher work days, break names, and non-class day labels.
 */
public final class CalendarData {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final String year;
  private final String id;
  private final String name;
  private final String timezone;
  private final String firstDay;
  private final String firstDayTeachers;
  private final String lastDay;
  private final Map<String, List<PeriodData>> schedules;
  private final Map<String, String> weekdaySchedules;
  private final Map<String, DateEntry> dates;
  private final List<String> holidays;
  private final List<String> teacherWorkDays;
  private final Map<String, String> breakNames;
  private final Map<String, String> nonClassDays;
  private final Annotations annotations;

  CalendarData(
      String year,
      String id,
      String name,
      String timezone,
      String firstDay,
      String firstDayTeachers,
      String lastDay,
      Map<String, List<PeriodData>> schedules,
      Map<String, String> weekdaySchedules,
      Map<String, DateEntry> dates,
      List<String> holidays,
      List<String> teacherWorkDays,
      Map<String, String> breakNames,
      Map<String, String> nonClassDays,
      Annotations annotations) {
    this.year = year;
    this.id = id;
    this.name = name;
    this.timezone = timezone;
    this.firstDay = firstDay;
    this.firstDayTeachers = firstDayTeachers;
    this.lastDay = lastDay;
    this.schedules = schedules;
    this.weekdaySchedules = weekdaySchedules;
    this.dates = dates;
    this.holidays = holidays;
    this.teacherWorkDays = teacherWorkDays;
    this.breakNames = breakNames;
    this.nonClassDays = nonClassDays;
    this.annotations = annotations;
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  public String year() {
    return year;
  }

  public String id() {
    return id;
  }

  public String name() {
    return name;
  }

  public String timezone() {
    return timezone;
  }

  public String firstDay() {
    return firstDay;
  }

  public String firstDayTeachers() {
    return firstDayTeachers;
  }

  public String lastDay() {
    return lastDay;
  }

  public Map<String, List<PeriodData>> schedules() {
    return schedules;
  }

  public Map<String, String> weekdaySchedules() {
    return weekdaySchedules;
  }

  public Map<String, DateEntry> dates() {
    return dates;
  }

  public List<String> holidays() {
    return holidays;
  }

  public List<String> teacherWorkDays() {
    return teacherWorkDays;
  }

  public Map<String, String> breakNames() {
    return breakNames;
  }

  public Map<String, String> nonClassDays() {
    return nonClassDays;
  }

  public Annotations annotations() {
    return annotations;
  }

  // ─── Parsing ────────────────────────────────────────────────────────────────

  /**
   * Parse a JSON string into one or more {@link CalendarData} objects. The JSON may be a
   * single year object or an array of them.
   *
   * @param json JSON text
   * @return the parsed calendar data list
   */
  public static List<CalendarData> parse(String json) {
    return fromJson(readTree(json));
  }

  /**
   * Build {@link CalendarData} objects from a parsed JSON tree (object or array).
   *
   * @param node a JSON object or array
   * @return the parsed calendar data list
   */
  public static List<CalendarData> fromJson(JsonNode node) {
    List<CalendarData> result = new ArrayList<>();
    if (node.isArray()) {
      for (JsonNode year : node) {
        result.add(fromYearJson(year));
      }
    } else {
      result.add(fromYearJson(node));
    }
    return result;
  }

  /**
   * Build a single {@link CalendarData} from one year's JSON object node.
   *
   * @param node a JSON object describing one academic year
   * @return the parsed calendar data
   */
  public static CalendarData fromYearJson(JsonNode node) {
    Map<String, List<PeriodData>> schedules = new LinkedHashMap<>();
    JsonNode schedulesNode = node.get("schedules");
    if (schedulesNode != null && schedulesNode.isObject()) {
      schedulesNode.fields().forEachRemaining(e -> {
        if (e.getValue().isArray()) {
          schedules.put(e.getKey(), parsePeriods(e.getValue()));
        }
      });
    }

    Map<String, String> weekdaySchedules = stringMap(node.get("weekdaySchedules"));

    Map<String, DateEntry> dates = new LinkedHashMap<>();
    JsonNode datesNode = node.get("dates");
    if (datesNode != null && datesNode.isObject()) {
      datesNode.fields().forEachRemaining(e -> {
        JsonNode v = e.getValue();
        if (v.isTextual()) {
          dates.put(e.getKey(), DateEntry.named(v.asText()));
        } else if (v.isArray()) {
          dates.put(e.getKey(), DateEntry.inline(parsePeriods(v)));
        }
      });
    }

    return new CalendarData(
        textOrNull(node, "year"),
        textOrNull(node, "id"),
        textOrNull(node, "name"),
        textOrNull(node, "timezone"),
        textOrNull(node, "firstDay"),
        textOrNull(node, "firstDayTeachers"),
        textOrNull(node, "lastDay"),
        schedules,
        weekdaySchedules,
        dates,
        stringList(node.get("holidays")),
        stringList(node.get("teacherWorkDays")),
        stringMap(node.get("breakNames")),
        stringMap(node.get("nonClassDays")),
        parseAnnotations(node.get("annotations")));
  }

  private static Annotations parseAnnotations(JsonNode node) {
    if (node == null || !node.isObject()) {
      return Annotations.empty();
    }
    Map<String, RangeAnnotation> ranges = new LinkedHashMap<>();
    JsonNode rangesNode = node.get("ranges");
    if (rangesNode != null && rangesNode.isObject()) {
      rangesNode.fields().forEachRemaining(e -> {
        if (e.getValue().isObject()) {
          Map<String, Object> rest = toMap(e.getValue());
          Object start = rest.remove("start");
          Object end = rest.remove("end");
          ranges.put(
              e.getKey(),
              new RangeAnnotation(
                  start == null ? null : start.toString(),
                  end == null ? null : end.toString(),
                  rest));
        }
      });
    }
    return new Annotations(
        ranges, parseAnnotationMap(node.get("weeks")), parseAnnotationMap(node.get("dates")));
  }

  private static Map<String, Annotation> parseAnnotationMap(JsonNode node) {
    Map<String, Annotation> map = new LinkedHashMap<>();
    if (node != null && node.isObject()) {
      node.fields().forEachRemaining(e -> {
        if (e.getValue().isObject()) {
          map.put(e.getKey(), new Annotation(toMap(e.getValue())));
        }
      });
    }
    return map;
  }

  private static Map<String, Object> toMap(JsonNode node) {
    return MAPPER.convertValue(node, new TypeReference<LinkedHashMap<String, Object>>() {});
  }

  private static List<PeriodData> parsePeriods(JsonNode array) {
    List<PeriodData> periods = new ArrayList<>();
    for (JsonNode p : array) {
      periods.add(PeriodData.fromJson(p));
    }
    return periods;
  }

  private static List<String> stringList(JsonNode node) {
    List<String> list = new ArrayList<>();
    if (node != null && node.isArray()) {
      for (JsonNode v : node) {
        list.add(v.asText());
      }
    }
    return list;
  }

  private static Map<String, String> stringMap(JsonNode node) {
    Map<String, String> map = new LinkedHashMap<>();
    if (node != null && node.isObject()) {
      node.fields().forEachRemaining(e -> map.put(e.getKey(), e.getValue().asText()));
    }
    return map;
  }

  private static String textOrNull(JsonNode node, String field) {
    JsonNode v = node.get(field);
    return (v == null || v.isNull()) ? null : v.asText();
  }

  static JsonNode readTree(String json) {
    try {
      return MAPPER.readTree(json);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

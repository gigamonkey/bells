package com.gigamonkeys.bells;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Validates calendar data. Checks required fields, valid timezone, date-range consistency,
 * unambiguous time strings, {@code start < end} for every period, and non-overlapping
 * non-optional periods.
 */
public final class Validator {

  private static final List<String> REQUIRED_FIELDS =
      List.of("year", "id", "name", "timezone", "firstDay", "lastDay", "schedules");

  private static final Set<String> VALID_WEEKDAYS =
      Set.of("monday", "tuesday", "wednesday", "thursday", "friday");

  private Validator() {}

  /**
   * Validate calendar data given as a JSON string.
   *
   * @param json JSON text (a single year object or an array of them)
   * @return the validation result
   */
  public static ValidationResult validateJson(String json) {
    return validate(CalendarData.readTree(json));
  }

  /**
   * Validate calendar data given as a parsed JSON tree.
   *
   * @param data a JSON object or array
   * @return the validation result
   */
  public static ValidationResult validate(JsonNode data) {
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();

    if (data == null || data.isNull() || !(data.isObject() || data.isArray())) {
      return new ValidationResult(false, List.of("Data must be an object or array"), List.of());
    }

    List<JsonNode> arr = new ArrayList<>();
    if (data.isArray()) {
      data.forEach(arr::add);
    } else {
      arr.add(data);
    }

    if (arr.isEmpty()) {
      return new ValidationResult(false, List.of("Data array is empty"), List.of());
    }

    for (int i = 0; i < arr.size(); i++) {
      YearResult result = validateYear(arr.get(i), i);
      errors.addAll(result.errors);
      warnings.addAll(result.warnings);
    }

    // All entries in an array must share the same id.
    Set<String> ids = new LinkedHashSet<>();
    for (JsonNode y : arr) {
      JsonNode id = y.get("id");
      if (id != null && !id.isNull()) {
        ids.add(id.asText());
      }
    }
    if (ids.size() > 1) {
      List<String> quoted = new ArrayList<>();
      for (String s : ids) {
        quoted.add("\"" + s + "\"");
      }
      errors.add("Calendar array mixes multiple ids: " + String.join(", ", quoted));
    }

    return new ValidationResult(errors.isEmpty(), errors, warnings);
  }

  private record YearResult(List<String> errors, List<String> warnings) {}

  private static YearResult validateYear(JsonNode year, int index) {
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    String label = "Year " + index + " (" + text(year, "year", "unknown") + ")";

    // 1. Required fields.
    for (String field : REQUIRED_FIELDS) {
      if (isFalsy(year.get(field))) {
        errors.add(label + ": missing required field \"" + field + "\"");
      }
    }

    JsonNode schedules = year.get("schedules");
    if (schedules != null && schedules.isObject()) {
      JsonNode normal = schedules.get("NORMAL");
      if (normal == null || !normal.isArray()) {
        errors.add(label + ": missing schedules.NORMAL");
      }
      Iterator<Map.Entry<String, JsonNode>> it = schedules.fields();
      while (it.hasNext()) {
        Map.Entry<String, JsonNode> e = it.next();
        if (!e.getValue().isArray()) {
          errors.add(label + ": schedules." + e.getKey() + " must be an array of periods");
        }
      }
    }

    // Stop if basic structure is broken.
    if (!errors.isEmpty()) {
      return new YearResult(errors, warnings);
    }

    // 2. Timezone validity.
    if (!isValidTimezone(year.get("timezone").asText())) {
      errors.add(
          label + ": \"" + year.get("timezone").asText()
              + "\" is not a valid IANA timezone identifier");
    }

    // 3. Parse dates.
    LocalDate firstDay = tryParseDate(text(year, "firstDay", null));
    LocalDate lastDay = tryParseDate(text(year, "lastDay", null));

    if (firstDay == null) {
      errors.add(label + ": invalid firstDay \"" + text(year, "firstDay", null) + "\"");
    }
    if (lastDay == null) {
      errors.add(label + ": invalid lastDay \"" + text(year, "lastDay", null) + "\"");
    }

    LocalDate rangeStart = firstDay;

    JsonNode fdt = year.get("firstDayTeachers");
    if (fdt != null && !fdt.isNull()) {
      LocalDate firstDayTeachers = tryParseDate(fdt.asText());
      if (firstDayTeachers == null) {
        errors.add(label + ": invalid firstDayTeachers \"" + fdt.asText() + "\"");
      } else if (firstDay != null && firstDayTeachers.isAfter(firstDay)) {
        errors.add(label + ": firstDayTeachers must not be after firstDay");
      } else {
        rangeStart = firstDayTeachers;
      }
    }

    final LocalDate rs = rangeStart;
    final LocalDate ld = lastDay;
    InRange inRange =
        (dateStr) -> {
          LocalDate d = tryParseDate(dateStr);
          if (d == null) {
            return false;
          }
          if (rs == null || ld == null) {
            return true; // can't check without bounds
          }
          return !d.isBefore(rs) && !d.isAfter(ld);
        };

    // 4. weekdaySchedules.
    JsonNode weekdaySchedules = year.get("weekdaySchedules");
    if (weekdaySchedules != null && weekdaySchedules.isObject()) {
      Iterator<Map.Entry<String, JsonNode>> it = weekdaySchedules.fields();
      while (it.hasNext()) {
        Map.Entry<String, JsonNode> e = it.next();
        String day = e.getKey();
        JsonNode name = e.getValue();
        if (!VALID_WEEKDAYS.contains(day)) {
          errors.add(label + ": weekdaySchedules key \"" + day + "\" is not a valid weekday name");
        }
        if (!name.isTextual() || schedules.get(name.asText()) == null) {
          errors.add(
              label + ": weekdaySchedules." + day + " references unknown schedule \""
                  + name.asText() + "\"");
        }
      }
    }

    // dates.
    JsonNode dates = year.get("dates");
    if (dates != null && dates.isObject()) {
      Iterator<Map.Entry<String, JsonNode>> it = dates.fields();
      while (it.hasNext()) {
        Map.Entry<String, JsonNode> e = it.next();
        String key = e.getKey();
        JsonNode value = e.getValue();
        if (tryParseDate(key) == null) {
          errors.add(label + ": dates key \"" + key + "\" is not a valid date");
        } else if (!inRange.test(key)) {
          errors.add(label + ": dates key \"" + key + "\" is outside the calendar year range");
        }
        if (value.isTextual()) {
          if (schedules.get(value.asText()) == null) {
            errors.add(
                label + ": dates." + key + " references unknown schedule \"" + value.asText()
                    + "\"");
          }
        } else if (!value.isArray()) {
          errors.add(
              label + ": dates." + key + " must be a schedule name or an array of periods");
        }
      }
    }

    // holidays.
    for (String d : stringArray(year.get("holidays"))) {
      if (!inRange.test(d)) {
        errors.add(label + ": holiday \"" + d + "\" is outside the calendar year range");
      }
    }

    // teacherWorkDays.
    for (String d : stringArray(year.get("teacherWorkDays"))) {
      if (!inRange.test(d)) {
        errors.add(label + ": teacherWorkDay \"" + d + "\" is outside the calendar year range");
      }
    }

    // breakNames.
    JsonNode breakNames = year.get("breakNames");
    if (breakNames != null && breakNames.isObject()) {
      Iterator<String> it = breakNames.fieldNames();
      while (it.hasNext()) {
        String key = it.next();
        if (!inRange.test(key)) {
          errors.add(label + ": breakNames key \"" + key + "\" is outside the calendar year range");
        }
      }
    }

    // nonClassDays.
    Set<String> holidaySet = new LinkedHashSet<>(stringArray(year.get("holidays")));
    JsonNode nonClassDays = year.get("nonClassDays");
    if (nonClassDays != null && nonClassDays.isObject()) {
      Iterator<Map.Entry<String, JsonNode>> it = nonClassDays.fields();
      while (it.hasNext()) {
        Map.Entry<String, JsonNode> e = it.next();
        String key = e.getKey();
        JsonNode value = e.getValue();
        LocalDate d = tryParseDate(key);
        if (d == null) {
          errors.add(label + ": nonClassDays key \"" + key + "\" is not a valid date");
          continue;
        }
        if (!inRange.test(key)) {
          errors.add(label + ": nonClassDays key \"" + key + "\" is outside the calendar year range");
          continue;
        }
        int dow = d.getDayOfWeek().getValue();
        if (dow == 6 || dow == 7) {
          errors.add(label + ": nonClassDays date \"" + key + "\" falls on a weekend");
        } else if (holidaySet.contains(key)) {
          errors.add(label + ": nonClassDays date \"" + key + "\" is also a holiday");
        } else if (dates == null || dates.get(key) == null) {
          errors.add(
              label + ": nonClassDays date \"" + key
                  + "\" has no entry in dates (uses NORMAL schedule)");
        }
        if (!value.isTextual() || value.asText().isEmpty()) {
          errors.add(label + ": nonClassDays." + key + " must be a non-empty string label");
        }
      }
    }

    // 5. Validate period times in all schedules and inline date overrides.
    List<ScheduleEntry> allSchedules = new ArrayList<>();
    Iterator<Map.Entry<String, JsonNode>> sit = schedules.fields();
    while (sit.hasNext()) {
      Map.Entry<String, JsonNode> e = sit.next();
      if (e.getValue().isArray()) {
        allSchedules.add(new ScheduleEntry(e.getValue(), label + " schedules." + e.getKey()));
      }
    }
    if (dates != null && dates.isObject()) {
      Iterator<Map.Entry<String, JsonNode>> dit = dates.fields();
      while (dit.hasNext()) {
        Map.Entry<String, JsonNode> e = dit.next();
        if (e.getValue().isArray()) {
          allSchedules.add(new ScheduleEntry(e.getValue(), label + " dates." + e.getKey()));
        }
      }
    }

    for (ScheduleEntry entry : allSchedules) {
      errors.addAll(validatePeriodTimes(entry.periods, entry.label));
      OverlapResult overlap = validateNoOverlap(entry.periods, entry.label);
      errors.addAll(overlap.errors);
      warnings.addAll(overlap.warnings);
    }

    return new YearResult(errors, warnings);
  }

  // ─── Period time validation ────────────────────────────────────────────────────

  private static List<String> validatePeriodTimes(JsonNode periods, String label) {
    List<String> errors = new ArrayList<>();
    LocalTime lastTime = null;

    for (JsonNode p : periods) {
      String start = textOrNull(p, "start");
      String end = textOrNull(p, "end");
      String name = text(p, "name", null);

      if (start == null || start.isEmpty() || end == null || end.isEmpty()) {
        errors.add(label + ": period \"" + name + "\" missing start or end");
        continue;
      }

      boolean optional = hasTag(p, "optional");
      DateTimes.ParsedTime startParsed = DateTimes.parsePlainTime(start, lastTime);
      if (startParsed.ambiguous()) {
        errors.add(label + ": period \"" + name + "\" start time \"" + start + "\" is ambiguous");
      }

      DateTimes.ParsedTime endParsed = DateTimes.parsePlainTime(end, startParsed.time());
      if (endParsed.ambiguous()) {
        errors.add(label + ": period \"" + name + "\" end time \"" + end + "\" is ambiguous");
      }

      int startMs = startParsed.time().getHour() * 60 + startParsed.time().getMinute();
      int endMs = endParsed.time().getHour() * 60 + endParsed.time().getMinute();
      if (startMs >= endMs) {
        errors.add(
            label + ": period \"" + name + "\" start (" + start + ") is not before end ("
                + end + ")");
      }

      if (!optional) {
        lastTime = endParsed.time();
      }
    }

    return errors;
  }

  private record OverlapResult(List<String> errors, List<String> warnings) {}

  private record TimedPeriod(String name, LocalTime start, LocalTime end) {}

  private static OverlapResult validateNoOverlap(JsonNode periods, String label) {
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();

    List<TimedPeriod> studentPeriods = new ArrayList<>();
    List<TimedPeriod> teacherPeriods = new ArrayList<>();
    LocalTime lastTime = null;

    for (JsonNode p : periods) {
      String start = textOrNull(p, "start");
      String end = textOrNull(p, "end");
      if (start == null || start.isEmpty() || end == null || end.isEmpty()) {
        continue;
      }

      boolean optional = hasTag(p, "optional");
      LocalTime startTime = DateTimes.parsePlainTime(start, lastTime).time();
      LocalTime endTime = DateTimes.parsePlainTime(end, startTime).time();

      if (!optional) {
        lastTime = endTime;
        TimedPeriod entry = new TimedPeriod(text(p, "name", null), startTime, endTime);
        if (p.has("teachers") && p.get("teachers").asBoolean(false)) {
          teacherPeriods.add(entry);
        } else {
          studentPeriods.add(entry);
        }
      }
    }

    // Student vs student: errors.
    for (int i = 0; i < studentPeriods.size(); i++) {
      for (int j = i + 1; j < studentPeriods.size(); j++) {
        if (overlaps(studentPeriods.get(i), studentPeriods.get(j))) {
          errors.add(
              label + ": periods \"" + studentPeriods.get(i).name() + "\" and \""
                  + studentPeriods.get(j).name() + "\" overlap");
        }
      }
    }

    // Teacher vs student: warnings.
    for (TimedPeriod t : teacherPeriods) {
      for (TimedPeriod s : studentPeriods) {
        if (overlaps(t, s)) {
          warnings.add(
              label + ": teacher period \"" + t.name() + "\" overlaps student period \""
                  + s.name() + "\"");
        }
      }
    }

    return new OverlapResult(errors, warnings);
  }

  private static boolean overlaps(TimedPeriod a, TimedPeriod b) {
    int aStart = a.start().getHour() * 60 + a.start().getMinute();
    int aEnd = a.end().getHour() * 60 + a.end().getMinute();
    int bStart = b.start().getHour() * 60 + b.start().getMinute();
    int bEnd = b.end().getHour() * 60 + b.end().getMinute();
    return aStart < bEnd && bStart < aEnd;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────────

  private record ScheduleEntry(JsonNode periods, String label) {}

  @FunctionalInterface
  private interface InRange {
    boolean test(String dateStr);
  }

  private static boolean isValidTimezone(String tz) {
    try {
      ZoneId.of(tz);
      return true;
    } catch (RuntimeException e) {
      return false;
    }
  }

  private static LocalDate tryParseDate(String str) {
    if (str == null) {
      return null;
    }
    try {
      return DateTimes.parsePlainDate(str);
    } catch (RuntimeException e) {
      return null;
    }
  }

  private static boolean hasTag(JsonNode period, String tag) {
    JsonNode tags = period.get("tags");
    if (tags == null || !tags.isArray()) {
      return false;
    }
    for (JsonNode t : tags) {
      if (tag.equals(t.asText())) {
        return true;
      }
    }
    return false;
  }

  private static boolean isFalsy(JsonNode node) {
    if (node == null || node.isNull()) {
      return true;
    }
    if (node.isTextual()) {
      return node.asText().isEmpty();
    }
    if (node.isBoolean()) {
      return !node.asBoolean();
    }
    if (node.isNumber()) {
      return node.asDouble() == 0;
    }
    return false; // objects and arrays are truthy
  }

  private static List<String> stringArray(JsonNode node) {
    List<String> list = new ArrayList<>();
    if (node != null && node.isArray()) {
      for (JsonNode v : node) {
        list.add(v.asText());
      }
    }
    return list;
  }

  private static String text(JsonNode node, String field, String fallback) {
    JsonNode v = node.get(field);
    return (v == null || v.isNull()) ? fallback : v.asText();
  }

  private static String textOrNull(JsonNode node, String field) {
    JsonNode v = node.get(field);
    return (v == null || v.isNull() || !v.isTextual()) ? null : v.asText();
  }
}

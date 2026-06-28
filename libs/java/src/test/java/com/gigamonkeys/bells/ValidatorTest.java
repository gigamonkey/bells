package com.gigamonkeys.bells;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.function.Consumer;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class ValidatorTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  // Unambiguous 24-hour times throughout, mirroring validate.test.js.
  private static final String VALID_DATA =
      """
      [{
        "year": "2025-2026",
        "id": "test",
        "name": "Test School",
        "timezone": "America/Los_Angeles",
        "firstDay": "2025-08-13",
        "firstDayTeachers": "2025-08-11",
        "lastDay": "2026-06-04",
        "schedules": {
          "NORMAL": [
            { "name": "Period 0",   "start": "13:00", "end": "13:30", "tags": ["optional", "zero"] },
            { "name": "Period 1",   "start": "13:35", "end": "14:05" },
            { "name": "Period 2",   "start": "14:10", "end": "14:40" },
            { "name": "Period 3",   "start": "14:45", "end": "15:15" },
            { "name": "Lunch",      "start": "15:20", "end": "15:50" },
            { "name": "Period 4",   "start": "15:55", "end": "16:25" },
            { "name": "Period 5",   "start": "16:30", "end": "17:00" },
            { "name": "Period 6",   "start": "17:05", "end": "17:35" },
            { "name": "Period 7",   "start": "17:40", "end": "18:10", "tags": ["optional", "seventh"] },
            { "name": "Period Ext", "start": "17:40", "end": "18:30", "tags": ["optional", "ext"] }
          ],
          "LATE_START": [
            { "name": "Staff meeting", "start": "13:00", "end": "14:00", "teachers": true },
            { "name": "Period 1",      "start": "14:10", "end": "14:50" },
            { "name": "Period 2",      "start": "14:55", "end": "15:35" },
            { "name": "Period 3",      "start": "15:40", "end": "16:20" },
            { "name": "Lunch",         "start": "16:25", "end": "16:55" },
            { "name": "Period 4",      "start": "17:00", "end": "17:40" },
            { "name": "Period 5",      "start": "17:45", "end": "18:25" },
            { "name": "Period 6",      "start": "18:30", "end": "19:10" }
          ]
        },
        "weekdaySchedules": { "monday": "LATE_START" },
        "holidays": ["2025-09-01", "2025-11-27"],
        "teacherWorkDays": [],
        "breakNames": { "2025-11-26": "Thanksgiving Break" }
      }]
      """;

  private static JsonNode validData() {
    return CalendarData.readTree(VALID_DATA);
  }

  /** Deep-clone VALID_DATA and apply a patch to its single year object. */
  private static JsonNode withPatch(Consumer<ObjectNode> patch) {
    JsonNode clone = validData().deepCopy();
    patch.accept((ObjectNode) clone.get(0));
    return clone;
  }

  private static ArrayNode arr(String json) {
    try {
      return (ArrayNode) MAPPER.readTree(json);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private static ObjectNode obj(String json) {
    try {
      return (ObjectNode) MAPPER.readTree(json);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private static boolean anyError(ValidationResult r, String needle) {
    return r.errors().stream().anyMatch(e -> e.contains(needle));
  }

  // ─── valid data ───────────────────────────────────────────────────────────────

  @Nested
  class ValidData {

    @Test
    void fixtureIsValid() {
      ValidationResult r = Validator.validate(validData());
      assertTrue(r.valid());
      assertTrue(r.errors().isEmpty());
    }

    @Test
    void acceptsSingleObject() {
      assertTrue(Validator.validate(validData().get(0)).valid());
    }
  }

  // ─── missing required fields ───────────────────────────────────────────────────

  @Nested
  class MissingFields {

    @Test
    void eachRequiredFieldReported() {
      for (String field : new String[] {"year", "id", "name", "timezone", "firstDay", "lastDay", "schedules"}) {
        JsonNode data = withPatch(o -> o.remove(field));
        ValidationResult r = Validator.validate(data);
        assertFalse(r.valid(), field);
        assertTrue(anyError(r, field), field);
      }
    }

    @Test
    void missingNormal() {
      JsonNode data = withPatch(o -> ((ObjectNode) o.get("schedules")).remove("NORMAL"));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "NORMAL"));
    }
  }

  // ─── weekdaySchedules ───────────────────────────────────────────────────────────

  @Nested
  class WeekdaySchedules {

    @Test
    void unknownSchedule() {
      JsonNode data = withPatch(o -> o.set("weekdaySchedules", obj("{\"monday\":\"BOGUS\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "BOGUS"));
    }

    @Test
    void invalidWeekdayKey() {
      JsonNode data = withPatch(o -> o.set("weekdaySchedules", obj("{\"funday\":\"NORMAL\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "funday"));
    }

    @Test
    void saturdayNotAllowed() {
      JsonNode data = withPatch(o -> o.set("weekdaySchedules", obj("{\"saturday\":\"NORMAL\"}")));
      assertFalse(Validator.validate(data).valid());
    }

    @Test
    void missingIsValid() {
      JsonNode data = withPatch(o -> o.remove("weekdaySchedules"));
      assertTrue(Validator.validate(data).valid());
    }
  }

  // ─── dates ──────────────────────────────────────────────────────────────────────

  @Nested
  class Dates {

    @Test
    void inlinePeriodArrayValid() {
      JsonNode data = withPatch(o -> o.set("dates",
          obj("{\"2025-09-15\":[{\"name\":\"X\",\"start\":\"13:00\",\"end\":\"14:00\"}]}")));
      assertTrue(Validator.validate(data).valid());
    }

    @Test
    void inlineArrayWithAmTimesValid() {
      // AM-style times (e.g. "8:30") inside a dates inline override parse correctly.
      JsonNode data = withPatch(o -> o.set("dates",
          obj("{\"2025-09-15\":[{\"name\":\"Assembly\",\"start\":\"8:30\",\"end\":\"15:33\"}]}")));
      assertTrue(Validator.validate(data).valid());
    }

    @Test
    void scheduleNameReferenceValid() {
      JsonNode data = withPatch(o -> o.set("dates", obj("{\"2025-09-15\":\"LATE_START\"}")));
      assertTrue(Validator.validate(data).valid());
    }

    @Test
    void unknownScheduleReference() {
      JsonNode data = withPatch(o -> o.set("dates", obj("{\"2025-09-15\":\"BOGUS\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "BOGUS"));
    }

    @Test
    void outOfRange() {
      JsonNode data = withPatch(o -> o.set("dates", obj("{\"2024-01-01\":\"NORMAL\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "2024-01-01"));
    }

    @Test
    void inlineBadTimes() {
      JsonNode data = withPatch(o -> o.set("dates",
          obj("{\"2025-09-15\":[{\"name\":\"Bad\",\"start\":\"14:00\",\"end\":\"13:00\"}]}")));
      assertFalse(Validator.validate(data).valid());
    }
  }

  // ─── timezone / firstDayTeachers ──────────────────────────────────────────────────

  @Nested
  class TimezoneAndTeachers {

    @Test
    void bogusTimezone() {
      JsonNode data = withPatch(o -> o.put("timezone", "Not/ATimezone"));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(r.errors().stream().anyMatch(e -> e.toLowerCase().contains("timezone")));
    }

    @Test
    void firstDayTeachersAfterFirstDay() {
      JsonNode data = withPatch(o -> o.put("firstDayTeachers", "2025-08-20"));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "firstDayTeachers"));
    }

    @Test
    void firstDayTeachersSameAsFirstDay() {
      JsonNode data = withPatch(o -> o.put("firstDayTeachers", "2025-08-13"));
      assertTrue(Validator.validate(data).valid());
    }

    @Test
    void firstDayTeachersBeforeFirstDay() {
      JsonNode data = withPatch(o -> o.put("firstDayTeachers", "2025-08-11"));
      assertTrue(Validator.validate(data).valid());
    }
  }

  // ─── date range checks ────────────────────────────────────────────────────────────

  @Nested
  class DateRange {

    @Test
    void holidayBeforeFirstDayTeachers() {
      JsonNode data = withPatch(o -> o.set("holidays", arr("[\"2025-08-01\"]")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(r.errors().stream().anyMatch(e -> e.contains("holiday") && e.contains("2025-08-01")));
    }

    @Test
    void holidayAfterLastDay() {
      JsonNode data = withPatch(o -> o.set("holidays", arr("[\"2027-01-01\"]")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(r.errors().stream().anyMatch(e -> e.contains("holiday") && e.contains("2027-01-01")));
    }

    @Test
    void holidayWithinRange() {
      JsonNode data = withPatch(o -> o.set("holidays", arr("[\"2025-09-01\"]")));
      assertTrue(Validator.validate(data).valid());
    }

    @Test
    void breakNamesKeyOutsideRange() {
      JsonNode data = withPatch(o -> o.set("breakNames", obj("{\"2024-12-25\":\"Winter Break\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "2024-12-25"));
    }
  }

  // ─── period time validation ───────────────────────────────────────────────────────

  @Nested
  class PeriodTimes {

    @Test
    void ambiguousTime() {
      JsonNode data = withPatch(o -> ((ObjectNode) o.get("schedules")).set("NORMAL", arr(
          "[{\"name\":\"Late\",\"start\":\"20:00\",\"end\":\"20:30\"},"
              + "{\"name\":\"Trouble\",\"start\":\"7:00\",\"end\":\"8:00\"}]")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "ambiguous"));
    }

    @Test
    void startAfterEnd() {
      JsonNode data = withPatch(o -> ((ObjectNode) o.get("schedules")).set("NORMAL",
          arr("[{\"name\":\"Bad period\",\"start\":\"14:00\",\"end\":\"13:00\"}]")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(r.errors().stream().anyMatch(e -> e.contains("Bad period") && e.contains("not before")));
    }

    @Test
    void startEqualsEnd() {
      JsonNode data = withPatch(o -> ((ObjectNode) o.get("schedules")).set("NORMAL",
          arr("[{\"name\":\"Zero duration\",\"start\":\"14:00\",\"end\":\"14:00\"}]")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "Zero duration"));
    }
  }

  // ─── overlapping periods ───────────────────────────────────────────────────────────

  @Nested
  class Overlaps {

    @Test
    void overlappingNonOptional() {
      JsonNode data = withPatch(o -> ((ObjectNode) o.get("schedules")).set("NORMAL", arr(
          "[{\"name\":\"Period A\",\"start\":\"13:00\",\"end\":\"14:30\"},"
              + "{\"name\":\"Period B\",\"start\":\"14:00\",\"end\":\"15:00\"}]")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "overlap"));
    }

    @Test
    void optionalSameTimeNoOverlap() {
      assertTrue(Validator.validate(validData()).valid());
    }

    @Test
    void adjacentPeriodsNoOverlap() {
      JsonNode data = withPatch(o -> ((ObjectNode) o.get("schedules")).set("NORMAL", arr(
          "[{\"name\":\"Period A\",\"start\":\"13:00\",\"end\":\"14:00\"},"
              + "{\"name\":\"Period B\",\"start\":\"14:00\",\"end\":\"15:00\"}]")));
      ValidationResult r = Validator.validate(data);
      assertTrue(r.errors().stream().noneMatch(e -> e.contains("overlap")));
    }
  }

  // ─── nonClassDays ──────────────────────────────────────────────────────────────────

  @Nested
  class NonClassDaysValidation {

    @Test
    void allValid() {
      JsonNode data = withPatch(o -> {
        o.set("dates", obj("{\"2026-06-01\":\"NORMAL\",\"2026-06-04\":\"NORMAL\"}"));
        o.set("nonClassDays", obj("{\"2026-06-01\":\"exam\",\"2026-06-04\":\"bonus\"}"));
      });
      ValidationResult r = Validator.validate(data);
      assertTrue(r.valid(), r.errors().toString());
    }

    @Test
    void invalidDateString() {
      JsonNode data = withPatch(o -> {
        o.set("dates", obj("{\"not-a-date\":\"NORMAL\"}"));
        o.set("nonClassDays", obj("{\"not-a-date\":\"exam\"}"));
      });
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "not-a-date"));
    }

    @Test
    void outOfRange() {
      JsonNode data = withPatch(o -> o.set("nonClassDays", obj("{\"2024-01-01\":\"exam\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "2024-01-01"));
    }

    @Test
    void weekendDate() {
      JsonNode data = withPatch(o -> o.set("nonClassDays", obj("{\"2025-09-06\":\"exam\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "weekend"));
    }

    @Test
    void holidayDate() {
      JsonNode data = withPatch(o -> o.set("nonClassDays", obj("{\"2025-09-01\":\"exam\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "holiday"));
    }

    @Test
    void notInDatesMap() {
      JsonNode data = withPatch(o -> o.set("nonClassDays", obj("{\"2025-08-19\":\"exam\"}")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "NORMAL schedule"));
    }

    @Test
    void nonStringLabel() {
      JsonNode data = withPatch(o -> {
        o.set("dates", obj("{\"2026-06-01\":\"NORMAL\"}"));
        o.set("nonClassDays", obj("{\"2026-06-01\":42}"));
      });
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "non-empty string"));
    }

    @Test
    void emptyStringLabel() {
      JsonNode data = withPatch(o -> {
        o.set("dates", obj("{\"2026-06-01\":\"NORMAL\"}"));
        o.set("nonClassDays", obj("{\"2026-06-01\":\"\"}"));
      });
      assertFalse(Validator.validate(data).valid());
    }

    @Test
    void missingIsValid() {
      JsonNode data = withPatch(o -> o.remove("nonClassDays"));
      assertTrue(Validator.validate(data).valid());
    }
  }

  // ─── edge cases ────────────────────────────────────────────────────────────────────

  @Nested
  class EdgeCases {

    @Test
    void nullData() {
      ValidationResult r = Validator.validate(null);
      assertFalse(r.valid());
      assertFalse(r.errors().isEmpty());
    }

    @Test
    void emptyArray() {
      ValidationResult r = Validator.validate(arr("[]"));
      assertFalse(r.valid());
      assertFalse(r.errors().isEmpty());
    }

    @Test
    void multipleYearsSecondReported() {
      JsonNode first = validData().get(0);
      ObjectNode second = (ObjectNode) first.deepCopy();
      second.put("year", "2026-2027");
      second.put("timezone", "Bad/Zone");
      ArrayNode array = MAPPER.createArrayNode();
      array.add(first.deepCopy());
      array.add(second);
      ValidationResult r = Validator.validate(array);
      assertFalse(r.valid());
      assertTrue(r.errors().stream().anyMatch(e -> e.contains("timezone") || e.contains("Bad/Zone")));
    }
  }

  // ─── malformed input ────────────────────────────────────────────────────────────

  @Nested
  class MalformedInput {

    @Test
    void nonObjectArrayElementReportsMissingFields() {
      ValidationResult r = Validator.validate(arr("[42]"));
      assertFalse(r.valid());
      assertTrue(anyError(r, "missing required field \"year\""));
      assertTrue(anyError(r, "missing required field \"schedules\""));
    }

    @Test
    void nonObjectElementAlongsideValid() {
      ArrayNode array = MAPPER.createArrayNode();
      array.add(validData().get(0).deepCopy());
      array.add("not a year");
      ValidationResult r = Validator.validate(array);
      assertFalse(r.valid());
      assertTrue(r.errors().stream()
          .anyMatch(e -> e.contains("Year 1") && e.contains("missing required field")));
    }

    @Test
    void emptyObjectSchedulesIsPresentNotMissing() {
      JsonNode data = withPatch(o -> o.set("schedules", MAPPER.createObjectNode()));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "missing schedules.NORMAL"));
      assertFalse(anyError(r, "missing required field \"schedules\""));
    }

    @Test
    void malformedContainerDoesNotThrow() {
      JsonNode data = withPatch(o -> o.put("weekdaySchedules", 42));
      ValidationResult r = Validator.validate(data);
      assertNotNull(r);
    }

    @Test
    void emptyYearLabelledUnknown() {
      // An empty-string year falls back to "unknown" in the message label.
      JsonNode data = withPatch(o -> o.put("year", ""));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "Year 0 (unknown)"));
    }

    @Test
    void mixedIdsReportedInInsertionOrder() {
      ArrayNode array = MAPPER.createArrayNode();
      for (String id : new String[] {"aaa", "bbb", "ccc"}) {
        ObjectNode y = (ObjectNode) validData().get(0).deepCopy();
        y.put("id", id);
        array.add(y);
      }
      ValidationResult r = Validator.validate(array);
      assertFalse(r.valid());
      assertTrue(r.errors().contains("Calendar array mixes multiple ids: \"aaa\", \"bbb\", \"ccc\""));
    }
  }

  // ─── annotations ────────────────────────────────────────────────────────────────

  private static boolean anyWarning(ValidationResult r, String needle) {
    return r.warnings().stream().anyMatch(w -> w.contains(needle));
  }

  @Nested
  class AnnotationsTests {

    @Test
    void validBlock() {
      JsonNode data =
          withPatch(
              o ->
                  o.set(
                      "annotations",
                      obj(
                          """
                          {
                            "ranges": {
                              "apExams": { "start": "2026-05-04", "end": "2026-05-15",
                                           "label": "AP Exams", "kind": "testing" }
                            },
                            "weeks": { "3": { "label": "Q1 progress", "kind": "gradingClose" } },
                            "dates": { "2026-03-14": { "label": "Pi Day" } }
                          }
                          """)));
      ValidationResult r = Validator.validate(data);
      assertTrue(r.valid(), r.errors().toString());
      assertTrue(r.warnings().isEmpty());
    }

    @Test
    void missingAnnotationsValid() {
      JsonNode data = withPatch(o -> o.remove("annotations"));
      assertTrue(Validator.validate(data).valid());
    }

    @Test
    void rangeOutOfRangeStart() {
      JsonNode data =
          withPatch(
              o ->
                  o.set(
                      "annotations",
                      obj("{ \"ranges\": { \"x\": { \"start\": \"2024-01-01\", \"end\": \"2026-05-15\" } } }")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "2024-01-01"));
    }

    @Test
    void rangeStartAfterEnd() {
      JsonNode data =
          withPatch(
              o ->
                  o.set(
                      "annotations",
                      obj("{ \"ranges\": { \"x\": { \"start\": \"2026-05-15\", \"end\": \"2026-05-04\" } } }")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "after end"));
    }

    @Test
    void nonIntegerWeekKey() {
      JsonNode data =
          withPatch(o -> o.set("annotations", obj("{ \"weeks\": { \"foo\": { \"label\": \"X\" } } }")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "integer"));
    }

    @Test
    void overflowWeekKeyWarns() {
      JsonNode data =
          withPatch(o -> o.set("annotations", obj("{ \"weeks\": { \"999\": { \"label\": \"Way off\" } } }")));
      ValidationResult r = Validator.validate(data);
      assertTrue(r.valid(), r.errors().toString());
      assertTrue(anyWarning(r, "exceeds"));
    }

    @Test
    void dateOutOfRange() {
      JsonNode data =
          withPatch(o -> o.set("annotations", obj("{ \"dates\": { \"2024-01-01\": { \"label\": \"X\" } } }")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "2024-01-01"));
    }

    @Test
    void weekendDateAllowed() {
      // 2025-09-06 is a Saturday
      JsonNode data =
          withPatch(
              o ->
                  o.set(
                      "annotations",
                      obj("{ \"dates\": { \"2025-09-06\": { \"label\": \"Weekend thing\" } } }")));
      assertTrue(Validator.validate(data).valid());
    }

    @Test
    void nonObjectPayload() {
      JsonNode data =
          withPatch(
              o -> o.set("annotations", obj("{ \"dates\": { \"2026-03-14\": \"just a string\" } }")));
      ValidationResult r = Validator.validate(data);
      assertFalse(r.valid());
      assertTrue(anyError(r, "must be an object"));
    }

    @Test
    void unknownBucketWarns() {
      JsonNode data =
          withPatch(o -> o.set("annotations", obj("{ \"bogus\": { \"whatever\": true } }")));
      ValidationResult r = Validator.validate(data);
      assertTrue(r.valid());
      assertTrue(anyWarning(r, "unknown bucket"));
    }
  }
}

package com.gigamonkeys.bells;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.gigamonkeys.bells.DateTimes.ParsedTime;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class DateTimesTest {

  private static final ZoneId LA = ZoneId.of("America/Los_Angeles");

  private static LocalTime pt(int hour, int minute) {
    return LocalTime.of(hour, minute);
  }

  private static Instant instant(String isoLocal) {
    return java.time.LocalDateTime.parse(isoLocal).atZone(LA).toInstant();
  }

  @Nested
  class ParsePlainTime {

    @Test
    void hour13WithNullPreviousUnambiguous() {
      ParsedTime r = DateTimes.parsePlainTime("13:25", null);
      assertEquals(13, r.time().getHour());
      assertEquals(25, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void hour15WithNullPreviousUnambiguous() {
      ParsedTime r = DateTimes.parsePlainTime("15:33", null);
      assertEquals(15, r.time().getHour());
      assertEquals(33, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void firstTimeAm() {
      ParsedTime r = DateTimes.parsePlainTime("8:30", null);
      assertEquals(8, r.time().getHour());
      assertEquals(30, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void amInferencePicksMinimum() {
      ParsedTime r = DateTimes.parsePlainTime("9:34", pt(8, 30));
      assertEquals(9, r.time().getHour());
      assertEquals(34, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void noonVsMidnightPicksNoon() {
      ParsedTime r = DateTimes.parsePlainTime("12:30", pt(11, 40));
      assertEquals(12, r.time().getHour());
      assertEquals(30, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void noonVsMidnightPicksMidnight() {
      ParsedTime r = DateTimes.parsePlainTime("12:00", pt(0, 0));
      assertEquals(0, r.time().getHour());
      assertEquals(0, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void unambiguousPmInference() {
      ParsedTime r = DateTimes.parsePlainTime("1:25", pt(12, 27));
      assertEquals(13, r.time().getHour());
      assertEquals(25, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void pmInferenceAfterResolvedPm() {
      ParsedTime r = DateTimes.parsePlainTime("2:29", pt(13, 31));
      assertEquals(14, r.time().getHour());
      assertEquals(29, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void pmInferenceLateAfternoon() {
      ParsedTime r = DateTimes.parsePlainTime("4:37", pt(15, 39));
      assertEquals(16, r.time().getHour());
      assertEquals(37, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void bothInterpretationsPickMinimum() {
      ParsedTime r = DateTimes.parsePlainTime("6:30", pt(5, 0));
      assertEquals(6, r.time().getHour());
      assertEquals(30, r.time().getMinute());
      assertFalse(r.ambiguous());
    }

    @Test
    void neitherInterpretationWorksIsAmbiguous() {
      ParsedTime r = DateTimes.parsePlainTime("7:00", pt(20, 0));
      assertTrue(r.ambiguous());
    }
  }

  @Nested
  class ResolveScheduleTimes {

    private List<PeriodData> normal() {
      return List.of(
          new PeriodData("Period 0", "7:26", "8:24", List.of("optional", "zero"), false),
          new PeriodData("Period 1", "8:30", "9:28", List.of(), false),
          new PeriodData("Period 2", "9:34", "10:37", List.of(), false),
          new PeriodData("Period 3", "10:43", "11:41", List.of(), false),
          new PeriodData("Lunch", "11:41", "12:21", List.of(), false),
          new PeriodData("Period 4", "12:27", "1:25", List.of(), false),
          new PeriodData("Period 5", "1:31", "2:29", List.of(), false),
          new PeriodData("Period 6", "2:35", "3:33", List.of(), false),
          new PeriodData("Period 7", "3:39", "4:37", List.of("optional", "seventh"), false),
          new PeriodData("Period Ext", "3:39", "5:09", List.of("optional", "ext"), false));
    }

    private Period byName(List<Period> ps, String name) {
      return ps.stream().filter(p -> p.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    void sameCount() {
      assertEquals(normal().size(), DateTimes.resolveScheduleTimes(normal()).size());
    }

    @Test
    void period1Start() {
      Period p1 = byName(DateTimes.resolveScheduleTimes(normal()), "Period 1");
      assertEquals(8, p1.start().getHour());
      assertEquals(30, p1.start().getMinute());
    }

    @Test
    void period4StartUnambiguousNoon() {
      Period p4 = byName(DateTimes.resolveScheduleTimes(normal()), "Period 4");
      assertEquals(12, p4.start().getHour());
      assertEquals(27, p4.start().getMinute());
    }

    @Test
    void period4EndPmInference() {
      Period p4 = byName(DateTimes.resolveScheduleTimes(normal()), "Period 4");
      assertEquals(13, p4.end().getHour());
      assertEquals(25, p4.end().getMinute());
    }

    @Test
    void period5Start() {
      Period p5 = byName(DateTimes.resolveScheduleTimes(normal()), "Period 5");
      assertEquals(13, p5.start().getHour());
      assertEquals(31, p5.start().getMinute());
    }

    @Test
    void period6End() {
      Period p6 = byName(DateTimes.resolveScheduleTimes(normal()), "Period 6");
      assertEquals(15, p6.end().getHour());
      assertEquals(33, p6.end().getMinute());
    }

    @Test
    void period7End() {
      Period p7 = byName(DateTimes.resolveScheduleTimes(normal()), "Period 7");
      assertEquals(16, p7.end().getHour());
      assertEquals(37, p7.end().getMinute());
    }

    @Test
    void preservesTags() {
      Period p0 = byName(DateTimes.resolveScheduleTimes(normal()), "Period 0");
      assertEquals(List.of("optional", "zero"), p0.tags());
    }
  }

  @Nested
  class DaysBetween {

    @Test
    void sameDay() {
      assertEquals(0, DateTimes.daysBetween(instant("2025-08-13T12:00:00"), instant("2025-08-13T15:00:00")));
    }

    @Test
    void oneDayApart() {
      assertEquals(1, DateTimes.daysBetween(instant("2025-08-13T12:00:00"), instant("2025-08-14T12:00:00")));
    }

    @Test
    void fiveDaysApart() {
      assertEquals(5, DateTimes.daysBetween(instant("2025-08-13T12:00:00"), instant("2025-08-18T12:00:00")));
    }

    @Test
    void acrossDstSpringForward() {
      Instant a = LocalDate.parse("2025-03-09").atTime(12, 0).atZone(LA).toInstant();
      Instant b = LocalDate.parse("2025-03-10").atTime(12, 0).atZone(LA).toInstant();
      assertEquals(1, DateTimes.daysBetween(a, b));
    }

    @Test
    void negativeDirection() {
      assertEquals(-2, DateTimes.daysBetween(instant("2025-08-15T12:00:00"), instant("2025-08-13T12:00:00")));
    }
  }

  @Nested
  class IncludesWeekend {

    @Test
    void monFriNoWeekend() {
      assertFalse(DateTimes.includesWeekend(instant("2025-08-18T16:00:00"), instant("2025-08-22T08:30:00"), LA));
    }

    @Test
    void spanIncludingSaturday() {
      assertTrue(DateTimes.includesWeekend(instant("2025-08-22T15:33:00"), instant("2025-08-25T08:30:00"), LA));
    }

    @Test
    void spanIncludingSunday() {
      Instant start = LocalDate.parse("2025-08-24").atTime(12, 0).atZone(LA).toInstant();
      Instant end = LocalDate.parse("2025-08-25").atTime(8, 30).atZone(LA).toInstant();
      assertTrue(DateTimes.includesWeekend(start, end, LA));
    }

    @Test
    void sameWeekdayNoWeekend() {
      assertFalse(DateTimes.includesWeekend(instant("2025-08-20T16:00:00"), instant("2025-08-20T17:00:00"), LA));
    }
  }
}

package com.gigamonkeys.bells;

import static com.gigamonkeys.bells.Fixtures.CALENDAR_DATA;
import static com.gigamonkeys.bells.Fixtures.LA;
import static com.gigamonkeys.bells.Fixtures.calendar;
import static com.gigamonkeys.bells.Fixtures.laInstant;
import static com.gigamonkeys.bells.Fixtures.pd;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class CalendarTest {

  private static Calendar makeCalendar() {
    return calendar(CALENDAR_DATA, Options.defaults());
  }

  private static Calendar makeCalendar(Options opts) {
    return calendar(CALENDAR_DATA, opts);
  }

  private static List<String> names(List<Period> ps) {
    return ps.stream().map(Period::name).collect(Collectors.toList());
  }

  // ─── normalizeIncludeTags ─────────────────────────────────────────────────────

  @Nested
  class NormalizeIncludeTags {

    @Test
    void flatArrayMapsToDays1Through5() {
      List<String> tags = List.of("zero", "seventh");
      Map<Integer, List<String>> result = Options.normalizeIncludeTags(tags);
      assertEquals(tags, result.get(1));
      assertEquals(tags, result.get(2));
      assertEquals(tags, result.get(3));
      assertEquals(tags, result.get(4));
      assertEquals(tags, result.get(5));
    }

    @Test
    void flatArrayNoEntriesForWeekend() {
      Map<Integer, List<String>> result = Options.normalizeIncludeTags(List.of("zero"));
      assertNull(result.get(6));
      assertNull(result.get(7));
    }

    @Test
    void nullFlatListGivesEmptyMap() {
      assertTrue(Options.normalizeIncludeTags((List<String>) null).isEmpty());
    }

    @Test
    void nullMapGivesEmptyMap() {
      assertTrue(Options.normalizeIncludeTags((Map<Integer, List<String>>) null).isEmpty());
    }
  }

  // ─── isSchoolDay / isHoliday ──────────────────────────────────────────────────

  @Nested
  class IsSchoolDay {

    @Test
    void wednesdayInTerm() {
      assertTrue(makeCalendar().isSchoolDay(pd("2025-08-13")));
    }

    @Test
    void saturday() {
      assertFalse(makeCalendar().isSchoolDay(pd("2025-08-16")));
    }

    @Test
    void sunday() {
      assertFalse(makeCalendar().isSchoolDay(pd("2025-08-17")));
    }

    @Test
    void holiday() {
      assertFalse(makeCalendar().isSchoolDay(pd("2025-09-01")));
    }
  }

  @Nested
  class IsHoliday {

    @Test
    void listedHoliday() {
      assertTrue(makeCalendar().isHoliday(pd("2025-09-01")));
    }

    @Test
    void nonHolidayWeekday() {
      assertFalse(makeCalendar().isHoliday(pd("2025-08-13")));
    }

    @Test
    void teacherWorkDayForTeacher() {
      String data = CALENDAR_DATA.replace(
          "\"teacherWorkDays\": []", "\"teacherWorkDays\": [\"2025-09-01\"]");
      Calendar cal = calendar(data, new Options(Options.TEACHER, Map.of()));
      assertFalse(cal.isHoliday(pd("2025-09-01")));
    }

    @Test
    void teacherWorkDayForStudentStillHoliday() {
      String data = CALENDAR_DATA.replace(
          "\"teacherWorkDays\": []", "\"teacherWorkDays\": [\"2025-09-01\"]");
      Calendar cal = calendar(data, Options.defaults());
      assertTrue(cal.isHoliday(pd("2025-09-01")));
    }
  }

  // ─── schedule(date) ───────────────────────────────────────────────────────────

  @Nested
  class ScheduleForDate {

    @Test
    void mondayLateStart() {
      Period first = makeCalendar().schedule(pd("2025-08-18")).firstPeriod();
      assertEquals("Period 1", first.name());
      assertEquals(LocalTime.of(10, 0), first.start());
    }

    @Test
    void tuesdayNormal() {
      Period first = makeCalendar().schedule(pd("2025-08-19")).firstPeriod();
      assertEquals("Period 1", first.name());
      assertEquals(LocalTime.of(8, 30), first.start());
    }

    @Test
    void inlineDateOverride() {
      String data = CALENDAR_DATA.replace(
          "\"weekdaySchedules\":",
          "\"dates\": { \"2025-08-19\": [ { \"name\": \"Assembly\", \"start\": \"9:00\", \"end\": \"10:00\" } ] },\n  \"weekdaySchedules\":");
      Calendar cal = calendar(data, Options.defaults());
      assertEquals("Assembly", cal.schedule(pd("2025-08-19")).firstPeriod().name());
    }

    @Test
    void withoutWeekdaySchedulesMondayFallsBackToNormal() {
      String data = CALENDAR_DATA.replace("\"weekdaySchedules\": { \"monday\": \"LATE_START\" }",
          "\"weekdaySchedules\": {}");
      Period first = calendar(data, Options.defaults()).schedule(pd("2025-08-18")).firstPeriod();
      assertEquals(LocalTime.of(8, 30), first.start());
    }

    @Test
    void namedDateOverrideUsesThatSchedule() {
      String data = CALENDAR_DATA
          .replace("\"schedules\": {",
              "\"schedules\": {\n      \"ASSEMBLY\": [ { \"name\": \"Assembly\", \"start\": \"9:00\","
                  + " \"end\": \"10:00\" } ],")
          .replace("\"weekdaySchedules\":",
              "\"dates\": { \"2025-08-19\": \"ASSEMBLY\" },\n  \"weekdaySchedules\":");
      Calendar cal = calendar(data, Options.defaults());
      assertEquals("Assembly", cal.schedule(pd("2025-08-19")).firstPeriod().name());
    }

    @Test
    void customWeekdayScheduleMapping() {
      String data = CALENDAR_DATA
          .replace("\"schedules\": {",
              "\"schedules\": {\n      \"ASSEMBLY\": [ { \"name\": \"Assembly\", \"start\": \"9:00\","
                  + " \"end\": \"10:00\" } ],")
          .replace("\"weekdaySchedules\": { \"monday\": \"LATE_START\" }",
              "\"weekdaySchedules\": { \"wednesday\": \"ASSEMBLY\" }");
      Calendar cal = calendar(data, Options.defaults());
      assertEquals("Assembly", cal.schedule(pd("2025-08-20")).firstPeriod().name()); // Wednesday
    }
  }

  // ─── startOfYear / endOfYear ──────────────────────────────────────────────────

  @Nested
  class YearBounds {

    @Test
    void startOfYearAt830() {
      ZonedDateTime zdt = makeCalendar().startOfYear().atZone(LA);
      assertEquals("2025-08-13", zdt.toLocalDate().toString());
      assertEquals(8, zdt.getHour());
      assertEquals(30, zdt.getMinute());
    }

    @Test
    void endOfYearAt1533() {
      ZonedDateTime zdt = makeCalendar().endOfYear().atZone(LA);
      assertEquals("2026-06-04", zdt.toLocalDate().toString());
      assertEquals(15, zdt.getHour());
      assertEquals(33, zdt.getMinute());
    }

    @Test
    void teacherStartOfYearOnFirstDayTeachers() {
      Calendar cal = calendar(CALENDAR_DATA, new Options(Options.TEACHER, Map.of()));
      ZonedDateTime zdt = cal.startOfYear().atZone(LA);
      // 2025-08-11 is a Monday → LATE_START; Staff meeting (teachers only) starts 8:03
      assertEquals("2025-08-11", zdt.toLocalDate().toString());
      assertEquals(8, zdt.getHour());
      assertEquals(3, zdt.getMinute());
    }
  }

  // ─── hasPeriod ────────────────────────────────────────────────────────────────

  @Nested
  class HasPeriod {

    private Schedule makeSched(Options opts) {
      return calendar(CALENDAR_DATA, opts).schedule(pd("2025-08-19")); // Tuesday
    }

    @Test
    void noTagsAlwaysIncluded() {
      Schedule sched = makeSched(Options.defaults());
      Period p = new Period("Period 1", LocalTime.of(8, 30), LocalTime.of(9, 28), List.of(), false);
      assertTrue(sched.hasPeriod(p));
    }

    @Test
    void optionalZeroIncludedWhenTagAllowed() {
      Schedule sched = makeSched(new Options(Options.STUDENT, Map.of(2, List.of("zero"))));
      Period p = new Period("Period 0", LocalTime.of(7, 26), LocalTime.of(8, 24), List.of("optional", "zero"), false);
      assertTrue(sched.hasPeriod(p));
    }

    @Test
    void optionalZeroExcludedWhenNotAllowed() {
      Schedule sched = makeSched(Options.defaults());
      Period p = new Period("Period 0", LocalTime.of(7, 26), LocalTime.of(8, 24), List.of("optional", "zero"), false);
      assertFalse(sched.hasPeriod(p));
    }

    @Test
    void seventhAllowedButExtNotAllowed() {
      // includeTags { 2: ["seventh"] }: Period 7 passes, Period Ext does not.
      Schedule sched = makeSched(new Options(Options.STUDENT, Map.of(2, List.of("seventh"))));
      Period p7 = new Period(
          "Period 7", LocalTime.of(15, 39), LocalTime.of(16, 37), List.of("optional", "seventh"), false);
      Period pExt = new Period(
          "Period Ext", LocalTime.of(15, 39), LocalTime.of(17, 9), List.of("optional", "ext"), false);
      assertTrue(sched.hasPeriod(p7));
      assertFalse(sched.hasPeriod(pExt));
    }

    @Test
    void optionalOnlyAlwaysExcluded() {
      Schedule sched = makeSched(new Options(Options.STUDENT, Map.of(2, List.of("zero", "seventh", "ext", "optional"))));
      Period p = new Period("Lunch-extra", LocalTime.of(12, 0), LocalTime.of(12, 30), List.of("optional"), false);
      assertFalse(sched.hasPeriod(p));
    }

    @Test
    void teacherPeriodForTeacher() {
      Schedule sched = makeSched(new Options(Options.TEACHER, Map.of()));
      Period p = new Period("Staff meeting", LocalTime.of(8, 3), LocalTime.of(9, 33), List.of(), true);
      assertTrue(sched.hasPeriod(p));
    }

    @Test
    void teacherPeriodForStudent() {
      Schedule sched = makeSched(Options.defaults());
      Period p = new Period("Staff meeting", LocalTime.of(8, 3), LocalTime.of(9, 33), List.of(), true);
      assertFalse(sched.hasPeriod(p));
    }
  }

  // ─── actualPeriods ────────────────────────────────────────────────────────────

  @Nested
  class ActualPeriods {

    @Test
    void studentNoIncludeTagsExcludesOptional() {
      List<String> ns = names(makeCalendar().schedule(pd("2025-08-19")).actualPeriods());
      assertFalse(ns.contains("Period 0"));
      assertFalse(ns.contains("Period 7"));
      assertFalse(ns.contains("Period Ext"));
    }

    @Test
    void mandatoryPeriodsIncluded() {
      List<String> ns = names(makeCalendar().schedule(pd("2025-08-19")).actualPeriods());
      assertTrue(ns.containsAll(
          List.of("Period 1", "Period 2", "Period 3", "Lunch", "Period 4", "Period 5", "Period 6")));
    }

    @Test
    void zeroIncludedWhenTagged() {
      Calendar cal = makeCalendar(new Options(Options.STUDENT, Map.of(2, List.of("zero"))));
      List<String> ns = names(cal.schedule(pd("2025-08-19")).actualPeriods());
      assertTrue(ns.contains("Period 0"));
    }

    @Test
    void firstAndLastWhenNoOptional() {
      Schedule sched = makeCalendar().schedule(pd("2025-08-19"));
      assertEquals("Period 1", sched.firstPeriod().name());
      assertEquals("Period 6", sched.lastPeriod().name());
    }
  }

  // ─── currentInterval ──────────────────────────────────────────────────────────

  @Nested
  class CurrentInterval {

    private static final String TUE = "2025-08-19";

    @Test
    void duringPeriod1() {
      Interval iv = makeCalendar().currentInterval(laInstant(TUE + "T08:45:00"));
      assertEquals(IntervalType.PERIOD, iv.type());
      assertEquals("Period 1", iv.name());
      assertTrue(iv.duringSchool());
    }

    @Test
    void duringPeriod3() {
      Interval iv = makeCalendar().currentInterval(laInstant(TUE + "T11:00:00"));
      assertEquals(IntervalType.PERIOD, iv.type());
      assertEquals("Period 3", iv.name());
    }

    @Test
    void duringLunch() {
      Interval iv = makeCalendar().currentInterval(laInstant(TUE + "T11:50:00"));
      assertEquals(IntervalType.PERIOD, iv.type());
      assertEquals("Lunch", iv.name());
    }

    @Test
    void passingBetweenPeriods() {
      Interval iv = makeCalendar().currentInterval(laInstant(TUE + "T09:30:00"));
      assertEquals(IntervalType.PASSING, iv.type());
      assertTrue(iv.name().contains("Passing to Period 2"));
    }

    @Test
    void beforeSchool() {
      Interval iv = makeCalendar().currentInterval(laInstant(TUE + "T07:00:00"));
      assertEquals(IntervalType.BEFORE_SCHOOL, iv.type());
      assertEquals("Before school", iv.name());
      assertFalse(iv.duringSchool());
    }

    @Test
    void afterSchool() {
      Interval iv = makeCalendar().currentInterval(laInstant(TUE + "T16:00:00"));
      assertEquals(IntervalType.AFTER_SCHOOL, iv.type());
      assertEquals("After school", iv.name());
      assertFalse(iv.duringSchool());
    }

    @Test
    void weekendIsBreak() {
      Interval iv = makeCalendar().currentInterval(laInstant("2025-08-16T12:00:00"));
      assertEquals(IntervalType.BREAK, iv.type());
      assertTrue(iv.name().contains("Weekend"));
    }

    @Test
    void mondayLateStartPeriod1() {
      Interval iv = makeCalendar().currentInterval(laInstant("2025-08-18T10:20:00"));
      assertEquals(IntervalType.PERIOD, iv.type());
      assertEquals("Period 1", iv.name());
    }
  }

  // ─── Interval.left / done ─────────────────────────────────────────────────────

  @Nested
  class IntervalLeftDone {

    @Test
    void left() {
      Interval iv = new Interval(
          "Period 1", laInstant("2025-08-19T08:30:00"), laInstant("2025-08-19T09:28:00"),
          true, IntervalType.PERIOD, List.of());
      assertEquals(28, iv.left(laInstant("2025-08-19T09:00:00")).toMinutes());
    }

    @Test
    void done() {
      Interval iv = new Interval(
          "Period 1", laInstant("2025-08-19T08:30:00"), laInstant("2025-08-19T09:28:00"),
          true, IntervalType.PERIOD, List.of());
      assertEquals(30, iv.done(laInstant("2025-08-19T09:00:00")).toMinutes());
    }

    @Test
    void leftPlusDoneEqualsTotal() {
      var start = laInstant("2025-08-19T08:30:00");
      var end = laInstant("2025-08-19T09:28:00");
      var now = laInstant("2025-08-19T09:00:00");
      Interval iv = new Interval("Period 1", start, end, true, IntervalType.PERIOD, List.of());
      long total = java.time.Duration.between(start, end).toMinutes();
      assertEquals(total, iv.left(now).toMinutes() + iv.done(now).toMinutes());
    }
  }

  // ─── nonClassDays ─────────────────────────────────────────────────────────────

  @Nested
  class NonClassDays {

    private static final String NON_CLASS_DATA = CALENDAR_DATA.replace(
        "\"weekdaySchedules\":",
        """
        "dates": {
          "2026-06-01": "NORMAL",
          "2026-06-02": "NORMAL",
          "2026-06-03": "NORMAL",
          "2026-06-04": "NORMAL"
        },
        "nonClassDays": {
          "2026-06-01": "exam",
          "2026-06-02": "exam",
          "2026-06-03": "exam",
          "2026-06-04": "bonus"
        },
        "weekdaySchedules":""");

    private Calendar makeCal() {
      return calendar(NON_CLASS_DATA, Options.defaults());
    }

    private List<String> dateStrings(List<NonClassDay> list) {
      return list.stream().map(d -> d.date().toString()).collect(Collectors.toList());
    }

    @Test
    void labelForListedDay() {
      assertEquals("exam", makeCal().nonClassLabel(pd("2026-06-01")));
      assertEquals("bonus", makeCal().nonClassLabel(pd("2026-06-04")));
    }

    @Test
    void labelNullForRegularDay() {
      assertNull(makeCal().nonClassLabel(pd("2025-08-19")));
    }

    @Test
    void labelNullWhenMissingEntirely() {
      assertNull(makeCalendar().nonClassLabel(pd("2026-06-01")));
    }

    @Test
    void beforeAnyNonClassDay() {
      List<NonClassDay> list = makeCal().nonClassDaysLeft(laInstant("2026-05-15T08:00:00"));
      assertEquals(List.of("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"), dateStrings(list));
      assertEquals(List.of("exam", "exam", "exam", "bonus"),
          list.stream().map(NonClassDay::label).collect(Collectors.toList()));
    }

    @Test
    void onNonClassDayBeforeEndIncludesIt() {
      List<NonClassDay> list = makeCal().nonClassDaysLeft(laInstant("2026-06-02T08:00:00"));
      assertEquals(List.of("2026-06-02", "2026-06-03", "2026-06-04"), dateStrings(list));
    }

    @Test
    void onNonClassDayAfterEndExcludesIt() {
      List<NonClassDay> list = makeCal().nonClassDaysLeft(laInstant("2026-06-02T17:00:00"));
      assertEquals(List.of("2026-06-03", "2026-06-04"), dateStrings(list));
    }

    @Test
    void afterLastNonClassDayEmpty() {
      assertTrue(makeCal().nonClassDaysLeft(laInstant("2026-06-04T18:00:00")).isEmpty());
    }

    @Test
    void emptyWhenNotDefined() {
      assertTrue(makeCalendar().nonClassDaysLeft(laInstant("2026-05-15T08:00:00")).isEmpty());
    }
  }
}

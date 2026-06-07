package com.gigamonkeys.bells;

import static com.gigamonkeys.bells.Fixtures.LA;
import static com.gigamonkeys.bells.Fixtures.SIMPLE_DATA;
import static com.gigamonkeys.bells.Fixtures.laInstant;
import static com.gigamonkeys.bells.Fixtures.pd;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class BellScheduleTest {

  private static BellSchedule make() {
    return new BellSchedule(CalendarData.parse(SIMPLE_DATA), Options.defaults());
  }

  // ─── nextSchoolDay ──────────────────────────────────────────────────────────

  @Nested
  class NextSchoolDay {

    @Test
    void skipsWeekend() {
      assertEquals(pd("2025-08-18"), make().nextSchoolDay(pd("2025-08-15")));
    }

    @Test
    void skipsHolidays() {
      assertEquals(pd("2025-09-02"), make().nextSchoolDay(pd("2025-08-29")));
    }

    @Test
    void skipsConsecutiveHolidaysAndWeekends() {
      assertEquals(pd("2025-12-01"), make().nextSchoolDay(pd("2025-11-26")));
    }

    @Test
    void fromSaturday() {
      assertEquals(pd("2025-08-18"), make().nextSchoolDay(pd("2025-08-16")));
    }
  }

  // ─── previousSchoolDay ──────────────────────────────────────────────────────

  @Nested
  class PreviousSchoolDay {

    @Test
    void skipsWeekend() {
      assertEquals(pd("2025-08-15"), make().previousSchoolDay(pd("2025-08-18")));
    }

    @Test
    void skipsHolidays() {
      assertEquals(pd("2025-08-29"), make().previousSchoolDay(pd("2025-09-02")));
    }

    @Test
    void skipsConsecutiveHolidaysAndWeekends() {
      assertEquals(pd("2025-11-26"), make().previousSchoolDay(pd("2025-12-01")));
    }
  }

  // ─── schoolDaysBetween ──────────────────────────────────────────────────────

  @Nested
  class SchoolDaysBetween {

    @Test
    void inclusiveBothEndpoints() {
      assertEquals(5, make().schoolDaysBetween(pd("2025-08-18"), pd("2025-08-22")));
    }

    @Test
    void singleSchoolDay() {
      assertEquals(1, make().schoolDaysBetween(pd("2025-08-13"), pd("2025-08-13")));
    }

    @Test
    void singleNonSchoolDay() {
      assertEquals(0, make().schoolDaysBetween(pd("2025-08-16"), pd("2025-08-16")));
    }

    @Test
    void adjacentSchoolDays() {
      assertEquals(2, make().schoolDaysBetween(pd("2025-08-13"), pd("2025-08-14")));
    }

    @Test
    void excludesHolidays() {
      assertEquals(3, make().schoolDaysBetween(pd("2025-08-29"), pd("2025-09-03")));
    }

    @Test
    void excludesWeekends() {
      assertEquals(2, make().schoolDaysBetween(pd("2025-08-15"), pd("2025-08-18")));
    }

    @Test
    void fullWeek() {
      assertEquals(6, make().schoolDaysBetween(pd("2025-08-18"), pd("2025-08-25")));
    }
  }

  // ─── scheduleFor ────────────────────────────────────────────────────────────

  @Nested
  class ScheduleFor {

    @Test
    void normalSchoolDay() {
      List<PeriodInstant> periods = make().scheduleFor(pd("2025-08-13"));
      assertEquals(2, periods.size());
      assertEquals("Period 1", periods.get(0).name());
      assertEquals("Period 2", periods.get(1).name());
    }

    @Test
    void lateStartMonday() {
      List<PeriodInstant> periods = make().scheduleFor(pd("2025-08-18"));
      assertEquals(2, periods.size());
      ZonedDateTime start = periods.get(0).start().atZone(LA);
      assertEquals(10, start.getHour());
      assertEquals(0, start.getMinute());
    }

    @Test
    void holidayEmpty() {
      assertTrue(make().scheduleFor(pd("2025-09-01")).isEmpty());
    }

    @Test
    void weekendEmpty() {
      assertTrue(make().scheduleFor(pd("2025-08-16")).isEmpty());
    }

    @Test
    void outsideCalendarEmpty() {
      assertTrue(make().scheduleFor(pd("2024-01-01")).isEmpty());
    }
  }

  // ─── nonClassDays ───────────────────────────────────────────────────────────

  @Nested
  class NonClassDays {

    private static final String NON_CLASS_DATA = SIMPLE_DATA.replace(
        "\"weekdaySchedules\":",
        """
        "dates": { "2026-06-01": "NORMAL", "2026-06-04": "NORMAL" },
        "nonClassDays": { "2026-06-01": "exam", "2026-06-04": "bonus" },
        "weekdaySchedules":""");

    private BellSchedule makeNc() {
      return new BellSchedule(CalendarData.parse(NON_CLASS_DATA), Options.defaults());
    }

    @Test
    void labelForListedDate() {
      assertEquals("exam", makeNc().nonClassLabel(pd("2026-06-01")));
      assertEquals("bonus", makeNc().nonClassLabel(pd("2026-06-04")));
    }

    @Test
    void labelNullForUnlistedDate() {
      org.junit.jupiter.api.Assertions.assertNull(makeNc().nonClassLabel(pd("2025-08-19")));
    }

    @Test
    void emptyLabelTreatedAsAbsent() {
      String data = NON_CLASS_DATA.replace("\"2026-06-01\": \"exam\"", "\"2026-06-01\": \"\"");
      BellSchedule bs = new BellSchedule(CalendarData.parse(data), Options.defaults());
      org.junit.jupiter.api.Assertions.assertNull(bs.nonClassLabel(pd("2026-06-01")));
    }

    @Test
    void daysLeftFromActiveCalendar() {
      List<NonClassDay> list = makeNc().nonClassDaysLeft(laInstant("2026-05-15T08:00:00"));
      assertEquals(2, list.size());
    }

    @Test
    void daysLeftEmptyOutsideAnyCalendar() {
      List<NonClassDay> list = makeNc().nonClassDaysLeft(laInstant("2030-01-01T08:00:00"));
      assertTrue(list.isEmpty());
    }
  }

  // ─── periodsForDate ─────────────────────────────────────────────────────────

  @Nested
  class PeriodsForDate {

    @Test
    void currentDayDuringSchool() {
      // Tuesday 2025-08-19 mid-morning → today's two periods.
      List<PeriodInstant> periods = make().periodsForDate(laInstant("2025-08-19T08:45:00"));
      List<String> ns = periods.stream().map(PeriodInstant::name).collect(Collectors.toList());
      assertEquals(List.of("Period 1", "Period 2"), ns);
    }

    @Test
    void afterSchoolRollsToNextDay() {
      // After Tuesday's end → Wednesday's periods.
      List<PeriodInstant> periods = make().periodsForDate(laInstant("2025-08-19T20:00:00"));
      ZonedDateTime start = periods.get(0).start().atZone(LA);
      assertEquals("2025-08-20", start.toLocalDate().toString());
    }
  }

  // ─── isSchoolDay ────────────────────────────────────────────────────────────

  @Nested
  class IsSchoolDay {

    @Test
    void schoolDay() {
      assertTrue(make().isSchoolDay(pd("2025-08-13")));
    }

    @Test
    void weekend() {
      assertFalse(make().isSchoolDay(pd("2025-08-16")));
    }

    @Test
    void holiday() {
      assertFalse(make().isSchoolDay(pd("2025-09-01")));
    }

    @Test
    void outsideRange() {
      assertFalse(make().isSchoolDay(pd("2024-01-01")));
    }

    @Test
    void noArgDefaultsToSystemLocalToday() {
      BellSchedule bs = make();
      assertEquals(bs.isSchoolDay(LocalDate.now()), bs.isSchoolDay());
    }

    @Test
    void zoneArgAnchorsTodayToZone() {
      BellSchedule bs = make();
      ZoneId la = ZoneId.of("America/Los_Angeles");
      assertEquals(bs.isSchoolDay(LocalDate.now(la)), bs.isSchoolDay(la));
    }
  }
}

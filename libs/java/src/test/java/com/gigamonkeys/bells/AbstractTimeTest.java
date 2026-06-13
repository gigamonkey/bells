package com.gigamonkeys.bells;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** Mirror of the TypeScript abstract-time.test.ts suite. */
class AbstractTimeTest {

  private static final ZoneId TZ = ZoneId.of("America/Los_Angeles");

  // A synthetic year with the interesting calendar shapes: a Monday holiday
  // (2025-10-13), a Thu–Fri holiday pair (Thanksgiving), a full vacation week
  // (2026-02-16..20), a schedule variant missing period 3 (SHORT), a day with
  // no numbered periods at all (ASSEMBLY), and non-numbered periods ("Lunch").
  private static final String CALENDAR_DATA =
      """
      {
        "year": "2025-2026",
        "timezone": "America/Los_Angeles",
        "firstDay": "2025-09-02",
        "lastDay": "2026-06-12",
        "schedules": {
          "NORMAL": [
            { "name": "Period 1", "start": "8:30",  "end": "9:30" },
            { "name": "Period 2", "start": "9:36",  "end": "10:36" },
            { "name": "Lunch",    "start": "10:36", "end": "11:06" },
            { "name": "Period 3", "start": "11:12", "end": "12:12" }
          ],
          "SHORT": [
            { "name": "Period 1", "start": "8:30", "end": "9:15" },
            { "name": "Period 2", "start": "9:21", "end": "10:06" }
          ],
          "FINALS": [
            { "name": "Period 1 Final", "start": "8:30",  "end": "10:00" },
            { "name": "Period 2 Final", "start": "10:15", "end": "11:45" }
          ],
          "ASSEMBLY": [{ "name": "Assembly", "start": "9:00", "end": "12:00" }]
        },
        "dates": {
          "2025-10-31": "SHORT",
          "2026-01-09": "ASSEMBLY",
          "2026-06-01": "FINALS"
        },
        "holidays": [
          "2025-10-13",
          "2025-11-27", "2025-11-28",
          "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20"
        ]
      }
      """;

  private static BellSchedule makeBellSchedule() {
    return makeBellSchedule(Options.defaults());
  }

  private static BellSchedule makeBellSchedule(Options options) {
    return BellSchedule.fromJsonString(CALENDAR_DATA, options);
  }

  private static LocalDate pd(String s) {
    return LocalDate.parse(s);
  }

  private static Instant at(String date, int hour, int minute) {
    return pd(date).atTime(hour, minute).atZone(TZ).toInstant();
  }

  private static BoundTime bound(String date, TimeAnchor anchor) {
    return new BoundTime(date, anchor, "+00:00");
  }

  private static BoundTime bound(String date, TimeAnchor anchor, String offset) {
    return new BoundTime(date, anchor, offset);
  }

  // ─── parseTime ───────────────────────────────────────────────────────────────

  @Nested
  class ParseTime {
    @Test
    void parsesABareAnchor() {
      assertEquals(
          new AbstractTime(TimeAnchor.START_OF_PERIOD, null, null),
          AbstractTimes.parseTime("start_of_period"));
      assertEquals(
          new AbstractTime(TimeAnchor.MIDNIGHT, null, null), AbstractTimes.parseTime("midnight"));
    }

    @Test
    void parsesATimeOffset() {
      assertEquals(
          new AbstractTime(TimeAnchor.END_OF_PERIOD, null, "-00:05"),
          AbstractTimes.parseTime("end_of_period -00:05"));
      assertEquals(
          new AbstractTime(TimeAnchor.START_OF_DAY, null, "+1:30"),
          AbstractTimes.parseTime("start_of_day +1:30"));
    }

    @Test
    void parsesSchoolDayOffsets() {
      assertEquals(new DaySpec.SchoolDays(1), AbstractTimes.parseTime("end_of_day +1 day").day());
      assertEquals(
          new DaySpec.SchoolDays(-2), AbstractTimes.parseTime("start_of_day -2 days").day());
    }

    @Test
    void parsesWeekOffsets() {
      assertEquals(new DaySpec.Weeks(1), AbstractTimes.parseTime("midnight +1 week").day());
      assertEquals(new DaySpec.Weeks(-3), AbstractTimes.parseTime("midnight -3 weeks").day());
    }

    @Test
    void parsesWeekdayNames() {
      assertEquals(
          new DaySpec.Weekday(1), AbstractTimes.parseTime("start_of_period monday").day());
      assertEquals(new DaySpec.Weekday(7), AbstractTimes.parseTime("midnight sun").day());
    }

    @Test
    void parsesWeekBoundaries() {
      assertEquals(
          new DaySpec.Week("start", 0), AbstractTimes.parseTime("start_of_day start of week").day());
      assertEquals(
          new DaySpec.Week("end", 0), AbstractTimes.parseTime("end_of_day end of week").day());
      assertEquals(
          new DaySpec.Week("start", 1),
          AbstractTimes.parseTime("start_of_day start of next week").day());
      assertEquals(
          new DaySpec.Week("end", 1),
          AbstractTimes.parseTime("end_of_day end of next week").day());
    }

    @Test
    void parsesNextWeekAlias() {
      assertEquals(
          new DaySpec.Week("start", 1), AbstractTimes.parseTime("start_of_day next week").day());
    }

    @Test
    void parsesAbsoluteDates() {
      assertEquals(
          new DaySpec.AbsoluteDate("2026-01-05"),
          AbstractTimes.parseTime("start_of_day 2026-01-05").day());
    }

    @Test
    void parsesOffsetAndDayPartTogether() {
      assertEquals(
          new AbstractTime(TimeAnchor.END_OF_PERIOD, new DaySpec.SchoolDays(1), "-00:05"),
          AbstractTimes.parseTime("end_of_period -00:05 +1 day"));
    }

    @Test
    void isCaseInsensitive() {
      assertEquals(
          AbstractTimes.parseTime("start_of_day monday"),
          AbstractTimes.parseTime("START_OF_DAY MONDAY"));
      assertEquals(
          AbstractTimes.parseTime("midnight start of next week"),
          AbstractTimes.parseTime("Midnight Start Of Next Week"));
    }

    @Test
    void throwsOnEmptySpec() {
      assertThrows(IllegalArgumentException.class, () -> AbstractTimes.parseTime(""));
      assertThrows(IllegalArgumentException.class, () -> AbstractTimes.parseTime("   "));
    }

    @Test
    void throwsOnUnknownAnchor() {
      Exception e =
          assertThrows(
              IllegalArgumentException.class, () -> AbstractTimes.parseTime("start_of_lunch"));
      assertTrue(e.getMessage().contains("start_of_lunch"));
    }

    @Test
    void throwsOnMalformedOffset() {
      Exception e =
          assertThrows(
              IllegalArgumentException.class, () -> AbstractTimes.parseTime("start_of_day +00:99"));
      assertTrue(e.getMessage().contains("+00:99"));
    }

    @Test
    void throwsOnUnrecognizedDayParts() {
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () -> AbstractTimes.parseTime("start_of_day someday"))
              .getMessage()
              .contains("someday"));
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () -> AbstractTimes.parseTime("start_of_day 1 day")) // sign required
              .getMessage()
              .contains("1 day"));
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () -> AbstractTimes.parseTime("start_of_day end of last week"))
              .getMessage()
              .contains("end of last week"));
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () -> AbstractTimes.parseTime("start_of_day 2026-13-05"))
              .getMessage()
              .contains("2026-13-05"));
    }
  }

  // ─── formatTime ──────────────────────────────────────────────────────────────

  @Nested
  class FormatTime {
    private String canon(String s) {
      return AbstractTimes.formatTime(AbstractTimes.parseTime(s));
    }

    @Test
    void roundTripsEveryGrammarForm() {
      for (String s :
          List.of(
              "start_of_period",
              "end_of_period -00:05",
              "end_of_day +1 day",
              "start_of_day -2 days",
              "midnight +1 week",
              "start_of_period monday",
              "end_of_day end of week",
              "start_of_day start of next week",
              "start_of_day 2026-01-05")) {
        assertEquals(s, canon(s));
      }
    }

    @Test
    void canonicalizesNonCanonicalInput() {
      assertEquals("start_of_day monday", canon("START_OF_DAY MON"));
      assertEquals("start_of_day start of next week", canon("start_of_day next week"));
      assertEquals("end_of_day +1 day", canon("end_of_day +1 days"));
      assertEquals("start_of_day +01:30", canon("start_of_day +1:30"));
    }

    @Test
    void omitsAZeroOffset() {
      assertEquals("midnight", canon("midnight +00:00"));
      assertEquals("midnight", AbstractTimes.formatTime(new AbstractTime(TimeAnchor.MIDNIGHT, null, "00:00")));
      assertEquals("midnight", AbstractTimes.formatTime(new AbstractTime(TimeAnchor.MIDNIGHT, null, "-00:00")));
    }

    @Test
    void throwsOnInexpressibleValues() {
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () ->
                      AbstractTimes.formatTime(
                          new AbstractTime(TimeAnchor.MIDNIGHT, new DaySpec.Week("start", 2), null)))
              .getMessage()
              .contains("n=2"));
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () ->
                      AbstractTimes.formatTime(
                          new AbstractTime(TimeAnchor.MIDNIGHT, new DaySpec.Weekday(8), null)))
              .getMessage()
              .contains("weekday 8"));
    }
  }

  // ─── resolveDay ──────────────────────────────────────────────────────────────

  @Nested
  class ResolveDay {
    private final BellSchedule bs = makeBellSchedule();

    @Test
    void returnsBaseWhenOmitted() {
      assertEquals(pd("2025-10-06"), bs.resolveDay(pd("2025-10-06"), null));
    }

    @Test
    void returnsAbsoluteDatesAtFaceValue() {
      assertEquals(
          pd("2025-10-13"),
          bs.resolveDay(pd("2025-10-06"), new DaySpec.AbsoluteDate("2025-10-13")));
    }

    @Test
    void countsSchoolDaysPastWeekendsAndHolidays() {
      assertEquals(pd("2025-10-14"), bs.resolveDay(pd("2025-10-10"), new DaySpec.SchoolDays(1)));
      assertEquals(pd("2025-10-10"), bs.resolveDay(pd("2025-10-14"), new DaySpec.SchoolDays(-1)));
      assertEquals(pd("2025-10-16"), bs.resolveDay(pd("2025-10-10"), new DaySpec.SchoolDays(3)));
    }

    @Test
    void countsSchoolDaysFromNonSchoolBase() {
      assertEquals(pd("2025-10-14"), bs.resolveDay(pd("2025-10-11"), new DaySpec.SchoolDays(1)));
      assertEquals(pd("2025-10-10"), bs.resolveDay(pd("2025-10-11"), new DaySpec.SchoolDays(-1)));
    }

    @Test
    void returnsBaseForZeroSchoolDays() {
      assertEquals(pd("2025-10-11"), bs.resolveDay(pd("2025-10-11"), new DaySpec.SchoolDays(0)));
    }

    @Test
    void takesWeekOffsetsLiterally() {
      assertEquals(pd("2025-10-13"), bs.resolveDay(pd("2025-10-06"), new DaySpec.Weeks(1)));
      assertEquals(pd("2025-10-06"), bs.resolveDay(pd("2025-10-13"), new DaySpec.Weeks(-1)));
    }

    @Test
    void resolvesWeekdaysStrictlyAfterBase() {
      assertEquals(pd("2025-10-13"), bs.resolveDay(pd("2025-10-06"), new DaySpec.Weekday(1)));
      assertEquals(pd("2025-10-10"), bs.resolveDay(pd("2025-10-06"), new DaySpec.Weekday(5)));
      assertEquals(pd("2025-10-11"), bs.resolveDay(pd("2025-10-06"), new DaySpec.Weekday(6)));
    }

    @Test
    void rejectsOutOfRangeWeekdays() {
      assertThrows(
          IllegalArgumentException.class,
          () -> bs.resolveDay(pd("2025-10-06"), new DaySpec.Weekday(0)));
    }

    @Test
    void snapsStartOfWeekForward() {
      assertEquals(pd("2025-10-14"), bs.resolveDay(pd("2025-10-06"), new DaySpec.Week("start", 1)));
      assertEquals(pd("2025-10-14"), bs.resolveDay(pd("2025-10-15"), new DaySpec.Week("start", 0)));
    }

    @Test
    void snapsEndOfWeekBackward() {
      assertEquals(pd("2025-11-26"), bs.resolveDay(pd("2025-11-24"), new DaySpec.Week("end", 0)));
      assertEquals(pd("2025-11-26"), bs.resolveDay(pd("2025-11-17"), new DaySpec.Week("end", 1)));
      assertEquals(pd("2025-10-17"), bs.resolveDay(pd("2025-10-15"), new DaySpec.Week("end", 0)));
    }

    @Test
    void advancesStartOfWeekPastEmptyWeek() {
      assertEquals(pd("2026-02-23"), bs.resolveDay(pd("2026-02-09"), new DaySpec.Week("start", 1)));
    }

    @Test
    void throwsForEndOfWeekWithNoSchoolDays() {
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () -> bs.resolveDay(pd("2026-02-09"), new DaySpec.Week("end", 1)))
              .getMessage()
              .contains("no school days"));
    }

    @Test
    void throwsWhenRunningPastLoadedCalendars() {
      assertThrows(
          IndexOutOfBoundsException.class,
          () -> bs.resolveDay(pd("2026-06-12"), new DaySpec.SchoolDays(5)));
      assertThrows(
          IndexOutOfBoundsException.class,
          () -> bs.resolveDay(pd("2025-09-02"), new DaySpec.SchoolDays(-1)));
      assertThrows(
          IndexOutOfBoundsException.class,
          () -> bs.resolveDay(pd("2026-06-12"), new DaySpec.Week("start", 1)));
    }
  }

  // ─── addSchoolDays ───────────────────────────────────────────────────────────

  @Nested
  class AddSchoolDays {
    private final BellSchedule bs = makeBellSchedule();

    @Test
    void returnsDateItselfForZero() {
      assertEquals(pd("2025-10-13"), bs.addSchoolDays(pd("2025-10-13"), 0));
    }

    @Test
    void countsForwardAndBackward() {
      assertEquals(pd("2025-10-15"), bs.addSchoolDays(pd("2025-10-10"), 2));
      assertEquals(pd("2025-10-09"), bs.addSchoolDays(pd("2025-10-14"), -2));
    }
  }

  // ─── bindTime ────────────────────────────────────────────────────────────────

  @Nested
  class BindTime {
    private final BellSchedule bs = makeBellSchedule();

    private List<String> warnings;
    private Consumer<String> onWarning;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
      warnings = new ArrayList<>();
      onWarning = warnings::add;
    }

    @Test
    void bindsToBaseWithDefaultOffset() {
      BoundTime b = bs.bindTime(pd("2025-10-06"), AbstractTimes.parseTime("start_of_period"), onWarning);
      assertEquals(new BoundTime("2025-10-06", TimeAnchor.START_OF_PERIOD, "+00:00"), b);
      assertEquals(List.of(), warnings);
    }

    @Test
    void preservesParsedOffset() {
      BoundTime b =
          bs.bindTime(pd("2025-10-06"), AbstractTimes.parseTime("end_of_period -00:05 +1 day"), onWarning);
      assertEquals(new BoundTime("2025-10-07", TimeAnchor.END_OF_PERIOD, "-00:05"), b);
    }

    @Test
    void warnsWhenWeekdayLandsOnHoliday() {
      BoundTime b = bs.bindTime(pd("2025-10-06"), AbstractTimes.parseTime("start_of_day monday"), onWarning);
      assertEquals("2025-10-13", b.date());
      assertEquals(1, warnings.size());
      assertTrue(warnings.get(0).contains("not a school day"));
    }

    @Test
    void warnsWhenPlusOneWeekLandsOnHoliday() {
      bs.bindTime(pd("2025-10-06"), AbstractTimes.parseTime("start_of_day +1 week"), onWarning);
      assertEquals(1, warnings.size());
      assertTrue(warnings.get(0).contains("not a school day"));
    }

    @Test
    void doesNotWarnAboutMidnightOnHoliday() {
      bs.bindTime(pd("2025-10-06"), AbstractTimes.parseTime("midnight +1 week"), onWarning);
      assertEquals(List.of(), warnings);
    }

    @Test
    void doesNotWarnWhenStartOfWeekSnapsWithinWeek() {
      BoundTime b = bs.bindTime(pd("2025-10-06"), AbstractTimes.parseTime("start_of_day next week"), onWarning);
      assertEquals("2025-10-14", b.date());
      assertEquals(List.of(), warnings);
    }

    @Test
    void warnsWhenStartOfWeekAdvancesPastEmptyWeek() {
      BoundTime b = bs.bindTime(pd("2026-02-09"), AbstractTimes.parseTime("start_of_day next week"), onWarning);
      assertEquals("2026-02-23", b.date());
      assertEquals(1, warnings.size());
      assertTrue(warnings.get(0).contains("advanced"));
    }

    @Test
    void rejectsMalformedOffsetsAtBindTime() {
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () ->
                      bs.bindTime(
                          pd("2025-10-06"),
                          new AbstractTime(TimeAnchor.MIDNIGHT, null, "0:5"),
                          w -> {}))
              .getMessage()
              .contains("0:5"));
    }
  }

  // ─── timeWarnings ────────────────────────────────────────────────────────────

  @Nested
  class TimeWarnings {
    private final BellSchedule bs = makeBellSchedule();

    @Test
    void neverWarnsAboutMidnight() {
      assertEquals(List.of(), bs.timeWarnings(bound("2025-10-13", TimeAnchor.MIDNIGHT)));
    }

    @Test
    void warnsAboutSchoolAnchorsOnNonSchoolDays() {
      for (TimeAnchor anchor :
          List.of(
              TimeAnchor.START_OF_PERIOD,
              TimeAnchor.END_OF_PERIOD,
              TimeAnchor.START_OF_DAY,
              TimeAnchor.END_OF_DAY)) {
        List<String> ws = bs.timeWarnings(bound("2025-10-13", anchor));
        assertEquals(1, ws.size());
        assertTrue(ws.get(0).contains("not a school day"));
      }
    }

    @Test
    void warnsAboutPeriodAnchorsWithNoNumberedPeriods() {
      List<String> ws = bs.timeWarnings(bound("2026-01-09", TimeAnchor.START_OF_PERIOD));
      assertEquals(1, ws.size());
      assertTrue(ws.get(0).contains("no numbered periods"));
    }

    @Test
    void doesNotWarnAboutDayAnchorsWithNoNumberedPeriods() {
      assertEquals(List.of(), bs.timeWarnings(bound("2026-01-09", TimeAnchor.START_OF_DAY)));
    }

    @Test
    void returnsEmptyForSensibleSpecs() {
      assertEquals(List.of(), bs.timeWarnings(bound("2025-10-14", TimeAnchor.START_OF_PERIOD)));
    }

    @Test
    void acceptsUnsignedOffsets() {
      assertEquals(
          List.of(), bs.timeWarnings(bound("2025-10-14", TimeAnchor.START_OF_PERIOD, "00:00")));
    }
  }

  // ─── resolveTime ─────────────────────────────────────────────────────────────

  @Nested
  class ResolveTime {
    private final BellSchedule bs = makeBellSchedule();

    @Test
    void resolvesMidnightOnAnyDate() {
      ZonedDateTime z = bs.resolveTime(bound("2025-10-13", TimeAnchor.MIDNIGHT));
      assertEquals(at("2025-10-13", 0, 0), z.toInstant());
    }

    @Test
    void resolvesStartAndEndOfDay() {
      ZonedDateTime start = bs.resolveTime(bound("2025-09-02", TimeAnchor.START_OF_DAY));
      ZonedDateTime end = bs.resolveTime(bound("2025-09-02", TimeAnchor.END_OF_DAY));
      assertEquals(at("2025-09-02", 8, 30), start.toInstant());
      assertEquals(at("2025-09-02", 12, 12), end.toInstant());
    }

    @Test
    void returnsNullForDayAnchorsOnNonSchoolDays() {
      assertNull(bs.resolveTime(bound("2025-10-13", TimeAnchor.START_OF_DAY)));
      assertNull(bs.resolveTime(bound("2025-10-11", TimeAnchor.END_OF_DAY)));
    }

    @Test
    void resolvesPeriodAnchorsWithSuppliedPeriod() {
      ZonedDateTime start = bs.resolveTime(bound("2025-09-02", TimeAnchor.START_OF_PERIOD), 2);
      ZonedDateTime end = bs.resolveTime(bound("2025-09-02", TimeAnchor.END_OF_PERIOD), 2);
      assertEquals(at("2025-09-02", 9, 36), start.toInstant());
      assertEquals(at("2025-09-02", 10, 36), end.toInstant());
    }

    @Test
    void appliesTheOffset() {
      ZonedDateTime z = bs.resolveTime(bound("2025-09-02", TimeAnchor.END_OF_PERIOD, "-00:05"), 1);
      assertEquals(at("2025-09-02", 9, 25), z.toInstant());
    }

    @Test
    void acceptsUnsignedOffsets() {
      ZonedDateTime z = bs.resolveTime(bound("2025-09-02", TimeAnchor.START_OF_PERIOD, "00:00"), 1);
      assertEquals(at("2025-09-02", 8, 30), z.toInstant());
    }

    @Test
    void returnsNullWhenPeriodOmitted() {
      assertNull(bs.resolveTime(bound("2025-09-02", TimeAnchor.START_OF_PERIOD)));
    }

    @Test
    void returnsNullWhenNoSuchPeriod() {
      assertNull(bs.resolveTime(bound("2025-10-31", TimeAnchor.START_OF_PERIOD), 3));
      ZonedDateTime p1 = bs.resolveTime(bound("2025-10-31", TimeAnchor.START_OF_PERIOD), 1);
      assertEquals(at("2025-10-31", 8, 30), p1.toInstant());
    }

    @Test
    void appliesOffsetsAcrossDst() {
      // Fall-back is 2025-11-02 at 2:00. Midnight +4h elapsed = 3:00 PST.
      ZonedDateTime z = bs.resolveTime(bound("2025-11-02", TimeAnchor.MIDNIGHT, "+04:00"));
      assertEquals(3, z.getHour());
      assertEquals(ZoneOffset.ofHours(-8), z.getOffset());
    }

    @Test
    void rejectsMalformedOffsets() {
      assertTrue(
          assertThrows(
                  IllegalArgumentException.class,
                  () -> bs.resolveTime(bound("2025-09-02", TimeAnchor.MIDNIGHT, "bogus")))
              .getMessage()
              .contains("bogus"));
    }
  }

  // ─── periodOnDate ────────────────────────────────────────────────────────────

  @Nested
  class PeriodOnDate {
    private final BellSchedule bs = makeBellSchedule();

    @Test
    void findsNumberedPeriods() {
      PeriodInstant p = bs.periodOnDate(pd("2025-09-02"), 2);
      assertEquals("Period 2", p.name());
      assertEquals(at("2025-09-02", 9, 36), p.start());
    }

    @Test
    void matchesPeriod1FinalAsPeriod1() {
      PeriodInstant p = bs.periodOnDate(pd("2026-06-01"), 1);
      assertEquals("Period 1 Final", p.name());
    }

    @Test
    void returnsNullForMissingPeriodOrNonSchoolDay() {
      assertNull(bs.periodOnDate(pd("2025-10-31"), 3));
      assertNull(bs.periodOnDate(pd("2025-10-13"), 1));
    }

    @Test
    void usesCustomMatcher() {
      BellSchedule custom =
          makeBellSchedule(
              Options.defaults()
                  .withPeriodNumber(p -> "Lunch".equals(p.name()) ? Integer.valueOf(0) : null));
      PeriodInstant p = custom.periodOnDate(pd("2025-09-02"), 0);
      assertEquals("Lunch", p.name());
      assertNull(custom.periodOnDate(pd("2025-09-02"), 1));
    }
  }

  // ─── currentOrNextPeriodNumber ───────────────────────────────────────────────

  @Nested
  class CurrentOrNextPeriodNumber {
    private final BellSchedule bs = makeBellSchedule();

    @Test
    void returnsContainingPeriodNumber() {
      assertEquals(2, bs.currentOrNextPeriodNumber(at("2025-09-03", 10, 0)));
    }

    @Test
    void skipsNonNumberedPeriods() {
      assertEquals(3, bs.currentOrNextPeriodNumber(at("2025-09-03", 10, 50)));
    }

    @Test
    void returnsFirstPeriodBeforeSchool() {
      assertEquals(1, bs.currentOrNextPeriodNumber(at("2025-09-03", 7, 0)));
    }

    @Test
    void returnsNullAfterLastPeriod() {
      assertNull(bs.currentOrNextPeriodNumber(at("2025-09-03", 13, 0)));
    }

    @Test
    void returnsNullOnNonSchoolDays() {
      assertNull(bs.currentOrNextPeriodNumber(at("2025-10-13", 10, 0)));
    }
  }
}

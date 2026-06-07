package com.gigamonkeys.bells;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * A concrete schedule for a single date: the list of resolved periods together with the
 * logic that determines the active periods, day boundaries, and the current interval.
 */
public final class Schedule {

  private final Calendar calendar;
  private final LocalDate date;
  private final String name;
  private final List<Period> rawPeriods;

  /**
   * @param calendar the owning calendar
   * @param periods the resolved periods for this date (with concrete times)
   * @param date the date this schedule applies to
   * @param name the schedule name (e.g. {@code "NORMAL"}), or {@code null} for an inline override
   */
  public Schedule(Calendar calendar, List<Period> periods, LocalDate date, String name) {
    this.calendar = calendar;
    this.date = date;
    this.name = name;
    this.rawPeriods = periods;

    // Set next links on actual periods.
    List<Period> actual = actualPeriods();
    for (int i = 0; i < actual.size(); i++) {
      actual.get(i).setNext(i < actual.size() - 1 ? actual.get(i + 1) : null);
    }
  }

  /**
   * @return the schedule name, or {@code null} for an inline override
   */
  public String name() {
    return name;
  }

  /**
   * @return the date this schedule applies to
   */
  public LocalDate date() {
    return date;
  }

  /**
   * @return all periods before filtering for role/optional configuration
   */
  public List<Period> rawPeriods() {
    return rawPeriods;
  }

  /**
   * Determine if a period should be included given the current date and configuration.
   *
   * @param p the period
   * @return whether it is included
   */
  public boolean hasPeriod(Period p) {
    if (p.teachers()) {
      return Options.TEACHER.equals(calendar.role());
    }

    List<String> tags = p.tags();
    if (!tags.contains("optional")) {
      // Not optional — always include.
      return true;
    }

    // Optional — include only if one of the other tags appears in includeTags for this day.
    int dow = date.getDayOfWeek().getValue(); // 1=Mon … 7=Sun
    List<String> allowed = calendar.includeTags().getOrDefault(dow, List.of());
    for (String tag : tags) {
      if (!tag.equals("optional") && allowed.contains(tag)) {
        return true;
      }
    }
    return false;
  }

  /**
   * The periods actually in effect, after filtering for role/config and trimming
   * administrative (non-school) optional periods from the day's boundaries.
   *
   * @return the active periods
   */
  public List<Period> actualPeriods() {
    List<Period> base = new ArrayList<>();
    for (Period p : rawPeriods) {
      if (hasPeriod(p)) {
        base.add(p);
      }
    }

    if (base.isEmpty()) {
      return base;
    }

    // Trim nonschool optional periods from start and end. These are administrative
    // periods (e.g. Food Trucks) that should not define school day boundaries.
    // User-configurable optional periods (zero, seventh, ext) are kept so that
    // enabling them correctly affects the start/end of the school day.
    while (!base.isEmpty()
        && base.get(0).tags().contains("optional")
        && base.get(0).tags().contains("nonschool")) {
      base.remove(0);
    }
    while (!base.isEmpty()
        && base.get(base.size() - 1).tags().contains("optional")
        && base.get(base.size() - 1).tags().contains("nonschool")) {
      base.remove(base.size() - 1);
    }

    return base;
  }

  /**
   * @return the first active period, or {@code null} if none
   */
  public Period firstPeriod() {
    List<Period> ps = actualPeriods();
    return ps.isEmpty() ? null : ps.get(0);
  }

  /**
   * @return the last active period, or {@code null} if none
   */
  public Period lastPeriod() {
    List<Period> ps = actualPeriods();
    return ps.isEmpty() ? null : ps.get(ps.size() - 1);
  }

  /**
   * @param date the date
   * @param timezone the timezone
   * @return the instant the school day starts
   */
  public Instant startOfDay(LocalDate date, ZoneId timezone) {
    return firstPeriod().startInstant(date, timezone);
  }

  /**
   * @param date the date
   * @param timezone the timezone
   * @return the instant the school day ends
   */
  public Instant endOfDay(LocalDate date, ZoneId timezone) {
    return lastPeriod().endInstant(date, timezone);
  }

  /**
   * @param instant a moment
   * @return whether that moment is outside this day's school hours
   */
  public boolean notInSchool(Instant instant) {
    ZoneId tz = calendar.timezone();
    return !calendar.isSchoolDay(date)
        || !instant.isBefore(endOfDay(date, tz)) // instant >= endOfDay
        || !instant.isAfter(startOfDay(date, tz)); // instant <= startOfDay
  }

  /**
   * Compute the interval covering {@code instant} on this schedule's date.
   *
   * @param instant the moment to locate
   * @return the covering interval, or {@code null}
   */
  public Interval currentInterval(Instant instant) {
    Interval daysOff = maybeBreak(instant);
    if (daysOff != null) {
      return daysOff;
    }

    ZoneId tz = calendar.timezone();
    Period first = firstPeriod();
    Period last = lastPeriod();

    if (first == null) {
      return null;
    }

    if (first.isAfter(instant, date, tz)) {
      return new Interval(
          "Before school",
          calendar.previousSchoolDayEnd(instant),
          first.startInstant(date, tz),
          false,
          IntervalType.BEFORE_SCHOOL,
          List.of());
    } else if (last.isBefore(instant, date, tz)) {
      return new Interval(
          "After school",
          last.endInstant(date, tz),
          calendar.nextSchoolDayStart(instant),
          false,
          IntervalType.AFTER_SCHOOL,
          List.of());
    } else {
      for (Period p = first; p != null; p = p.next()) {
        if (p.contains(instant, date, tz)) {
          return p.toInterval(date, tz);
        } else if (p.next() != null
            && p.isBefore(instant, date, tz)
            && p.next().isAfter(instant, date, tz)) {
          return new Interval(
              "Passing to " + p.next().name(),
              p.endInstant(date, tz),
              p.next().startInstant(date, tz),
              true,
              IntervalType.PASSING,
              List.of());
        }
      }
    }

    return null;
  }

  private Interval maybeBreak(Instant instant) {
    if (notInSchool(instant)) {
      Instant prev = calendar.previousSchoolDayEnd(instant);
      Instant next = calendar.nextSchoolDayStart(instant);
      int days = DateTimes.daysBetween(prev, next);
      if (days >= 3) {
        String breakName = breakName(days, prev, next);
        return new Interval(breakName + "!", prev, next, false, IntervalType.BREAK, List.of());
      }
    }
    return null;
  }

  private String breakName(int days, Instant start, Instant end) {
    ZoneId tz = calendar.timezone();
    if (days > 4) {
      LocalDate nextHoliday = calendar.nextHoliday(start);
      return calendar.breakNames().getOrDefault(nextHoliday.toString(), "Vacation");
    } else if (DateTimes.includesWeekend(start, end, tz)) {
      return days > 3 ? "Long weekend" : "Weekend";
    } else {
      return "Mid-week vacation?";
    }
  }
}

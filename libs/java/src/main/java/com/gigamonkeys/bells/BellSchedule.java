package com.gigamonkeys.bells;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * The public entry point for querying bell schedules. Wraps one or more {@link Calendar}
 * instances (one per academic year) and routes each query to the calendar that covers the
 * relevant moment.
 *
 * <p>Methods that accept an {@link Instant} have a no-argument overload that uses
 * {@link Instant#now()}; methods that accept a {@link LocalDate} have a no-argument overload
 * that uses today's date in the schedule's timezone.
 */
public final class BellSchedule {

  private final Options options;
  private final List<Calendar> calendars;

  /**
   * @param calendarData one or more years of calendar data
   * @param options the viewer options (role + includeTags)
   */
  public BellSchedule(List<CalendarData> calendarData, Options options) {
    this.options = options == null ? Options.defaults() : options;
    this.calendars = new ArrayList<>();
    for (CalendarData d : calendarData) {
      this.calendars.add(new Calendar(d, this.options));
    }
  }

  /**
   * Build a {@link BellSchedule} from a parsed JSON tree (object or array).
   *
   * @param node a JSON object or array of year objects
   * @param options the viewer options
   * @return the bell schedule
   */
  public static BellSchedule fromJson(JsonNode node, Options options) {
    return new BellSchedule(CalendarData.fromJson(node), options);
  }

  /**
   * Build a {@link BellSchedule} from a JSON string (object or array).
   *
   * @param json JSON text
   * @param options the viewer options
   * @return the bell schedule
   */
  public static BellSchedule fromJsonString(String json, Options options) {
    return new BellSchedule(CalendarData.parse(json), options);
  }

  /**
   * @return the timezone shared by all calendars (e.g. {@code "America/Los_Angeles"})
   */
  public String timezone() {
    return calendars.get(0).timezone().getId();
  }

  // ─── Calendar selection ───────────────────────────────────────────────────────

  private Calendar calendarAt(Instant instant) {
    for (Calendar c : calendars) {
      if (c.isInCalendar(instant)) {
        return c;
      }
    }
    return null;
  }

  private Calendar nextCalendar(Instant instant) {
    Calendar best = null;
    for (Calendar c : calendars) {
      if (!c.startOfYear().isAfter(instant)) {
        continue; // startOfYear <= instant
      }
      if (best == null || c.startOfYear().isBefore(best.startOfYear())) {
        best = c;
      }
    }
    return best;
  }

  private Calendar prevCalendar(Instant instant) {
    Calendar best = null;
    for (Calendar c : calendars) {
      if (!c.endOfYear().isBefore(instant)) {
        continue; // endOfYear >= instant
      }
      if (best == null || c.endOfYear().isAfter(best.endOfYear())) {
        best = c;
      }
    }
    return best;
  }

  private Calendar calendarForDate(LocalDate date) {
    for (Calendar c : calendars) {
      if (!c.firstDay().isAfter(date) && !date.isAfter(c.lastDay())) {
        return c;
      }
    }
    return null;
  }

  // ─── Current interval / period ────────────────────────────────────────────────

  /**
   * @return the interval covering now, or {@code null}
   */
  public Interval currentInterval() {
    return currentInterval(Instant.now());
  }

  /**
   * @param instant a moment
   * @return the interval covering it, or {@code null}
   */
  public Interval currentInterval(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.currentInterval(instant) : null;
  }

  /**
   * @return the named period at now, or {@code null} if not in a period
   */
  public Interval periodAt() {
    return periodAt(Instant.now());
  }

  /**
   * @param instant a moment
   * @return the named period at that moment, or {@code null} if not in a period
   */
  public Interval periodAt(Instant instant) {
    Interval interval = currentInterval(instant);
    return (interval != null && interval.type() == IntervalType.PERIOD) ? interval : null;
  }

  // ─── School day predicates ────────────────────────────────────────────────────

  /**
   * @return whether today (in the system-default timezone) is a school day. Pass a {@link
   *     ZoneId} to anchor "today" to a specific zone (e.g. the school's) when the process runs
   *     elsewhere.
   */
  public boolean isSchoolDay() {
    return isSchoolDay(LocalDate.now());
  }

  /**
   * @param zone the timezone in which to determine today's date
   * @return whether today (in {@code zone}) is a school day
   */
  public boolean isSchoolDay(ZoneId zone) {
    return isSchoolDay(LocalDate.now(zone));
  }

  /**
   * @param date a date
   * @return whether it is a school day
   */
  public boolean isSchoolDay(LocalDate date) {
    Calendar cal = calendarForDate(date);
    return cal != null && cal.isSchoolDay(date);
  }

  // ─── Day bounds ───────────────────────────────────────────────────────────────

  /**
   * @return start/end of the current school day, or {@code null} if not a school day
   */
  public DayBounds currentDayBounds() {
    return currentDayBounds(Instant.now());
  }

  /**
   * @param instant a moment
   * @return start/end of that school day, or {@code null} if not a school day
   */
  public DayBounds currentDayBounds(Instant instant) {
    Calendar cal = calendarAt(instant);
    if (cal == null) {
      return null;
    }
    LocalDate date = instant.atZone(cal.timezone()).toLocalDate();
    if (!cal.isSchoolDay(date)) {
      return null;
    }
    Schedule sched = cal.schedule(date);
    return new DayBounds(
        sched.startOfDay(date, cal.timezone()), sched.endOfDay(date, cal.timezone()));
  }

  /**
   * @return the instant the next school day starts
   */
  public Instant nextSchoolDayStart() {
    return nextSchoolDayStart(Instant.now());
  }

  /**
   * @param instant a moment
   * @return the instant the next school day starts
   * @throws IllegalStateException if no calendar data covers the next school day
   */
  public Instant nextSchoolDayStart(Instant instant) {
    Calendar cal = calendarAt(instant);
    if (cal != null) {
      return cal.nextSchoolDayStart(instant);
    }
    Calendar next = nextCalendar(instant);
    if (next != null) {
      return next.startOfYear();
    }
    throw new IllegalStateException("No calendar data available for next school day");
  }

  /**
   * @return the instant the previous school day ended
   */
  public Instant previousSchoolDayEnd() {
    return previousSchoolDayEnd(Instant.now());
  }

  /**
   * @param instant a moment
   * @return the instant the previous school day ended
   * @throws IllegalStateException if no calendar data covers the previous school day
   */
  public Instant previousSchoolDayEnd(Instant instant) {
    Calendar cal = calendarAt(instant);
    if (cal != null) {
      return cal.previousSchoolDayEnd(instant);
    }
    Calendar prev = prevCalendar(instant);
    if (prev != null) {
      return prev.endOfYear();
    }
    throw new IllegalStateException("No calendar data available for previous school day");
  }

  // ─── School time ──────────────────────────────────────────────────────────────

  /**
   * @return school time remaining in the current year
   */
  public Duration schoolTimeLeft() {
    return schoolTimeLeft(Instant.now());
  }

  /**
   * @param instant a moment
   * @return school time remaining in the current year
   */
  public Duration schoolTimeLeft(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.schoolTimeLeft(instant) : Duration.ZERO;
  }

  /**
   * @return school time elapsed since the start of the current year
   */
  public Duration schoolTimeDone() {
    return schoolTimeDone(Instant.now());
  }

  /**
   * @param instant a moment
   * @return school time elapsed since the start of the current year
   */
  public Duration schoolTimeDone(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.schoolTimeDone(instant) : Duration.ZERO;
  }

  /**
   * @return total school time in the current year
   */
  public Duration totalSchoolTime() {
    return totalSchoolTime(Instant.now());
  }

  /**
   * @param instant a moment
   * @return total school time in the year covering it
   */
  public Duration totalSchoolTime(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.totalSchoolTime() : Duration.ZERO;
  }

  // ─── Year boundaries ──────────────────────────────────────────────────────────

  /**
   * @return the start of the next academic year
   */
  public Instant nextYearStart() {
    return nextYearStart(Instant.now());
  }

  /**
   * @param instant a moment
   * @return the start of the next academic year
   * @throws IllegalStateException if no next-year data is loaded
   */
  public Instant nextYearStart(Instant instant) {
    Calendar next = nextCalendar(instant);
    if (next == null) {
      throw new IllegalStateException("No next year calendar data available");
    }
    return next.startOfYear();
  }

  /**
   * @return the start of the school year containing now, or {@code null} if in summer
   */
  public Instant currentYearStart() {
    return currentYearStart(Instant.now());
  }

  /**
   * @param instant a moment
   * @return the start of the school year containing it, or {@code null}
   */
  public Instant currentYearStart(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.startOfYear() : null;
  }

  /**
   * @return the end of the school year containing now, or {@code null} if in summer
   */
  public Instant currentYearEnd() {
    return currentYearEnd(Instant.now());
  }

  /**
   * @param instant a moment
   * @return the end of the school year containing it, or {@code null}
   */
  public Instant currentYearEnd(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.endOfYear() : null;
  }

  /**
   * Total in-session school time between two instants, summed across all loaded years.
   *
   * @param start the start instant
   * @param end the end instant
   * @return the in-session duration
   */
  public Duration schoolTimeBetween(Instant start, Instant end) {
    long totalMillis = 0;

    for (Calendar cal : calendars) {
      Instant calStart = cal.startOfYear();
      Instant calEnd = cal.endOfYear();

      Instant from = start.isBefore(calStart) ? calStart : start;
      Instant to = end.isAfter(calEnd) ? calEnd : end;

      if (from.isBefore(to)) {
        totalMillis += cal.schoolTimeBetween(from, to).toMillis();
      }
    }

    return Duration.ofMillis(totalMillis);
  }

  // ─── Day counting ─────────────────────────────────────────────────────────────

  /**
   * Count school days between two dates (inclusive of both endpoints), summed across years.
   *
   * @param start the start date
   * @param end the end date
   * @return the count
   */
  public int schoolDaysBetween(LocalDate start, LocalDate end) {
    int count = 0;
    for (Calendar cal : calendars) {
      count += cal.schoolDaysBetween(start, end);
    }
    return count;
  }

  /**
   * @return school days remaining (including today if still in progress)
   */
  public int schoolDaysLeft() {
    return schoolDaysLeft(Instant.now());
  }

  /**
   * @param instant a moment
   * @return school days remaining from that moment
   */
  public int schoolDaysLeft(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.schoolDaysLeft(instant) : 0;
  }

  /**
   * @return calendar days until the end of the school year
   */
  public int calendarDaysLeft() {
    return calendarDaysLeft(Instant.now());
  }

  /**
   * @param instant a moment
   * @return calendar days until the end of the school year
   */
  public int calendarDaysLeft(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.calendarDaysLeft(instant) : 0;
  }

  // ─── Non-class days ───────────────────────────────────────────────────────────

  /**
   * @return non-class days from now through the end of the active year
   */
  public List<NonClassDay> nonClassDaysLeft() {
    return nonClassDaysLeft(Instant.now());
  }

  /**
   * @param instant a moment
   * @return non-class days from that moment through the end of the active year
   */
  public List<NonClassDay> nonClassDaysLeft(Instant instant) {
    Calendar cal = calendarAt(instant);
    return cal != null ? cal.nonClassDaysLeft(instant) : List.of();
  }

  /**
   * @param date a date
   * @return the non-class label for that date, or {@code null}
   */
  public String nonClassLabel(LocalDate date) {
    Calendar cal = calendarForDate(date);
    return cal != null ? cal.nonClassLabel(date) : null;
  }

  // ─── Summer ───────────────────────────────────────────────────────────────────

  /**
   * @return start/end of summer, or {@code null} if now is within a school year
   */
  public SummerBounds summerBounds() {
    return summerBounds(Instant.now());
  }

  /**
   * @param instant a moment
   * @return start/end of summer, or {@code null} if it is within a school year
   */
  public SummerBounds summerBounds(Instant instant) {
    if (calendarAt(instant) != null) {
      return null;
    }

    Calendar prev = prevCalendar(instant);
    Calendar next = nextCalendar(instant);

    if (prev == null && next == null) {
      return null;
    }

    return new SummerBounds(
        prev != null ? prev.endOfYear() : null, next != null ? next.startOfYear() : null);
  }

  // ─── Next/previous school day ─────────────────────────────────────────────────

  /**
   * @param date a date
   * @return the next school day strictly after it
   * @throws IllegalStateException if none is found within 365 days
   */
  public LocalDate nextSchoolDay(LocalDate date) {
    LocalDate d = date.plusDays(1);
    for (int i = 0; i < 365; i++) {
      if (isSchoolDay(d)) {
        return d;
      }
      d = d.plusDays(1);
    }
    throw new IllegalStateException("No school day found within 365 days");
  }

  /**
   * @param date a date
   * @return the previous school day strictly before it
   * @throws IllegalStateException if none is found within 365 days
   */
  public LocalDate previousSchoolDay(LocalDate date) {
    LocalDate d = date.minusDays(1);
    for (int i = 0; i < 365; i++) {
      if (isSchoolDay(d)) {
        return d;
      }
      d = d.minusDays(1);
    }
    throw new IllegalStateException("No school day found within 365 days");
  }

  // ─── Schedule queries ─────────────────────────────────────────────────────────

  /**
   * @param date a date
   * @return the schedule name (e.g. {@code "NORMAL"}) for that date, or {@code null} if it
   *     has an inline override or is not a school day
   */
  public String scheduleNameFor(LocalDate date) {
    Calendar cal = calendarForDate(date);
    if (cal == null || !cal.isSchoolDay(date)) {
      return null;
    }
    return cal.schedule(date).name();
  }

  /**
   * @param date a date
   * @return the active periods for that date, resolved to instants (empty if not a school day)
   */
  public List<PeriodInstant> scheduleFor(LocalDate date) {
    Calendar cal = calendarForDate(date);
    if (cal == null || !cal.isSchoolDay(date)) {
      return List.of();
    }
    return periodsToInstants(cal, cal.schedule(date), date);
  }

  /**
   * @return the active periods for the current or next school day
   */
  public List<PeriodInstant> periodsForDate() {
    return periodsForDate(Instant.now());
  }

  /**
   * The active periods for the current or next school day relative to {@code instant}.
   *
   * @param instant a moment
   * @return the active periods, resolved to instants
   */
  public List<PeriodInstant> periodsForDate(Instant instant) {
    Calendar cal = calendarAt(instant);
    if (cal == null) {
      cal = nextCalendar(instant);
    }
    if (cal == null) {
      return List.of();
    }

    LocalDate date;
    if (cal.isInCalendar(instant)) {
      LocalDate today = instant.atZone(cal.timezone()).toLocalDate();
      if (cal.isSchoolDay(today)) {
        Schedule sched = cal.schedule(today);
        Instant endOfDay = sched.endOfDay(today, cal.timezone());
        date = instant.isBefore(endOfDay)
            ? today
            : cal.nextSchoolDayStart(instant).atZone(cal.timezone()).toLocalDate();
      } else {
        date = cal.nextSchoolDayStart(instant).atZone(cal.timezone()).toLocalDate();
      }
    } else {
      date = cal.firstDay();
    }

    return periodsToInstants(cal, cal.schedule(date), date);
  }

  private static List<PeriodInstant> periodsToInstants(Calendar cal, Schedule sched, LocalDate date) {
    List<PeriodInstant> result = new ArrayList<>();
    for (Period p : sched.actualPeriods()) {
      result.add(
          new PeriodInstant(
              p.name(),
              p.startInstant(date, cal.timezone()),
              p.endInstant(date, cal.timezone()),
              p.tags()));
    }
    return result;
  }
}

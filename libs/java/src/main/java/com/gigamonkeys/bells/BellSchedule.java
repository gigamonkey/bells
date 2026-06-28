package com.gigamonkeys.bells;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

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

  // ─── School weeks & annotations ─────────────────────────────────────────────

  // Whole-year queries operate on the sole/first calendar; date- and week-keyed
  // queries select the calendar the same way nonClassLabel does.
  private Calendar firstCalendar() {
    return calendars.get(0);
  }

  /**
   * @return the canonical school weeks of the (first) year, in chronological order
   */
  public List<SchoolWeek> schoolWeeks() {
    return firstCalendar().schoolWeeks();
  }

  /**
   * @return the number of school weeks in the (first) year
   */
  public int schoolWeekCount() {
    return firstCalendar().schoolWeekCount();
  }

  /**
   * @param n a 1-based school-week number
   * @return the school week, or {@code null}
   */
  public SchoolWeek schoolWeek(int n) {
    return firstCalendar().schoolWeek(n);
  }

  /**
   * @param date a date
   * @return the school week containing it, or {@code null}
   */
  public SchoolWeek weekForDate(LocalDate date) {
    Calendar cal = calendarForDate(date);
    return cal != null ? cal.weekForDate(date) : null;
  }

  /**
   * @return the raw, unvalidated annotations structure of the (first) year
   */
  public Annotations annotations() {
    return firstCalendar().annotations();
  }

  /**
   * @return range annotations with {@code start}/{@code end} resolved to dates
   */
  public List<Map<String, Object>> rangeAnnotations() {
    return firstCalendar().rangeAnnotations();
  }

  /**
   * @return week annotations resolved to their school week, ascending by week number
   */
  public List<Map<String, Object>> weekAnnotations() {
    return firstCalendar().weekAnnotations();
  }

  /**
   * @return date annotations with the key resolved to a date
   */
  public List<Map<String, Object>> dateAnnotations() {
    return firstCalendar().dateAnnotations();
  }

  /**
   * @param date a date
   * @return every annotation active on it, each tagged with its {@code source}
   */
  public List<Map<String, Object>> annotationsOn(LocalDate date) {
    Calendar cal = calendarForDate(date);
    return cal != null ? cal.annotationsOn(date) : List.of();
  }

  /**
   * @param n a 1-based school-week number
   * @return every annotation touching that week of the (first) year
   */
  public List<Map<String, Object>> annotationsForWeek(int n) {
    return firstCalendar().annotationsForWeek(n);
  }

  // ─── Abstract times ───────────────────────────────────────────────────────────

  private ZoneId zone() {
    return calendars.get(0).timezone();
  }

  private Integer periodNumber(PeriodInstant period) {
    return options.periodNumber().apply(period);
  }

  private LocalDate firstCalendarDay() {
    LocalDate min = calendars.get(0).firstDay();
    for (Calendar c : calendars) {
      if (c.firstDay().isBefore(min)) {
        min = c.firstDay();
      }
    }
    return min;
  }

  private LocalDate lastCalendarDay() {
    LocalDate max = calendars.get(0).lastDay();
    for (Calendar c : calendars) {
      if (c.lastDay().isAfter(max)) {
        max = c.lastDay();
      }
    }
    return max;
  }

  private void checkInCalendars(LocalDate date, String what) {
    if (date.isBefore(firstCalendarDay()) || date.isAfter(lastCalendarDay())) {
      throw new IndexOutOfBoundsException(
          "Resolving " + what + " runs outside the loaded calendars at " + date);
    }
  }

  /**
   * {@code n} school days from {@code date} (n may be negative; 0 = {@code date} itself).
   *
   * @param date a base date
   * @param n a signed school-day count
   * @return the resulting date
   * @throws IndexOutOfBoundsException if counting runs outside the loaded calendars
   */
  public LocalDate addSchoolDays(LocalDate date, int n) {
    int step = n < 0 ? -1 : 1;
    int remaining = Math.abs(n);
    LocalDate d = date;
    while (remaining > 0) {
      d = d.plusDays(step);
      checkInCalendars(d, n + " school days from " + date);
      if (isSchoolDay(d)) {
        remaining--;
      }
    }
    return d;
  }

  /**
   * Resolve a day spec against a base date; {@code null} means the base itself.
   *
   * @param base the base date
   * @param day the day spec, or {@code null}
   * @return the resolved date
   */
  public LocalDate resolveDay(LocalDate base, DaySpec day) {
    if (day == null) {
      return base;
    }
    if (day instanceof DaySpec.AbsoluteDate d) {
      return LocalDate.parse(d.date());
    }
    if (day instanceof DaySpec.SchoolDays d) {
      return addSchoolDays(base, d.n());
    }
    if (day instanceof DaySpec.Weeks d) {
      // Taken literally — no school-day snapping; validation warns instead.
      return base.plusWeeks(d.n());
    }
    if (day instanceof DaySpec.Weekday d) {
      if (d.weekday() < 1 || d.weekday() > 7) {
        throw new IllegalArgumentException(
            "Invalid weekday " + d.weekday() + " (must be 1=Monday..7=Sunday)");
      }
      // First matching day strictly after the base; never snapped.
      return base.plusDays(((d.weekday() - base.getDayOfWeek().getValue() + 6) % 7) + 1);
    }
    if (day instanceof DaySpec.Week d) {
      LocalDate monday =
          base.minusDays(base.getDayOfWeek().getValue() - 1).plusWeeks(d.n());
      if (d.edge().equals("start")) {
        // First school day on or after the Monday; a week with no school days
        // advances into the following week ("the first day back").
        LocalDate dd = monday;
        while (!isSchoolDay(dd)) {
          checkInCalendars(dd, "start of the week of " + monday);
          dd = dd.plusDays(1);
        }
        return dd;
      }
      // edge == "end": last school day on or before the Sunday. A week with no
      // school days is an error: walking backward would land at or before the
      // base date and guessing forward is just as wrong.
      for (LocalDate dd = monday.plusDays(6); !dd.isBefore(monday); dd = dd.minusDays(1)) {
        if (isSchoolDay(dd)) {
          return dd;
        }
      }
      throw new IllegalArgumentException(
          "'end of week': the week of " + monday + " has no school days");
    }
    throw new IllegalArgumentException("Unknown day spec");
  }

  /**
   * Phase 1: bind the day spec against a base date, printing any warnings to stderr.
   *
   * @param base the base date
   * @param t the abstract time
   * @return the bound time
   */
  public BoundTime bindTime(LocalDate base, AbstractTime t) {
    return bindTime(base, t, System.err::println);
  }

  /**
   * Phase 1: bind the day spec against a base date. Runs {@link #timeWarnings} on the result and
   * reports anything it finds via {@code onWarning}.
   *
   * @param base the base date
   * @param t the abstract time
   * @param onWarning a warning sink
   * @return the bound time
   */
  public BoundTime bindTime(LocalDate base, AbstractTime t, Consumer<String> onWarning) {
    String offset = t.offset() == null ? "+00:00" : t.offset();
    AbstractTimes.parseOffsetMinutes(offset); // reject malformed offsets at load time
    LocalDate date = resolveDay(base, t.day());
    BoundTime bound = new BoundTime(date.toString(), t.anchor(), offset);

    List<String> warnings = new ArrayList<>(timeWarnings(bound));
    if (t.day() instanceof DaySpec.Week wk && wk.edge().equals("start")) {
      LocalDate monday = base.minusDays(base.getDayOfWeek().getValue() - 1).plusWeeks(wk.n());
      if (date.isAfter(monday.plusDays(6))) {
        warnings.add(
            "'start of week' advanced to " + date + ": the week of " + monday + " has no school days");
      }
    }
    for (String w : warnings) {
      onWarning.accept(w);
    }
    return bound;
  }

  /**
   * Sanity-check a bound time against the calendar: human-readable warnings for specs that can't
   * carry their anchor. Empty = OK. (It cannot check a specific period — the period isn't bound
   * yet.)
   *
   * @param t a bound time
   * @return the warnings, possibly empty
   */
  public List<String> timeWarnings(BoundTime t) {
    if (t.anchor() == TimeAnchor.MIDNIGHT) {
      return List.of(); // midnight on any date is well-defined
    }
    LocalDate date = LocalDate.parse(t.date());
    if (!isSchoolDay(date)) {
      return List.of(t.anchor() + " on " + t.date() + ", which is not a school day");
    }
    if (t.anchor() == TimeAnchor.START_OF_PERIOD || t.anchor() == TimeAnchor.END_OF_PERIOD) {
      boolean numbered = scheduleFor(date).stream().anyMatch(p -> periodNumber(p) != null);
      if (!numbered) {
        return List.of(t.anchor() + " on " + t.date() + ", which has no numbered periods");
      }
    }
    return List.of();
  }

  /**
   * Phase 2: resolve a bound time to a concrete moment, with no period (only valid for day and
   * midnight anchors).
   *
   * @param t a bound time
   * @return the resolved moment, or {@code null}
   */
  public ZonedDateTime resolveTime(BoundTime t) {
    return resolveTime(t, null);
  }

  /**
   * Phase 2: resolve a bound time to a concrete moment, supplying the period if the anchor needs
   * one. {@code null} when the date has no schedule, no such period, or a period anchor's period
   * is omitted — never a guess.
   *
   * @param t a bound time
   * @param period the period number, or {@code null}
   * @return the resolved moment in the schedule's zone, or {@code null}
   */
  public ZonedDateTime resolveTime(BoundTime t, Integer period) {
    int offsetMinutes = AbstractTimes.parseOffsetMinutes(t.offset());
    Instant anchor = anchorInstant(LocalDate.parse(t.date()), t.anchor(), period);
    if (anchor == null) {
      return null;
    }
    // Offsets are applied to the absolute instant, so offsets crossing a DST
    // transition resolve as exact elapsed time.
    return anchor.plus(Duration.ofMinutes(offsetMinutes)).atZone(zone());
  }

  private Instant anchorInstant(LocalDate date, TimeAnchor anchor, Integer period) {
    switch (anchor) {
      case MIDNIGHT:
        return date.atStartOfDay(zone()).toInstant();
      case START_OF_DAY:
      case END_OF_DAY: {
        List<PeriodInstant> periods = scheduleFor(date);
        if (periods.isEmpty()) {
          return null;
        }
        return anchor == TimeAnchor.START_OF_DAY
            ? periods.get(0).start()
            : periods.get(periods.size() - 1).end();
      }
      case START_OF_PERIOD:
      case END_OF_PERIOD: {
        if (period == null) {
          return null;
        }
        PeriodInstant p = periodOnDate(date, period);
        if (p == null) {
          return null;
        }
        return anchor == TimeAnchor.START_OF_PERIOD ? p.start() : p.end();
      }
      default:
        return null;
    }
  }

  /**
   * The numbered period on a date, per the period-number matcher, or {@code null}.
   *
   * @param date a date
   * @param n a period number
   * @return the period, or {@code null}
   */
  public PeriodInstant periodOnDate(LocalDate date, int n) {
    for (PeriodInstant p : scheduleFor(date)) {
      Integer num = periodNumber(p);
      if (num != null && num == n) {
        return p;
      }
    }
    return null;
  }

  /**
   * @return the number of the period containing now, the next numbered period later today, or
   *     {@code null}
   */
  public Integer currentOrNextPeriodNumber() {
    return currentOrNextPeriodNumber(Instant.now());
  }

  /**
   * The number of the period containing {@code instant}, or the next numbered period later the
   * same day, or {@code null} if neither exists.
   *
   * @param instant a moment
   * @return a period number, or {@code null}
   */
  public Integer currentOrNextPeriodNumber(Instant instant) {
    LocalDate date = instant.atZone(zone()).toLocalDate();
    for (PeriodInstant p : scheduleFor(date)) {
      Integer num = periodNumber(p);
      if (num != null && instant.isBefore(p.end())) {
        return num;
      }
    }
    return null;
  }
}

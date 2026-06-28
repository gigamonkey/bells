package com.gigamonkeys.bells;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One academic year's worth of schedule logic. Wraps a {@link CalendarData} together with
 * viewer {@link Options} and answers questions about school days, schedules, and the
 * current interval for instants that fall within this year.
 */
public final class Calendar {

  private static final String[] WEEKDAY_NAMES = {
    "", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
  };

  private final CalendarData data;
  private final ZoneId timezone;
  private final String role;
  private final Map<Integer, List<String>> includeTags;
  private final LocalDate firstDay;
  private final LocalDate lastDay;
  private final Map<String, List<PeriodData>> schedules;
  private final Map<String, String> weekdaySchedules;
  private final Map<String, DateEntry> dates;
  private final List<String> holidays;
  private final List<String> teacherWorkDays;
  private final Map<String, String> breakNames;
  private final Map<String, String> nonClassDays;
  private final Annotations annotations;
  private List<SchoolWeek> schoolWeeksCache;

  /**
   * @param data one year's calendar data
   * @param options the viewer options (role + includeTags)
   */
  public Calendar(CalendarData data, Options options) {
    this.data = data;
    this.timezone = ZoneId.of(data.timezone());
    this.role = options.role();
    this.includeTags = options.includeTags();

    boolean teacher = Options.TEACHER.equals(role) && data.firstDayTeachers() != null;
    this.firstDay = DateTimes.parsePlainDate(teacher ? data.firstDayTeachers() : data.firstDay());
    this.lastDay = DateTimes.parsePlainDate(data.lastDay());

    this.schedules = data.schedules();
    this.weekdaySchedules = data.weekdaySchedules();
    this.dates = data.dates();
    this.holidays = data.holidays();
    this.teacherWorkDays = data.teacherWorkDays();
    this.breakNames = data.breakNames();
    this.nonClassDays = data.nonClassDays();
    this.annotations = data.annotations();
  }

  // ─── Accessors used by Schedule ───────────────────────────────────────────────

  ZoneId timezone() {
    return timezone;
  }

  String role() {
    return role;
  }

  Map<Integer, List<String>> includeTags() {
    return includeTags;
  }

  Map<String, String> breakNames() {
    return breakNames;
  }

  /**
   * @return the first day of school for this calendar (teacher day for the teacher role)
   */
  public LocalDate firstDay() {
    return firstDay;
  }

  /**
   * @return the last day of school for this calendar
   */
  public LocalDate lastDay() {
    return lastDay;
  }

  // ─── Year boundaries ──────────────────────────────────────────────────────────

  /**
   * @param instant a moment
   * @return whether {@code instant} falls within this calendar's school year
   */
  public boolean isInCalendar(Instant instant) {
    return !startOfYear().isAfter(instant) && !instant.isAfter(endOfYear());
  }

  /**
   * @return the instant the school year begins (start of the first day)
   */
  public Instant startOfYear() {
    Schedule sched = schedule(firstDay);
    return sched.firstPeriod().startInstant(firstDay, timezone);
  }

  /**
   * @return the instant the school year ends (end of the last day)
   */
  public Instant endOfYear() {
    Schedule sched = schedule(lastDay);
    return sched.lastPeriod().endInstant(lastDay, timezone);
  }

  // ─── Schedules ────────────────────────────────────────────────────────────────

  /**
   * The schedule in effect on a given date.
   *
   * @param date the date
   * @return the schedule
   */
  public Schedule schedule(LocalDate date) {
    String d = date.toString();
    List<PeriodData> periods;
    String name = null;

    DateEntry entry = dates.get(d);
    if (entry != null && !date.isBefore(firstDay)) {
      if (entry.isName()) {
        periods = namedSchedule(entry.scheduleName());
        name = entry.scheduleName();
      } else {
        periods = entry.periods();
      }
    } else {
      String weekdayName = WEEKDAY_NAMES[date.getDayOfWeek().getValue()];
      // Empty string falls back to NORMAL (matches the JS `|| 'NORMAL'`).
      String mapped = weekdaySchedules.get(weekdayName);
      name = (mapped == null || mapped.isEmpty()) ? "NORMAL" : mapped;
      periods = namedSchedule(name);
    }

    return new Schedule(this, DateTimes.resolveScheduleTimes(periods), date, name);
  }

  private List<PeriodData> namedSchedule(String name) {
    List<PeriodData> periods = schedules.get(name);
    if (periods == null) {
      throw new IllegalArgumentException("Unknown schedule \"" + name + "\"");
    }
    return periods;
  }

  // ─── School-day predicates ────────────────────────────────────────────────────

  /**
   * @param date a date
   * @return whether it is a school day (weekday and not a holiday)
   */
  public boolean isSchoolDay(LocalDate date) {
    int dow = date.getDayOfWeek().getValue();
    return dow != 6 && dow != 7 && !isHoliday(date);
  }

  /**
   * @param date a date
   * @return whether it is a holiday for this viewer's role
   */
  public boolean isHoliday(LocalDate date) {
    String d = date.toString();
    return holidays.contains(d)
        && !(Options.TEACHER.equals(role) && teacherWorkDays.contains(d));
  }

  /**
   * Find the next holiday after the given instant, or {@code lastDay} if none.
   *
   * @param instant a moment
   * @return the next holiday date
   */
  public LocalDate nextHoliday(Instant instant) {
    LocalDate d = instant.atZone(timezone).toLocalDate().plusDays(1);
    while (!isHoliday(d) && !d.isAfter(lastDay)) {
      d = d.plusDays(1);
    }
    return d;
  }

  // ─── Next/previous school day ─────────────────────────────────────────────────

  private LocalDate nextSchoolDay(LocalDate date) {
    LocalDate d = date.plusDays(1);
    while (!isSchoolDay(d)) {
      d = d.plusDays(1);
    }
    return d;
  }

  private LocalDate previousSchoolDay(LocalDate date) {
    LocalDate d = date.minusDays(1);
    while (!isSchoolDay(d)) {
      d = d.minusDays(1);
    }
    return d;
  }

  /**
   * @param instant a moment
   * @return the instant the next school day starts
   */
  public Instant nextSchoolDayStart(Instant instant) {
    LocalDate date = instant.atZone(timezone).toLocalDate();
    if (isSchoolDay(date)) {
      Instant start = schedule(date).startOfDay(date, timezone);
      if (start.isAfter(instant)) {
        return start;
      }
    }
    LocalDate next = nextSchoolDay(date);
    return schedule(next).startOfDay(next, timezone);
  }

  /**
   * @param instant a moment
   * @return the instant the previous school day ended
   */
  public Instant previousSchoolDayEnd(Instant instant) {
    LocalDate date = instant.atZone(timezone).toLocalDate();
    if (isSchoolDay(date)) {
      Instant end = schedule(date).endOfDay(date, timezone);
      if (end.isBefore(instant)) {
        return end;
      }
    }
    LocalDate prev = previousSchoolDay(date);
    return schedule(prev).endOfDay(prev, timezone);
  }

  // ─── Current interval ─────────────────────────────────────────────────────────

  /**
   * @param instant a moment
   * @return the interval covering it, or {@code null}
   */
  public Interval currentInterval(Instant instant) {
    LocalDate date = instant.atZone(timezone).toLocalDate();
    return schedule(date).currentInterval(instant);
  }

  // ─── Day counting ─────────────────────────────────────────────────────────────

  /**
   * Count school days remaining from {@code instant} through the end of the year.
   *
   * @param instant a moment
   * @return the count
   */
  public int schoolDaysLeft(Instant instant) {
    LocalDate date = instant.atZone(timezone).toLocalDate();
    Schedule sched = schedule(date);
    Instant endOfDay = isSchoolDay(date) ? sched.endOfDay(date, timezone) : null;

    int count = 0;
    if (endOfDay != null && instant.isBefore(endOfDay)) {
      count = 1; // currently a school day, counts as remaining
    }

    // Always start counting from tomorrow regardless.
    LocalDate d = date.plusDays(1);
    while (!d.isAfter(lastDay)) {
      if (isSchoolDay(d)) {
        count++;
      }
      d = d.plusDays(1);
    }
    return count;
  }

  /**
   * @param date a date
   * @return the non-class label for that date, or {@code null}
   */
  public String nonClassLabel(LocalDate date) {
    // Treat an empty-string label as absent (matches the JS `|| null`).
    String label = nonClassDays.get(date.toString());
    return (label == null || label.isEmpty()) ? null : label;
  }

  /**
   * Non-class days from {@code instant} through the end of the year, in date order.
   *
   * @param instant a moment
   * @return the matching non-class days
   */
  public List<NonClassDay> nonClassDaysLeft(Instant instant) {
    LocalDate today = instant.atZone(timezone).toLocalDate();
    Schedule todaySched = isSchoolDay(today) ? schedule(today) : null;
    Instant todayEnd = todaySched != null ? todaySched.endOfDay(today, timezone) : null;
    boolean includesToday = todayEnd != null && instant.isBefore(todayEnd);

    List<NonClassDay> result = new ArrayList<>();
    for (Map.Entry<String, String> e : nonClassDays.entrySet()) {
      LocalDate d = DateTimes.parsePlainDate(e.getKey());
      int cmp = d.compareTo(today);
      if (cmp < 0) {
        continue;
      }
      if (cmp == 0 && !includesToday) {
        continue;
      }
      if (d.isAfter(lastDay)) {
        continue;
      }
      result.add(new NonClassDay(d, e.getValue()));
    }
    result.sort((a, b) -> a.date().compareTo(b.date()));
    return result;
  }

  /**
   * Count school days between two dates (inclusive of both endpoints), clamped to this
   * calendar's bounds.
   *
   * @param start the start date
   * @param end the end date
   * @return the count
   */
  public int schoolDaysBetween(LocalDate start, LocalDate end) {
    LocalDate from = start.isBefore(firstDay) ? firstDay : start;
    LocalDate to = end.isAfter(lastDay) ? lastDay : end;

    int count = 0;
    LocalDate d = from;
    while (!d.isAfter(to)) {
      if (isSchoolDay(d)) {
        count++;
      }
      d = d.plusDays(1);
    }
    return count;
  }

  /**
   * Count calendar days remaining until the day after {@code lastDay}.
   *
   * @param instant a moment
   * @return the count
   */
  public int calendarDaysLeft(Instant instant) {
    LocalDate date = instant.atZone(timezone).toLocalDate();
    LocalDate endDate = lastDay.plusDays(1);
    return DateTimes.daysBetween(noonInstant(date), noonInstant(endDate));
  }

  // ─── School time ──────────────────────────────────────────────────────────────

  /**
   * @param instant a moment
   * @return school time remaining from {@code instant} to the end of the year
   */
  public Duration schoolTimeLeft(Instant instant) {
    return schoolTimeBetween(instant, endOfYear());
  }

  /**
   * @param instant a moment
   * @return school time elapsed from the start of the year to {@code instant}
   */
  public Duration schoolTimeDone(Instant instant) {
    return schoolTimeBetween(startOfYear(), instant);
  }

  /**
   * @return the total school time in this year
   */
  public Duration totalSchoolTime() {
    return schoolTimeBetween(startOfYear(), endOfYear());
  }

  /**
   * Total in-session school time between two instants, clamped to this calendar's bounds.
   *
   * @param start the start instant
   * @param end the end instant
   * @return the in-session duration
   */
  public Duration schoolTimeBetween(Instant start, Instant end) {
    // Clamp start/end to calendar bounds.
    Instant calStart = startOfYear();
    Instant calEnd = endOfYear();
    Instant cursor = start.isBefore(calStart) ? calStart : start;
    Instant finish = end.isAfter(calEnd) ? calEnd : end;

    if (!cursor.isBefore(finish)) {
      return Duration.ZERO;
    }

    long totalMillis = 0;
    LocalDate cursorDate = cursor.atZone(timezone).toLocalDate();

    while (!cursorDate.isAfter(lastDay)) {
      // Stop once the start of this day is past the finish time.
      Instant dayMidnight = cursorDate.atStartOfDay(timezone).toInstant();
      if (!dayMidnight.isBefore(finish)) {
        break;
      }

      if (isSchoolDay(cursorDate)) {
        Schedule sched = schedule(cursorDate);
        Instant dayStart = sched.startOfDay(cursorDate, timezone);
        Instant dayEnd = sched.endOfDay(cursorDate, timezone);

        Instant from = cursor.isAfter(dayStart) ? cursor : dayStart;
        Instant to = finish.isBefore(dayEnd) ? finish : dayEnd;

        if (from.isBefore(to)) {
          totalMillis += to.toEpochMilli() - from.toEpochMilli();
        }
      }

      cursorDate = cursorDate.plusDays(1);
    }

    return Duration.ofMillis(totalMillis);
  }

  private Instant noonInstant(LocalDate date) {
    return DateTimes.noon(date).atZone(timezone).toInstant();
  }

  // ─── School-week numbering ────────────────────────────────────────────────────

  /**
   * The canonical school weeks of this year, in chronological order. A school week is a
   * Monday-anchored ISO week containing at least one school day; full-week breaks are
   * skipped, so numbering is dense. Role-aware through this calendar's configured role.
   *
   * @return the school weeks
   */
  public List<SchoolWeek> schoolWeeks() {
    if (schoolWeeksCache != null) {
      return schoolWeeksCache;
    }
    List<SchoolWeek> result = new ArrayList<>();
    LocalDate monday = null;
    List<LocalDate> days = new ArrayList<>();
    for (LocalDate d = firstDay; !d.isAfter(lastDay); d = d.plusDays(1)) {
      if (!isSchoolDay(d)) {
        continue;
      }
      LocalDate m = d.minusDays(d.getDayOfWeek().getValue() - 1);
      if (monday == null || !monday.equals(m)) {
        if (monday != null && !days.isEmpty()) {
          result.add(
              new SchoolWeek(
                  result.size() + 1, monday, days.get(0), days.get(days.size() - 1), days.size()));
        }
        monday = m;
        days = new ArrayList<>();
      }
      days.add(d);
    }
    if (monday != null && !days.isEmpty()) {
      result.add(
          new SchoolWeek(
              result.size() + 1, monday, days.get(0), days.get(days.size() - 1), days.size()));
    }
    schoolWeeksCache = result;
    return result;
  }

  /**
   * @return the number of school weeks in the year
   */
  public int schoolWeekCount() {
    return schoolWeeks().size();
  }

  /**
   * @param n a 1-based school-week number
   * @return the school week, or {@code null} if out of range
   */
  public SchoolWeek schoolWeek(int n) {
    if (n < 1) {
      return null;
    }
    List<SchoolWeek> weeks = schoolWeeks();
    return n <= weeks.size() ? weeks.get(n - 1) : null;
  }

  /**
   * @param date a date
   * @return the school week containing it, or {@code null} when it is outside the year or
   *     falls in a week with no school days
   */
  public SchoolWeek weekForDate(LocalDate date) {
    if (date.isBefore(firstDay) || date.isAfter(lastDay)) {
      return null;
    }
    LocalDate m = date.minusDays(date.getDayOfWeek().getValue() - 1);
    for (SchoolWeek w : schoolWeeks()) {
      if (w.monday().equals(m)) {
        return w;
      }
    }
    return null;
  }

  // ─── Annotations ──────────────────────────────────────────────────────────────

  /**
   * @return the raw, unvalidated annotations structure (payload verbatim)
   */
  public Annotations annotations() {
    return annotations;
  }

  /**
   * @return range annotations with {@code start}/{@code end} resolved to {@code LocalDate}s,
   *     each as a map of {@code id}, {@code start}, {@code end}, plus pass-through payload
   */
  public List<Map<String, Object>> rangeAnnotations() {
    List<Map<String, Object>> result = new ArrayList<>();
    for (Map.Entry<String, RangeAnnotation> e : annotations.ranges().entrySet()) {
      RangeAnnotation r = e.getValue();
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("id", e.getKey());
      m.put("start", LocalDate.parse(r.start()));
      m.put("end", LocalDate.parse(r.end()));
      m.putAll(r.rest());
      result.add(m);
    }
    return result;
  }

  /**
   * @return week annotations resolved to their school week, ascending by week number;
   *     {@code schoolWeek} is {@code null} when the key exceeds the school-week count
   */
  public List<Map<String, Object>> weekAnnotations() {
    List<Integer> nums = new ArrayList<>();
    for (String k : annotations.weeks().keySet()) {
      nums.add(Integer.valueOf(k));
    }
    Collections.sort(nums);
    List<Map<String, Object>> result = new ArrayList<>();
    for (int week : nums) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("week", week);
      m.put("schoolWeek", schoolWeek(week));
      m.putAll(annotations.weeks().get(String.valueOf(week)).payload());
      result.add(m);
    }
    return result;
  }

  /**
   * @return date annotations with the key resolved to a {@code LocalDate}
   */
  public List<Map<String, Object>> dateAnnotations() {
    List<Map<String, Object>> result = new ArrayList<>();
    for (Map.Entry<String, Annotation> e : annotations.dates().entrySet()) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("date", LocalDate.parse(e.getKey()));
      m.putAll(e.getValue().payload());
      result.add(m);
    }
    return result;
  }

  /**
   * Every annotation active on {@code date}, tagged with its {@code source}: any {@code ranges}
   * entry whose span contains the date, the {@code weeks} entry for the date's school week, and
   * the {@code dates} entry with that exact date. Order: ranges, week, date.
   *
   * @param date a date
   * @return the active annotations
   */
  public List<Map<String, Object>> annotationsOn(LocalDate date) {
    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> r : rangeAnnotations()) {
      LocalDate start = (LocalDate) r.get("start");
      LocalDate end = (LocalDate) r.get("end");
      if (!start.isAfter(date) && !date.isAfter(end)) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", "range");
        m.putAll(r);
        result.add(m);
      }
    }
    SchoolWeek sw = weekForDate(date);
    if (sw != null) {
      Annotation wa = annotations.weeks().get(String.valueOf(sw.number()));
      if (wa != null) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", "week");
        m.put("week", sw.number());
        m.put("schoolWeek", sw);
        m.putAll(wa.payload());
        result.add(m);
      }
    }
    Annotation da = annotations.dates().get(date.toString());
    if (da != null) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("source", "date");
      m.put("date", date);
      m.putAll(da.payload());
      result.add(m);
    }
    return result;
  }

  /**
   * Every annotation touching school week {@code n}, tagged with its {@code source}: any
   * {@code ranges} entry overlapping the week's school-day span, the {@code weeks[n]} entry, and
   * any {@code dates} entry inside the week. Order: ranges, week, date.
   *
   * @param n a 1-based school-week number
   * @return the touching annotations
   */
  public List<Map<String, Object>> annotationsForWeek(int n) {
    List<Map<String, Object>> result = new ArrayList<>();
    SchoolWeek sw = schoolWeek(n);
    if (sw != null) {
      for (Map<String, Object> r : rangeAnnotations()) {
        LocalDate start = (LocalDate) r.get("start");
        LocalDate end = (LocalDate) r.get("end");
        if (!start.isAfter(sw.lastSchoolDay()) && !sw.firstSchoolDay().isAfter(end)) {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("source", "range");
          m.putAll(r);
          result.add(m);
        }
      }
    }
    Annotation wa = annotations.weeks().get(String.valueOf(n));
    if (wa != null) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("source", "week");
      m.put("week", n);
      m.put("schoolWeek", sw);
      m.putAll(wa.payload());
      result.add(m);
    }
    for (Map<String, Object> da : dateAnnotations()) {
      LocalDate d = (LocalDate) da.get("date");
      SchoolWeek w = weekForDate(d);
      if (w != null && w.number() == n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", "date");
        m.putAll(da);
        result.add(m);
      }
    }
    return result;
  }
}

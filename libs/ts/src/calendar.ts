/**
 * Calendar, Schedule, Period, and Interval classes.
 * Uses Temporal throughout. No localStorage, no module-level globals.
 */

import { parsePlainDate, resolveScheduleTimes, daysBetween, noon, includesWeekend } from './datetime.js';
import type {
  IncludeTags,
  IntervalType,
  NonClassDay,
  PeriodData,
  ResolvedPeriod,
  Role,
  YearData,
} from './types.js';

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday',
};

/**
 * Normalize the includeTags option.
 * Accepts either a flat array (same tags every weekday) or a per-day-of-week map.
 * Returns a map: { 1: [...], 2: [...], 3: [...], 4: [...], 5: [...] }
 */
const normalizeIncludeTags = (includeTags: IncludeTags): Record<number, string[]> => {
  if (Array.isArray(includeTags)) {
    return { 1: includeTags, 2: includeTags, 3: includeTags, 4: includeTags, 5: includeTags };
  }
  return includeTags || {};
};

interface CalendarOptions {
  role: Role;
  includeTags: IncludeTags;
}

class Calendar {
  data: YearData;
  timezone: string;
  role: Role;
  includeTags: Record<number, string[]>;
  firstDay: Temporal.PlainDate;
  lastDay: Temporal.PlainDate;
  schedules: Record<string, PeriodData[]>;
  weekdaySchedules: Record<string, string>;
  dates: Record<string, string | PeriodData[]>;
  holidays: string[];
  teacherWorkDays: string[];
  breakNames: Record<string, string>;
  nonClassDays: Record<string, string>;

  #noonInstant(date: Temporal.PlainDate): Temporal.Instant {
    return noon(date).toZonedDateTime(this.timezone).toInstant();
  }

  #nextSchoolDay(date: Temporal.PlainDate): Temporal.PlainDate {
    let d = date.add({ days: 1 });
    while (!this.isSchoolDay(d)) {
      d = d.add({ days: 1 });
    }
    return d;
  }

  #previousSchoolDay(date: Temporal.PlainDate): Temporal.PlainDate {
    let d = date.subtract({ days: 1 });
    while (!this.isSchoolDay(d)) {
      d = d.subtract({ days: 1 });
    }
    return d;
  }

  #schoolTimeBetween(start: Temporal.Instant, end: Temporal.Instant): Temporal.Duration {
    // Clamp start/end to calendar bounds.
    const calStart = this.startOfYear();
    const calEnd = this.endOfYear();
    const cursor = Temporal.Instant.compare(start, calStart) < 0 ? calStart : start;
    const finish = Temporal.Instant.compare(end, calEnd) > 0 ? calEnd : end;

    if (Temporal.Instant.compare(cursor, finish) >= 0) {
      return Temporal.Duration.from({ seconds: 0 });
    }

    let totalMillis = 0;
    let cursorDate = cursor.toZonedDateTimeISO(this.timezone).toPlainDate();

    while (Temporal.PlainDate.compare(cursorDate, this.lastDay) <= 0) {
      // Stop once the start of this day is past the finish time.
      const dayMidnightInstant = cursorDate.toPlainDateTime({ hour: 0 })
        .toZonedDateTime(this.timezone).toInstant();
      if (Temporal.Instant.compare(dayMidnightInstant, finish) >= 0) break;

      if (this.isSchoolDay(cursorDate)) {
        const sched = this.schedule(cursorDate);
        const dayStart = sched.startOfDay(cursorDate, this.timezone);
        const dayEnd = sched.endOfDay(cursorDate, this.timezone);

        const from = Temporal.Instant.compare(cursor, dayStart) > 0 ? cursor : dayStart;
        const to = Temporal.Instant.compare(finish, dayEnd) < 0 ? finish : dayEnd;

        if (Temporal.Instant.compare(from, to) < 0) {
          totalMillis += to.epochMilliseconds - from.epochMilliseconds;
        }
      }

      cursorDate = cursorDate.add({ days: 1 });
    }

    return Temporal.Duration.from({ milliseconds: totalMillis });
  }

  constructor(data: YearData, options: CalendarOptions) {
    this.data = data;
    this.timezone = data.timezone;
    this.role = options.role;
    this.includeTags = normalizeIncludeTags(options.includeTags);

    this.firstDay = parsePlainDate(
      this.role === 'teacher' && data.firstDayTeachers ? data.firstDayTeachers : data.firstDay
    );
    this.lastDay = parsePlainDate(data.lastDay);
    this.schedules = data.schedules;
    this.weekdaySchedules = data.weekdaySchedules || {};
    this.dates = data.dates || {};
    this.holidays = data.holidays || [];
    this.teacherWorkDays = data.teacherWorkDays || [];
    this.breakNames = data.breakNames || {};
    this.nonClassDays = data.nonClassDays || {};
  }

  isInCalendar(instant: Temporal.Instant): boolean {
    return (
      Temporal.Instant.compare(this.startOfYear(), instant) <= 0 &&
      Temporal.Instant.compare(instant, this.endOfYear()) <= 0
    );
  }

  startOfYear(): Temporal.Instant {
    const sched = this.schedule(this.firstDay);
    return sched.firstPeriod().startInstant(this.firstDay, this.timezone);
  }

  endOfYear(): Temporal.Instant {
    const sched = this.schedule(this.lastDay);
    return sched.lastPeriod().endInstant(this.lastDay, this.timezone);
  }

  schedule(date: Temporal.PlainDate): Schedule {
    const d = date.toString();
    let periods: PeriodData[];
    let name: string | null = null;
    const entry = this.dates[d];
    if (entry !== undefined && d >= this.firstDay.toString()) {
      if (typeof entry === 'string') {
        periods = this.#namedSchedule(entry);
        name = entry;
      } else {
        periods = entry;
      }
    } else {
      const weekdayName = WEEKDAY_NAMES[date.dayOfWeek];
      name = this.weekdaySchedules[weekdayName] || 'NORMAL';
      periods = this.#namedSchedule(name);
    }
    return new Schedule(this, resolveScheduleTimes(periods), date, name);
  }

  #namedSchedule(name: string): PeriodData[] {
    const periods = this.schedules[name];
    if (!periods) {
      throw new Error(`Unknown schedule "${name}"`);
    }
    return periods;
  }

  isSchoolDay(date: Temporal.PlainDate): boolean {
    const dow = date.dayOfWeek;
    return dow !== 6 && dow !== 7 && !this.isHoliday(date);
  }

  isHoliday(date: Temporal.PlainDate): boolean {
    const d = date.toString();
    return (
      this.holidays.includes(d) &&
      !(this.role === 'teacher' && this.teacherWorkDays.includes(d))
    );
  }

  /** Find the next holiday after the given instant. */
  nextHoliday(instant: Temporal.Instant): Temporal.PlainDate {
    let d = instant.toZonedDateTimeISO(this.timezone).toPlainDate().add({ days: 1 });
    while (!this.isHoliday(d) && Temporal.PlainDate.compare(d, this.lastDay) <= 0) {
      d = d.add({ days: 1 });
    }
    return d;
  }

  nextSchoolDayStart(instant: Temporal.Instant): Temporal.Instant {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    if (this.isSchoolDay(date)) {
      const start = this.schedule(date).startOfDay(date, this.timezone);
      if (Temporal.Instant.compare(start, instant) > 0) {
        return start;
      }
    }
    const next = this.#nextSchoolDay(date);
    return this.schedule(next).startOfDay(next, this.timezone);
  }

  previousSchoolDayEnd(instant: Temporal.Instant): Temporal.Instant {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    if (this.isSchoolDay(date)) {
      const end = this.schedule(date).endOfDay(date, this.timezone);
      if (Temporal.Instant.compare(end, instant) < 0) {
        return end;
      }
    }
    const prev = this.#previousSchoolDay(date);
    return this.schedule(prev).endOfDay(prev, this.timezone);
  }

  currentInterval(instant: Temporal.Instant): Interval | null {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    const sched = this.schedule(date);
    return sched.currentInterval(instant);
  }

  /** Count school days remaining from `instant` through end of year. */
  schoolDaysLeft(instant: Temporal.Instant): number {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    const sched = this.schedule(date);
    const endOfDay = this.isSchoolDay(date) ? sched.endOfDay(date, this.timezone) : null;

    let count = 0;
    if (endOfDay && Temporal.Instant.compare(instant, endOfDay) < 0) {
      count = 1; // currently a school day, counts as remaining
    }

    // Always start counting from tomorrow regardless.
    let d = date.add({ days: 1 });
    const endDate = this.lastDay;

    while (Temporal.PlainDate.compare(d, endDate) <= 0) {
      if (this.isSchoolDay(d)) count++;
      d = d.add({ days: 1 });
    }
    return count;
  }

  nonClassLabel(date: Temporal.PlainDate): string | null {
    return this.nonClassDays[date.toString()] || null;
  }

  /** Non-class days from `instant` through end of year, in date order. */
  nonClassDaysLeft(instant: Temporal.Instant): NonClassDay[] {
    const today = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    const todaySched = this.isSchoolDay(today) ? this.schedule(today) : null;
    const todayEnd = todaySched ? todaySched.endOfDay(today, this.timezone) : null;
    const includesToday = todayEnd && Temporal.Instant.compare(instant, todayEnd) < 0;

    const result: NonClassDay[] = [];
    for (const [dateStr, label] of Object.entries(this.nonClassDays)) {
      const d = parsePlainDate(dateStr);
      const cmp = Temporal.PlainDate.compare(d, today);
      if (cmp < 0) continue;
      if (cmp === 0 && !includesToday) continue;
      if (Temporal.PlainDate.compare(d, this.lastDay) > 0) continue;
      result.push({ date: d, label });
    }
    result.sort((a, b) => Temporal.PlainDate.compare(a.date, b.date));
    return result;
  }

  /** Count school days between two plain dates (inclusive of both endpoints). */
  schoolDaysBetween(start: Temporal.PlainDate, end: Temporal.PlainDate): number {
    // Clamp to calendar bounds.
    const from = Temporal.PlainDate.compare(start, this.firstDay) < 0 ? this.firstDay : start;
    const to = Temporal.PlainDate.compare(end, this.lastDay) > 0 ? this.lastDay : end;

    let count = 0;
    let d = from;
    while (Temporal.PlainDate.compare(d, to) <= 0) {
      if (this.isSchoolDay(d)) count++;
      d = d.add({ days: 1 });
    }
    return count;
  }

  /** Count calendar days remaining until the day after lastDay. */
  calendarDaysLeft(instant: Temporal.Instant): number {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    const endDate = this.lastDay.add({ days: 1 });
    return daysBetween(this.#noonInstant(date), this.#noonInstant(endDate));
  }

  /** Compute total school time (as Duration) from `instant` to end of year. */
  schoolTimeLeft(instant: Temporal.Instant): Temporal.Duration {
    return this.#schoolTimeBetween(instant, this.endOfYear());
  }

  /** Compute school time (as Duration) from start of year to `instant`. */
  schoolTimeDone(instant: Temporal.Instant): Temporal.Duration {
    return this.#schoolTimeBetween(this.startOfYear(), instant);
  }

  /** Total school time in the year. */
  totalSchoolTime(): Temporal.Duration {
    return this.#schoolTimeBetween(this.startOfYear(), this.endOfYear());
  }

  /**
   * Public entry point for cross-instance school-time computation.
   * Clamps to this calendar's bounds before summing.
   */
  schoolTimeBetween(start: Temporal.Instant, end: Temporal.Instant): Temporal.Duration {
    return this.#schoolTimeBetween(start, end);
  }
}

class Schedule {
  calendar: Calendar;
  date: Temporal.PlainDate;
  name: string | null;
  rawPeriods: Period[];

  constructor(
    calendar: Calendar,
    periods: ResolvedPeriod[],
    date: Temporal.PlainDate,
    name: string | null = null,
  ) {
    this.calendar = calendar;
    this.date = date;
    this.name = name;
    this.rawPeriods = periods.map((x) => new Period(x.name, x.start, x.end, x.tags, x.teachers));

    // Set .next links on actual periods.
    const actual = this.actualPeriods();
    actual.forEach((p, i) => {
      p.next = i < actual.length - 1 ? actual[i + 1] : null;
    });
  }

  #maybeBreak(instant: Temporal.Instant): Interval | null {
    if (this.notInSchool(instant)) {
      const prev = this.calendar.previousSchoolDayEnd(instant);
      const next = this.calendar.nextSchoolDayStart(instant);
      const days = daysBetween(prev, next);
      if (days >= 3) {
        const name = this.#breakName(days, prev, next);
        return new Interval(`${name}!`, prev, next, false, 'break', []);
      }
    }
    return null;
  }

  #breakName(days: number, start: Temporal.Instant, end: Temporal.Instant): string {
    const tz = this.calendar.timezone;
    if (days > 4) {
      const nextHoliday = this.calendar.nextHoliday(start);
      return this.calendar.breakNames[nextHoliday.toString()] || 'Vacation';
    } else if (includesWeekend(start, end, tz)) {
      return days > 3 ? 'Long weekend' : 'Weekend';
    } else {
      return 'Mid-week vacation?';
    }
  }

  /** Determine if a period should be included given the current date/config. */
  hasPeriod(p: Period): boolean {
    if (p.teachers) {
      return this.calendar.role === 'teacher';
    }

    const tags = p.tags || [];
    if (!tags.includes('optional')) {
      // Not optional — always include.
      return true;
    }

    // Optional — include only if one of the other tags appears in includeTags for this day.
    const dow = this.date.dayOfWeek; // 1=Mon…7=Sun
    const allowed = this.calendar.includeTags[dow] || [];
    return tags.some((tag) => tag !== 'optional' && allowed.includes(tag));
  }

  actualPeriods(): Period[] {
    const base = this.rawPeriods.filter((p) => this.hasPeriod(p));

    if (base.length === 0) return base;

    // Trim nonschool optional periods from start and end. These are administrative
    // periods (e.g. Food Trucks) that should not define school day boundaries.
    // User-configurable optional periods (zero, seventh, ext) are kept so that
    // enabling them correctly affects the start/end of the school day.
    const isNonschool = (p: Period) => (p.tags || []).includes('nonschool');
    while (base.length > 0 && (base[0].tags || []).includes('optional') && isNonschool(base[0])) base.shift();
    while (base.length > 0 && (base[base.length - 1].tags || []).includes('optional') && isNonschool(base[base.length - 1])) base.pop();

    return base;
  }

  firstPeriod(): Period {
    return this.actualPeriods()[0];
  }

  lastPeriod(): Period {
    const ps = this.actualPeriods();
    return ps[ps.length - 1];
  }

  startOfDay(date: Temporal.PlainDate, timezone: string): Temporal.Instant {
    return this.firstPeriod().startInstant(date, timezone);
  }

  endOfDay(date: Temporal.PlainDate, timezone: string): Temporal.Instant {
    return this.lastPeriod().endInstant(date, timezone);
  }

  notInSchool(instant: Temporal.Instant): boolean {
    const date = this.date;
    const tz = this.calendar.timezone;
    return (
      !this.calendar.isSchoolDay(date) ||
      Temporal.Instant.compare(instant, this.endOfDay(date, tz)) >= 0 ||
      Temporal.Instant.compare(instant, this.startOfDay(date, tz)) <= 0
    );
  }

  currentInterval(instant: Temporal.Instant): Interval | null {
    const daysOff = this.#maybeBreak(instant);
    if (daysOff) return daysOff;

    const tz = this.calendar.timezone;
    const date = this.date;
    const first = this.firstPeriod();
    const last = this.lastPeriod();

    if (!first) return null;

    if (first.isAfter(instant, date, tz)) {
      return new Interval(
        'Before school',
        this.calendar.previousSchoolDayEnd(instant),
        first.startInstant(date, tz),
        false,
        'before-school',
        [],
      );
    } else if (last.isBefore(instant, date, tz)) {
      return new Interval(
        'After school',
        last.endInstant(date, tz),
        this.calendar.nextSchoolDayStart(instant),
        false,
        'after-school',
        [],
      );
    } else {
      for (let p: Period | null = first; p !== null; p = p.next) {
        if (p.contains(instant, date, tz)) {
          return p.toInterval(date, tz);
        } else if (p.next && p.isBefore(instant, date, tz) && p.next.isAfter(instant, date, tz)) {
          return new Interval(
            `Passing to ${p.next.name}`,
            p.endInstant(date, tz),
            p.next.startInstant(date, tz),
            true,
            'passing',
            [],
          );
        }
      }
    }

    return null;
  }
}

class Period {
  name: string;
  start: Temporal.PlainTime;
  end: Temporal.PlainTime;
  tags: string[];
  teachers: boolean;
  next: Period | null;

  constructor(
    name: string,
    start: Temporal.PlainTime,
    end: Temporal.PlainTime,
    tags: string[] | undefined,
    teachers: boolean | undefined,
  ) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.tags = tags || [];
    this.teachers = !!teachers;
    this.next = null;
  }

  startInstant(date: Temporal.PlainDate, timezone: string): Temporal.Instant {
    return date.toPlainDateTime(this.start).toZonedDateTime(timezone).toInstant();
  }

  endInstant(date: Temporal.PlainDate, timezone: string): Temporal.Instant {
    return date.toPlainDateTime(this.end).toZonedDateTime(timezone).toInstant();
  }

  // Periods are half-open intervals [start, end): a period owns its start
  // instant but not its end (the end belongs to the following passing period,
  // break, or after-school span). This keeps every boundary instant in exactly
  // one interval rather than briefly falling into none.

  isAfter(instant: Temporal.Instant, date: Temporal.PlainDate, timezone: string): boolean {
    return Temporal.Instant.compare(this.startInstant(date, timezone), instant) > 0;
  }

  isBefore(instant: Temporal.Instant, date: Temporal.PlainDate, timezone: string): boolean {
    return Temporal.Instant.compare(this.endInstant(date, timezone), instant) <= 0;
  }

  contains(instant: Temporal.Instant, date: Temporal.PlainDate, timezone: string): boolean {
    return (
      Temporal.Instant.compare(this.startInstant(date, timezone), instant) <= 0 &&
      Temporal.Instant.compare(instant, this.endInstant(date, timezone)) < 0
    );
  }

  toInterval(date: Temporal.PlainDate, timezone: string): Interval {
    return new Interval(
      this.name,
      this.startInstant(date, timezone),
      this.endInstant(date, timezone),
      true,
      'period',
      this.tags,
    );
  }
}

class Interval {
  name: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
  duringSchool: boolean;
  type: IntervalType;
  tags: string[];

  constructor(
    name: string,
    start: Temporal.Instant,
    end: Temporal.Instant,
    duringSchool: boolean,
    type: IntervalType,
    tags: string[],
  ) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.duringSchool = duringSchool;
    this.type = type;
    this.tags = tags;
  }

  left(now: Temporal.Instant = Temporal.Now.instant()): Temporal.Duration {
    return now.until(this.end);
  }

  done(now: Temporal.Instant = Temporal.Now.instant()): Temporal.Duration {
    return this.start.until(now);
  }
}

export { Calendar, Schedule, Period, Interval, normalizeIncludeTags };
export type { CalendarOptions };

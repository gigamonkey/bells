/**
 * BellSchedule — wraps one or more Calendar instances.
 */

import { Calendar, normalizeIncludeTags, type Interval } from './calendar.js';
import type {
  BellScheduleOptions,
  NonClassDay,
  Role,
  ScheduledPeriod,
  YearData,
} from './types.js';

interface DayBounds {
  start: Temporal.Instant;
  end: Temporal.Instant;
}

interface SummerBounds {
  start: Temporal.Instant | null;
  end: Temporal.Instant | null;
}

class BellSchedule {
  #options: { role: Role; includeTags: Record<number, string[]> };
  #calendars: Calendar[];

  constructor(calendarDataArray: YearData[], options: BellScheduleOptions = {}) {
    const role: Role = options.role || 'student';
    const includeTags = normalizeIncludeTags(options.includeTags || {});
    this.#options = { role, includeTags };
    this.#calendars = calendarDataArray.map((d) => new Calendar(d, { role, includeTags }));
  }

  /** The timezone shared by all calendars (e.g. 'America/Los_Angeles'). */
  get timezone(): string {
    return this.#calendars[0].timezone;
  }

  /** Find the Calendar that covers this instant. */
  #calendarAt(instant: Temporal.Instant): Calendar | null {
    return this.#calendars.find((c) => c.isInCalendar(instant)) || null;
  }

  #nextCalendar(instant: Temporal.Instant): Calendar | null {
    return this.#calendars.reduce<Calendar | null>((best, c) => {
      if (Temporal.Instant.compare(c.startOfYear(), instant) <= 0) return best;
      if (!best || Temporal.Instant.compare(c.startOfYear(), best.startOfYear()) < 0) return c;
      return best;
    }, null);
  }

  #prevCalendar(instant: Temporal.Instant): Calendar | null {
    return this.#calendars.reduce<Calendar | null>((best, c) => {
      if (Temporal.Instant.compare(c.endOfYear(), instant) >= 0) return best;
      if (!best || Temporal.Instant.compare(c.endOfYear(), best.endOfYear()) > 0) return c;
      return best;
    }, null);
  }

  currentInterval(instant: Temporal.Instant = Temporal.Now.instant()): Interval | null {
    const cal = this.#calendarAt(instant);
    return cal ? cal.currentInterval(instant) : null;
  }

  periodAt(instant: Temporal.Instant = Temporal.Now.instant()): Interval | null {
    const interval = this.currentInterval(instant);
    return interval && interval.type === 'period' ? interval : null;
  }

  isSchoolDay(date: Temporal.PlainDate = Temporal.Now.plainDateISO()): boolean {
    const cal = this.#calendarForDate(date);
    return cal ? cal.isSchoolDay(date) : false;
  }

  currentDayBounds(instant: Temporal.Instant = Temporal.Now.instant()): DayBounds | null {
    const cal = this.#calendarAt(instant);
    if (!cal) return null;
    const date = instant.toZonedDateTimeISO(cal.timezone).toPlainDate();
    if (!cal.isSchoolDay(date)) return null;
    const sched = cal.schedule(date);
    return {
      start: sched.startOfDay(date, cal.timezone),
      end: sched.endOfDay(date, cal.timezone),
    };
  }

  nextSchoolDayStart(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Instant {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.nextSchoolDayStart(instant);

    const next = this.#nextCalendar(instant);
    if (next) return next.startOfYear();
    throw new Error('No calendar data available for next school day');
  }

  previousSchoolDayEnd(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Instant {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.previousSchoolDayEnd(instant);

    const prev = this.#prevCalendar(instant);
    if (prev) return prev.endOfYear();
    throw new Error('No calendar data available for previous school day');
  }

  schoolTimeLeft(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Duration {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.schoolTimeLeft(instant);
    return Temporal.Duration.from({ seconds: 0 });
  }

  schoolTimeDone(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Duration {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.schoolTimeDone(instant);
    return Temporal.Duration.from({ seconds: 0 });
  }

  totalSchoolTime(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Duration {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.totalSchoolTime();
    return Temporal.Duration.from({ seconds: 0 });
  }

  nextYearStart(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Instant {
    const next = this.#nextCalendar(instant);
    if (!next) throw new Error('No next year calendar data available');
    return next.startOfYear();
  }

  /**
   * Start of the school year containing `instant`, or null if `instant`
   * isn't within any school year (e.g. during summer).
   */
  currentYearStart(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Instant | null {
    const cal = this.#calendarAt(instant);
    return cal ? cal.startOfYear() : null;
  }

  /**
   * End of the school year containing `instant`, or null if `instant`
   * isn't within any school year (e.g. during summer).
   */
  currentYearEnd(instant: Temporal.Instant = Temporal.Now.instant()): Temporal.Instant | null {
    const cal = this.#calendarAt(instant);
    return cal ? cal.endOfYear() : null;
  }

  schoolTimeBetween(start: Temporal.Instant, end: Temporal.Instant): Temporal.Duration {
    let totalMillis = 0;

    for (const cal of this.#calendars) {
      const calStart = cal.startOfYear();
      const calEnd = cal.endOfYear();

      const from = Temporal.Instant.compare(start, calStart) < 0 ? calStart : start;
      const to = Temporal.Instant.compare(end, calEnd) > 0 ? calEnd : end;

      if (Temporal.Instant.compare(from, to) < 0) {
        totalMillis += cal.schoolTimeBetween(from, to).total({ unit: 'milliseconds' });
      }
    }

    return Temporal.Duration.from({ milliseconds: totalMillis });
  }

  /** Count school days between two plain dates (inclusive of both endpoints). */
  schoolDaysBetween(start: Temporal.PlainDate, end: Temporal.PlainDate): number {
    let count = 0;
    for (const cal of this.#calendars) {
      count += cal.schoolDaysBetween(start, end);
    }
    return count;
  }

  schoolDaysLeft(instant: Temporal.Instant = Temporal.Now.instant()): number {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.schoolDaysLeft(instant);
    return 0;
  }

  calendarDaysLeft(instant: Temporal.Instant = Temporal.Now.instant()): number {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.calendarDaysLeft(instant);
    return 0;
  }

  /** Non-class days from `instant` through end of the active calendar's year. */
  nonClassDaysLeft(instant: Temporal.Instant = Temporal.Now.instant()): NonClassDay[] {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.nonClassDaysLeft(instant);
    return [];
  }

  /** Non-class label for a specific date, or null. */
  nonClassLabel(date: Temporal.PlainDate): string | null {
    const cal = this.#calendarForDate(date);
    return cal ? cal.nonClassLabel(date) : null;
  }

  summerBounds(instant: Temporal.Instant = Temporal.Now.instant()): SummerBounds | null {
    if (this.#calendarAt(instant)) return null;

    const prev = this.#prevCalendar(instant);
    const next = this.#nextCalendar(instant);

    if (!prev && !next) return null;

    return {
      start: prev ? prev.endOfYear() : null,
      end: next ? next.startOfYear() : null,
    };
  }

  /** Find the calendar covering a PlainDate. */
  #calendarForDate(date: Temporal.PlainDate): Calendar | null {
    return this.#calendars.find((c) => {
      return (
        Temporal.PlainDate.compare(c.firstDay, date) <= 0 &&
        Temporal.PlainDate.compare(date, c.lastDay) <= 0
      );
    }) || null;
  }

  nextSchoolDay(date: Temporal.PlainDate): Temporal.PlainDate {
    let d = date.add({ days: 1 });
    for (let i = 0; i < 365; i++) {
      if (this.isSchoolDay(d)) return d;
      d = d.add({ days: 1 });
    }
    throw new Error('No school day found within 365 days');
  }

  previousSchoolDay(date: Temporal.PlainDate): Temporal.PlainDate {
    let d = date.subtract({ days: 1 });
    for (let i = 0; i < 365; i++) {
      if (this.isSchoolDay(d)) return d;
      d = d.subtract({ days: 1 });
    }
    throw new Error('No school day found within 365 days');
  }

  /**
   * Returns the schedule name for a specific date (e.g. 'NORMAL', 'LATE_START'),
   * or null if the date has an inline override or is not a school day.
   */
  scheduleNameFor(date: Temporal.PlainDate): string | null {
    const cal = this.#calendarForDate(date);
    if (!cal || !cal.isSchoolDay(date)) return null;
    return cal.schedule(date).name;
  }

  /** Returns the periods for a specific date. */
  scheduleFor(date: Temporal.PlainDate): ScheduledPeriod[] {
    const cal = this.#calendarForDate(date);
    if (!cal || !cal.isSchoolDay(date)) return [];
    const sched = cal.schedule(date);
    return sched.actualPeriods().map((p) => ({
      name: p.name,
      start: p.startInstant(date, cal.timezone),
      end: p.endInstant(date, cal.timezone),
      tags: p.tags,
    }));
  }

  /** Returns the active periods for the current or next school day. */
  periodsForDate(instant: Temporal.Instant = Temporal.Now.instant()): ScheduledPeriod[] {
    const cal = this.#calendarAt(instant) || this.#nextCalendar(instant);
    if (!cal) return [];

    let date: Temporal.PlainDate;
    if (cal.isInCalendar(instant)) {
      const today = instant.toZonedDateTimeISO(cal.timezone).toPlainDate();
      if (cal.isSchoolDay(today)) {
        const sched = cal.schedule(today);
        const endOfDay = sched.endOfDay(today, cal.timezone);
        date = Temporal.Instant.compare(instant, endOfDay) < 0
          ? today
          : cal.nextSchoolDayStart(instant).toZonedDateTimeISO(cal.timezone).toPlainDate();
      } else {
        date = cal.nextSchoolDayStart(instant).toZonedDateTimeISO(cal.timezone).toPlainDate();
      }
    } else {
      date = cal.firstDay;
    }

    const sched = cal.schedule(date);
    return sched.actualPeriods().map((p) => ({
      name: p.name,
      start: p.startInstant(date, cal.timezone),
      end: p.endInstant(date, cal.timezone),
      tags: p.tags,
    }));
  }
}

export { BellSchedule };

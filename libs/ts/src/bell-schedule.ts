/**
 * BellSchedule — wraps one or more Calendar instances.
 */

import {
  parseOffsetMinutes,
  type AbstractTime,
  type BoundTime,
  type DaySpec,
  type TimeAnchor,
} from './abstract-time.js';
import { Calendar, normalizeIncludeTags, type Interval } from './calendar.js';
import type {
  ActiveAnnotation,
  Annotations,
  BellScheduleOptions,
  NonClassDay,
  ResolvedDateAnnotation,
  ResolvedRangeAnnotation,
  ResolvedWeekAnnotation,
  Role,
  ScheduledPeriod,
  SchoolWeek,
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

/** The bhs-cs heuristic for numbered periods: "Period 3", "Period 3 Final". */
const defaultPeriodNumber = (period: { name: string }): number | null => {
  const m = /^Period (\d+)\b/.exec(period.name);
  return m ? Number(m[1]) : null;
};

class BellSchedule {
  #options: { role: Role; includeTags: Record<number, string[]> };
  #calendars: Calendar[];
  #periodNumber: (period: { name: string }) => number | null;

  constructor(calendarDataArray: YearData[], options: BellScheduleOptions = {}) {
    const role: Role = options.role || 'student';
    const includeTags = normalizeIncludeTags(options.includeTags || {});
    this.#options = { role, includeTags };
    this.#periodNumber = options.periodNumber || defaultPeriodNumber;
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

  /**
   * Whether the given date is a school day. With no date, defaults to today in the
   * system-local timezone; pass `timeZone` to anchor "today" to a specific zone (e.g. the
   * school's) when running elsewhere.
   */
  isSchoolDay(date?: Temporal.PlainDate, timeZone?: string): boolean {
    const d = date ?? Temporal.Now.plainDateISO(timeZone);
    const cal = this.#calendarForDate(d);
    return cal ? cal.isSchoolDay(d) : false;
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

  // ─── School weeks & annotations ───────────────────────────────────────────

  // Whole-year queries operate on the sole/first calendar; date- and
  // week-keyed queries select the calendar the same way nonClassLabel does.
  #firstCalendar(): Calendar {
    return this.#calendars[0];
  }

  /** The canonical school weeks of the (first) year, in chronological order. */
  schoolWeeks(): SchoolWeek[] {
    return this.#firstCalendar().schoolWeeks();
  }

  /** Number of school weeks in the (first) year. */
  schoolWeekCount(): number {
    return this.#firstCalendar().schoolWeekCount();
  }

  /** The school week with the given 1-based number, or null. */
  schoolWeek(n: number): SchoolWeek | null {
    return this.#firstCalendar().schoolWeek(n);
  }

  /** The school week containing `date`, or null. */
  weekForDate(date: Temporal.PlainDate): SchoolWeek | null {
    const cal = this.#calendarForDate(date);
    return cal ? cal.weekForDate(date) : null;
  }

  /** The raw, unvalidated annotations structure of the (first) year. */
  annotations(): Annotations {
    return this.#firstCalendar().annotations();
  }

  /** Range annotations with `start`/`end` resolved to PlainDates. */
  rangeAnnotations(): ResolvedRangeAnnotation[] {
    return this.#firstCalendar().rangeAnnotations();
  }

  /** Week annotations resolved to their school week, ascending by week. */
  weekAnnotations(): ResolvedWeekAnnotation[] {
    return this.#firstCalendar().weekAnnotations();
  }

  /** Date annotations with the key resolved to a PlainDate. */
  dateAnnotations(): ResolvedDateAnnotation[] {
    return this.#firstCalendar().dateAnnotations();
  }

  /** Every annotation active on `date`, tagged with its `source`. */
  annotationsOn(date: Temporal.PlainDate): ActiveAnnotation[] {
    const cal = this.#calendarForDate(date);
    return cal ? cal.annotationsOn(date) : [];
  }

  /** Every annotation touching school week `n` of the (first) year. */
  annotationsForWeek(n: number): ActiveAnnotation[] {
    return this.#firstCalendar().annotationsForWeek(n);
  }

  // ─── Abstract times ─────────────────────────────────────────────────────────

  #firstCalendarDay(): Temporal.PlainDate {
    return this.#calendars.reduce(
      (min, c) => (Temporal.PlainDate.compare(c.firstDay, min) < 0 ? c.firstDay : min),
      this.#calendars[0].firstDay,
    );
  }

  #lastCalendarDay(): Temporal.PlainDate {
    return this.#calendars.reduce(
      (max, c) => (Temporal.PlainDate.compare(c.lastDay, max) > 0 ? c.lastDay : max),
      this.#calendars[0].lastDay,
    );
  }

  #checkInCalendars(date: Temporal.PlainDate, what: string): void {
    if (
      Temporal.PlainDate.compare(date, this.#firstCalendarDay()) < 0 ||
      Temporal.PlainDate.compare(date, this.#lastCalendarDay()) > 0
    ) {
      throw new RangeError(`Resolving ${what} runs outside the loaded calendars at ${date}`);
    }
  }

  /** n school days from `date` (n may be negative; 0 = date itself). */
  addSchoolDays(date: Temporal.PlainDate, n: number): Temporal.PlainDate {
    if (!Number.isInteger(n)) {
      throw new Error(`School-day offset must be an integer, got ${n}`);
    }
    const step = n < 0 ? -1 : 1;
    let remaining = Math.abs(n);
    let d = date;
    while (remaining > 0) {
      d = d.add({ days: step });
      this.#checkInCalendars(d, `${n} school days from ${date}`);
      if (this.isSchoolDay(d)) remaining--;
    }
    return d;
  }

  /** Resolve a day spec against a base date; omitted means the base itself. */
  resolveDay(base: Temporal.PlainDate, day?: DaySpec): Temporal.PlainDate {
    if (!day) return base;
    switch (day.type) {
      case 'date':
        return Temporal.PlainDate.from(day.date);
      case 'schoolDays':
        return this.addSchoolDays(base, day.n);
      case 'weeks':
        // Taken literally — no school-day snapping; validation warns instead.
        return base.add({ weeks: day.n });
      case 'weekday': {
        if (!Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7) {
          throw new Error(`Invalid weekday ${day.weekday} (must be 1=Monday..7=Sunday)`);
        }
        // First matching day strictly after the base; never snapped.
        return base.add({ days: ((day.weekday - base.dayOfWeek + 6) % 7) + 1 });
      }
      case 'week': {
        const monday = base.subtract({ days: base.dayOfWeek - 1 }).add({ weeks: day.n });
        if (day.edge === 'start') {
          // First school day on or after the Monday; a week with no school
          // days advances into the following week ("the first day back").
          let d = monday;
          while (!this.isSchoolDay(d)) {
            this.#checkInCalendars(d, `start of the week of ${monday}`);
            d = d.add({ days: 1 });
          }
          return d;
        }
        // edge === 'end': last school day on or before the Sunday. A week
        // with no school days is an error: walking backward would land at or
        // before the base date and guessing forward is just as wrong.
        for (let d = monday.add({ days: 6 }); Temporal.PlainDate.compare(d, monday) >= 0; d = d.subtract({ days: 1 })) {
          if (this.isSchoolDay(d)) return d;
        }
        throw new Error(`'end of week': the week of ${monday} has no school days`);
      }
      default:
        throw new Error(`Unknown day spec type "${(day as { type: string }).type}"`);
    }
  }

  /**
   * Phase 1: bind the day spec against a base date. Runs timeWarnings on the
   * result and reports anything it finds via onWarning (default: console.warn).
   */
  bindTime(
    base: Temporal.PlainDate,
    t: AbstractTime,
    onWarning: (warning: string) => void = (w) => console.warn(w),
  ): BoundTime {
    const offset = t.offset ?? '+00:00';
    parseOffsetMinutes(offset); // reject malformed offsets at load time
    const date = this.resolveDay(base, t.day);
    const bound: BoundTime = { date: date.toString(), anchor: t.anchor, offset };

    const warnings = this.timeWarnings(bound);
    if (t.day?.type === 'week' && t.day.edge === 'start') {
      const monday = base.subtract({ days: base.dayOfWeek - 1 }).add({ weeks: t.day.n });
      if (Temporal.PlainDate.compare(date, monday.add({ days: 6 })) > 0) {
        warnings.push(
          `'start of week' advanced to ${date}: the week of ${monday} has no school days`,
        );
      }
    }
    for (const w of warnings) onWarning(w);
    return bound;
  }

  /**
   * Sanity-check a bound time against the calendar: human-readable warnings
   * for specs that can't carry their anchor. Empty = OK. (It cannot check a
   * specific period — the period isn't bound yet.)
   */
  timeWarnings(t: BoundTime): string[] {
    if (t.anchor === 'midnight') return []; // midnight on any date is well-defined
    const date = Temporal.PlainDate.from(t.date);
    if (!this.isSchoolDay(date)) {
      return [`${t.anchor} on ${t.date}, which is not a school day`];
    }
    if (t.anchor === 'start_of_period' || t.anchor === 'end_of_period') {
      const numbered = this.scheduleFor(date).some((p) => this.#periodNumber(p) !== null);
      if (!numbered) {
        return [`${t.anchor} on ${t.date}, which has no numbered periods`];
      }
    }
    return [];
  }

  /**
   * Phase 2: resolve a bound time to a concrete time, supplying the period
   * if the anchor needs one. Null when the date has no schedule, no such
   * period, or a period anchor's period is omitted — never a guess.
   */
  resolveTime(t: BoundTime, period?: number): Temporal.ZonedDateTime | null {
    const offsetMinutes = parseOffsetMinutes(t.offset);
    const anchor = this.#anchorTime(Temporal.PlainDate.from(t.date), t.anchor, period);
    // ZonedDateTime.add applies exact elapsed time, so offsets crossing a
    // DST transition resolve correctly.
    return anchor ? anchor.add({ minutes: offsetMinutes }) : null;
  }

  #anchorTime(
    date: Temporal.PlainDate,
    anchor: TimeAnchor,
    period?: number,
  ): Temporal.ZonedDateTime | null {
    const tz = this.timezone;
    switch (anchor) {
      case 'midnight':
        return date.toPlainDateTime({ hour: 0 }).toZonedDateTime(tz);
      case 'start_of_day':
      case 'end_of_day': {
        const periods = this.scheduleFor(date);
        if (periods.length === 0) return null;
        const instant = anchor === 'start_of_day' ? periods[0].start : periods[periods.length - 1].end;
        return instant.toZonedDateTimeISO(tz);
      }
      case 'start_of_period':
      case 'end_of_period': {
        if (period === undefined) return null;
        const p = this.periodOnDate(date, period);
        if (!p) return null;
        return (anchor === 'start_of_period' ? p.start : p.end).toZonedDateTimeISO(tz);
      }
    }
  }

  /** The numbered period on a date, per the periodNumber matcher, or null. */
  periodOnDate(date: Temporal.PlainDate, n: number): ScheduledPeriod | null {
    return this.scheduleFor(date).find((p) => this.#periodNumber(p) === n) ?? null;
  }

  /**
   * The number of the period containing `instant`, or the next numbered
   * period later the same day, or null if neither exists.
   */
  currentOrNextPeriodNumber(instant: Temporal.Instant = Temporal.Now.instant()): number | null {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    for (const p of this.scheduleFor(date)) {
      const n = this.#periodNumber(p);
      if (n !== null && Temporal.Instant.compare(instant, p.end) < 0) return n;
    }
    return null;
  }
}

export { BellSchedule };

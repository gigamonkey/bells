/**
 * BellSchedule — wraps one or more Calendar instances.
 */

import { Calendar, normalizeIncludeTags } from './calendar.js';

class BellSchedule {
  #options;
  #calendars;

  /**
   * @param {object[]} calendarDataArray - Array of year data objects.
   * @param {{ role?: string, includeTags?: string[] | Record<number, string[]> }} [options]
   */
  constructor(calendarDataArray, options = {}) {
    const role = options.role || 'student';
    const includeTags = normalizeIncludeTags(options.includeTags || {});
    this.#options = { role, includeTags };
    this.#calendars = calendarDataArray.map((d) => new Calendar(d, { role, includeTags }));
  }

  /**
   * The timezone shared by all calendars (e.g. 'America/Los_Angeles').
   * @returns {string}
   */
  get timezone() {
    return this.#calendars[0].timezone;
  }

  /**
   * Find the Calendar that covers this instant.
   * @param {Temporal.Instant} instant
   * @returns {Calendar | null}
   */
  #calendarAt(instant) {
    return this.#calendars.find((c) => c.isInCalendar(instant)) || null;
  }

  /**
   * @param {Temporal.Instant} instant
   * @returns {Calendar | null}
   */
  #nextCalendar(instant) {
    return this.#calendars.reduce((best, c) => {
      if (Temporal.Instant.compare(c.startOfYear(), instant) <= 0) return best;
      if (!best || Temporal.Instant.compare(c.startOfYear(), best.startOfYear()) < 0) return c;
      return best;
    }, null);
  }

  /**
   * @param {Temporal.Instant} instant
   * @returns {Calendar | null}
   */
  #prevCalendar(instant) {
    return this.#calendars.reduce((best, c) => {
      if (Temporal.Instant.compare(c.endOfYear(), instant) >= 0) return best;
      if (!best || Temporal.Instant.compare(c.endOfYear(), best.endOfYear()) > 0) return c;
      return best;
    }, null);
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {import('./calendar.js').Interval | null}
   */
  currentInterval(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    return cal ? cal.currentInterval(instant) : null;
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {import('./calendar.js').Interval | null}
   */
  periodAt(instant = Temporal.Now.instant()) {
    const interval = this.currentInterval(instant);
    return interval && interval.type === 'period' ? interval : null;
  }

  /**
   * @param {Temporal.PlainDate} [date]
   * @returns {boolean}
   */
  isSchoolDay(date = Temporal.Now.plainDateISO()) {
    const cal = this.#calendarForDate(date);
    return cal ? cal.isSchoolDay(date) : false;
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {{ start: Temporal.Instant, end: Temporal.Instant } | null}
   */
  currentDayBounds(instant = Temporal.Now.instant()) {
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

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {Temporal.Instant}
   */
  nextSchoolDayStart(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.nextSchoolDayStart(instant);

    const next = this.#nextCalendar(instant);
    if (next) return next.startOfYear();
    throw new Error('No calendar data available for next school day');
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {Temporal.Instant}
   */
  previousSchoolDayEnd(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.previousSchoolDayEnd(instant);

    const prev = this.#prevCalendar(instant);
    if (prev) return prev.endOfYear();
    throw new Error('No calendar data available for previous school day');
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {Temporal.Duration}
   */
  schoolTimeLeft(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.schoolTimeLeft(instant);
    return Temporal.Duration.from({ seconds: 0 });
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {Temporal.Duration}
   */
  schoolTimeDone(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.schoolTimeDone(instant);
    return Temporal.Duration.from({ seconds: 0 });
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {Temporal.Duration}
   */
  totalSchoolTime(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.totalSchoolTime();
    return Temporal.Duration.from({ seconds: 0 });
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {Temporal.Instant}
   */
  nextYearStart(instant = Temporal.Now.instant()) {
    const next = this.#nextCalendar(instant);
    if (!next) throw new Error('No next year calendar data available');
    return next.startOfYear();
  }

  /**
   * @param {Temporal.Instant} start
   * @param {Temporal.Instant} end
   * @returns {Temporal.Duration}
   */
  schoolTimeBetween(start, end) {
    let totalNs = 0n;

    for (const cal of this.#calendars) {
      const calStart = cal.startOfYear();
      const calEnd = cal.endOfYear();

      const from = Temporal.Instant.compare(start, calStart) < 0 ? calStart : start;
      const to = Temporal.Instant.compare(end, calEnd) > 0 ? calEnd : end;

      if (Temporal.Instant.compare(from, to) < 0) {
        const dur = cal.schoolTimeBetween(from, to);
        const secs = BigInt(dur.hours * 3600 + dur.minutes * 60 + dur.seconds);
        totalNs += secs * 1_000_000_000n;
      }
    }

    const totalSeconds = Number(totalNs / 1_000_000_000n);
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    return Temporal.Duration.from({ hours, minutes: minutes % 60, seconds: totalSeconds % 60 });
  }

  /**
   * Count school days between two plain dates (inclusive of both endpoints).
   * @param {Temporal.PlainDate} start
   * @param {Temporal.PlainDate} end
   * @returns {number}
   */
  schoolDaysBetween(start, end) {
    let count = 0;
    for (const cal of this.#calendars) {
      count += cal.schoolDaysBetween(start, end);
    }
    return count;
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {number}
   */
  schoolDaysLeft(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.schoolDaysLeft(instant);
    return 0;
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {number}
   */
  calendarDaysLeft(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.calendarDaysLeft(instant);
    return 0;
  }

  /**
   * Non-class days from `instant` through end of the active calendar's year.
   * @param {Temporal.Instant} [instant]
   * @returns {Array<{ date: Temporal.PlainDate, label: string }>}
   */
  nonClassDaysLeft(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (cal) return cal.nonClassDaysLeft(instant);
    return [];
  }

  /**
   * Non-class label for a specific date, or null.
   * @param {Temporal.PlainDate} date
   * @returns {string | null}
   */
  nonClassLabel(date) {
    const cal = this.#calendarForDate(date);
    return cal ? cal.nonClassLabel(date) : null;
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {{ start: Temporal.Instant, end: Temporal.Instant } | null}
   */
  summerBounds(instant = Temporal.Now.instant()) {
    if (this.#calendarAt(instant)) return null;

    const prev = this.#prevCalendar(instant);
    const next = this.#nextCalendar(instant);

    if (!prev && !next) return null;

    return {
      start: prev ? prev.endOfYear() : null,
      end: next ? next.startOfYear() : null,
    };
  }

  /**
   * Find the calendar covering a PlainDate.
   * @param {Temporal.PlainDate} date
   * @returns {Calendar | null}
   */
  #calendarForDate(date) {
    return this.#calendars.find((c) => {
      return (
        Temporal.PlainDate.compare(c.firstDay, date) <= 0 &&
        Temporal.PlainDate.compare(date, c.lastDay) <= 0
      );
    }) || null;
  }

  /**
   * @param {Temporal.PlainDate} date
   * @returns {Temporal.PlainDate}
   */
  nextSchoolDay(date) {
    let d = date.add({ days: 1 });
    for (let i = 0; i < 365; i++) {
      if (this.isSchoolDay(d)) return d;
      d = d.add({ days: 1 });
    }
    throw new Error('No school day found within 365 days');
  }

  /**
   * @param {Temporal.PlainDate} date
   * @returns {Temporal.PlainDate}
   */
  previousSchoolDay(date) {
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
   * @param {Temporal.PlainDate} date
   * @returns {string | null}
   */
  scheduleNameFor(date) {
    const cal = this.#calendarForDate(date);
    if (!cal || !cal.isSchoolDay(date)) return null;
    return cal.schedule(date).name;
  }

  /**
   * Returns the periods for a specific date.
   * @param {Temporal.PlainDate} date
   * @returns {Array<{ name: string, start: Temporal.Instant, end: Temporal.Instant, tags: string[] }>}
   */
  scheduleFor(date) {
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

  /**
   * Returns the active periods for the current or next school day.
   * @param {Temporal.Instant} [instant]
   * @returns {Array<{ name: string, start: Temporal.Instant, end: Temporal.Instant, tags: string[] }>}
   */
  periodsForDate(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant) || this.#nextCalendar(instant);
    if (!cal) return [];

    let date;
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

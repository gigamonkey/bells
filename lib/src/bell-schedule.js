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
    const cal = this.#calendars.find((c) => {
      return (
        Temporal.PlainDate.compare(c.firstDay, date) <= 0 &&
        Temporal.PlainDate.compare(date, c.lastDay) <= 0
      );
    });
    return cal ? cal.isSchoolDay(date) : false;
  }

  /**
   * @param {Temporal.Instant} [instant]
   * @returns {{ start: Temporal.Instant, end: Temporal.Instant } | null}
   */
  currentDayBounds(instant = Temporal.Now.instant()) {
    const cal = this.#calendarAt(instant);
    if (!cal) return null;
    const date = instant.toZonedDateTime(cal.timezone).toPlainDate();
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
}

export { BellSchedule };

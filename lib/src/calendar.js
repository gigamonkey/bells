/**
 * Calendar, Schedule, Period, and Interval classes.
 * Uses Temporal throughout. No localStorage, no module-level globals.
 */

import { parsePlainDate, resolveScheduleTimes, daysBetween, noon, includesWeekend } from './datetime.js';

/**
 * Normalize the includeTags option.
 * Accepts either a flat array (same tags every weekday) or a per-day-of-week map.
 * Returns a map: { 1: [...], 2: [...], 3: [...], 4: [...], 5: [...] }
 *
 * @param {string[] | Record<number, string[]>} includeTags
 * @returns {Record<number, string[]>}
 */
const normalizeIncludeTags = (includeTags) => {
  if (Array.isArray(includeTags)) {
    return { 1: includeTags, 2: includeTags, 3: includeTags, 4: includeTags, 5: includeTags };
  }
  return includeTags || {};
};

class Calendar {
  #noonInstant(date) {
    return noon(date).toZonedDateTime(this.timezone).toInstant();
  }

  #nextSchoolDay(date) {
    let d = date.add({ days: 1 });
    while (!this.isSchoolDay(d)) {
      d = d.add({ days: 1 });
    }
    return d;
  }

  #previousSchoolDay(date) {
    let d = date.subtract({ days: 1 });
    while (!this.isSchoolDay(d)) {
      d = d.subtract({ days: 1 });
    }
    return d;
  }

  #schoolTimeBetween(start, end) {
    // Clamp start/end to calendar bounds.
    const calStart = this.startOfYear();
    const calEnd = this.endOfYear();
    const cursor = Temporal.Instant.compare(start, calStart) < 0 ? calStart : start;
    const finish = Temporal.Instant.compare(end, calEnd) > 0 ? calEnd : end;

    if (Temporal.Instant.compare(cursor, finish) >= 0) {
      return Temporal.Duration.from({ seconds: 0 });
    }

    let totalNs = 0n;
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
          totalNs += to.epochNanoseconds - from.epochNanoseconds;
        }
      }

      cursorDate = cursorDate.add({ days: 1 });
    }

    const totalSeconds = Number(totalNs / 1_000_000_000n);
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);

    return Temporal.Duration.from({ hours, minutes: minutes % 60, seconds: totalSeconds % 60 });
  }

  /**
   * @param {object} data - One year's calendar data object.
   * @param {{ role: string, includeTags: Record<number, string[]> }} options
   */
  constructor(data, options) {
    this.data = data;
    this.timezone = data.timezone;
    this.role = options.role;
    this.includeTags = normalizeIncludeTags(options.includeTags);

    this.firstDay = parsePlainDate(
      this.role === 'teacher' && data.firstDayTeachers ? data.firstDayTeachers : data.firstDay
    );
    this.lastDay = parsePlainDate(data.lastDay);
    this.schedules = data.schedules;
    this.holidays = data.holidays || [];
    this.teacherWorkDays = data.teacherWorkDays || [];
    this.breakNames = data.breakNames || {};
  }

  /**
   * @param {Temporal.Instant} instant
   * @returns {boolean}
   */
  isInCalendar(instant) {
    return (
      Temporal.Instant.compare(this.startOfYear(), instant) <= 0 &&
      Temporal.Instant.compare(instant, this.endOfYear()) <= 0
    );
  }

  startOfYear() {
    const sched = this.schedule(this.firstDay);
    return sched.firstPeriod().startInstant(this.firstDay, this.timezone);
  }

  endOfYear() {
    const sched = this.schedule(this.lastDay);
    return sched.lastPeriod().endInstant(this.lastDay, this.timezone);
  }

  /**
   * @param {Temporal.PlainDate} date
   * @returns {Schedule}
   */
  schedule(date) {
    const d = date.toString();
    let periods;
    if (d in this.schedules && d >= this.firstDay.toString()) {
      periods = this.schedules[d];
    } else if (date.dayOfWeek === 1) {
      // Monday: late start
      periods = this.schedules['default'].LATE_START;
    } else {
      periods = this.schedules['default'].NORMAL;
    }
    return new Schedule(this, resolveScheduleTimes(periods), date);
  }

  /**
   * @param {Temporal.PlainDate} date
   * @returns {boolean}
   */
  isSchoolDay(date) {
    const dow = date.dayOfWeek;
    return dow !== 6 && dow !== 7 && !this.isHoliday(date);
  }

  /**
   * @param {Temporal.PlainDate} date
   * @returns {boolean}
   */
  isHoliday(date) {
    const d = date.toString();
    return (
      this.holidays.includes(d) &&
      !(this.role === 'teacher' && this.teacherWorkDays.includes(d))
    );
  }

  /**
   * Find the next holiday after the given instant.
   * @param {Temporal.Instant} instant
   * @returns {Temporal.PlainDate}
   */
  nextHoliday(instant) {
    let d = instant.toZonedDateTimeISO(this.timezone).toPlainDate().add({ days: 1 });
    while (!this.isHoliday(d) && Temporal.PlainDate.compare(d, this.lastDay) <= 0) {
      d = d.add({ days: 1 });
    }
    return d;
  }

  /**
   * @param {Temporal.Instant} instant
   * @returns {Temporal.Instant}
   */
  nextSchoolDayStart(instant) {
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

  /**
   * @param {Temporal.Instant} instant
   * @returns {Temporal.Instant}
   */
  previousSchoolDayEnd(instant) {
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

  /**
   * @param {Temporal.Instant} instant
   * @returns {Interval | null}
   */
  currentInterval(instant) {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    const sched = this.schedule(date);
    return sched.currentInterval(instant);
  }

  /**
   * Count school days remaining from `instant` through end of year.
   * @param {Temporal.Instant} instant
   * @returns {number}
   */
  schoolDaysLeft(instant) {
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

  /**
   * Count calendar days remaining until the day after lastDay.
   * @param {Temporal.Instant} instant
   * @returns {number}
   */
  calendarDaysLeft(instant) {
    const date = instant.toZonedDateTimeISO(this.timezone).toPlainDate();
    const endDate = this.lastDay.add({ days: 1 });
    return daysBetween(this.#noonInstant(date), this.#noonInstant(endDate));
  }

  /**
   * Compute total school time (as Duration) from `instant` to end of year.
   * @param {Temporal.Instant} instant
   * @returns {Temporal.Duration}
   */
  schoolTimeLeft(instant) {
    return this.#schoolTimeBetween(instant, this.endOfYear());
  }

  /**
   * Compute school time (as Duration) from start of year to `instant`.
   * @param {Temporal.Instant} instant
   * @returns {Temporal.Duration}
   */
  schoolTimeDone(instant) {
    return this.#schoolTimeBetween(this.startOfYear(), instant);
  }

  /**
   * Total school time in the year.
   * @returns {Temporal.Duration}
   */
  totalSchoolTime() {
    return this.#schoolTimeBetween(this.startOfYear(), this.endOfYear());
  }

  /**
   * Public entry point for cross-instance school-time computation.
   * Clamps to this calendar's bounds before summing.
   * @param {Temporal.Instant} start
   * @param {Temporal.Instant} end
   * @returns {Temporal.Duration}
   */
  schoolTimeBetween(start, end) {
    return this.#schoolTimeBetween(start, end);
  }
}

class Schedule {
  /**
   * @param {Calendar} calendar
   * @param {Array<{name: string, start: Temporal.PlainTime, end: Temporal.PlainTime, tags?: string[], teachers?: boolean}>} periods
   * @param {Temporal.PlainDate} date
   */
  constructor(calendar, periods, date) {
    this.calendar = calendar;
    this.date = date;
    this.rawPeriods = periods.map((x) => new Period(x.name, x.start, x.end, x.tags, x.teachers));

    // Set .next links on actual periods.
    const actual = this.actualPeriods();
    actual.forEach((p, i) => {
      p.next = i < actual.length - 1 ? actual[i + 1] : null;
    });
  }

  #maybeBreak(instant) {
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

  #breakName(days, start, end) {
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

  /**
   * Determine if a period should be included given the current date/config.
   * @param {Period} p
   * @returns {boolean}
   */
  hasPeriod(p) {
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

  /**
   * @returns {Period[]}
   */
  actualPeriods() {
    const base = this.rawPeriods.filter((p) => this.hasPeriod(p));

    if (base.length === 0) return base;

    // Trim optional periods from start and end.
    while (base.length > 0 && (base[0].tags || []).includes('optional')) base.shift();
    while (base.length > 0 && (base[base.length - 1].tags || []).includes('optional')) base.pop();

    return base;
  }

  firstPeriod() {
    return this.actualPeriods()[0];
  }

  lastPeriod() {
    const ps = this.actualPeriods();
    return ps[ps.length - 1];
  }

  /**
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {Temporal.Instant}
   */
  startOfDay(date, timezone) {
    return this.firstPeriod().startInstant(date, timezone);
  }

  /**
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {Temporal.Instant}
   */
  endOfDay(date, timezone) {
    return this.lastPeriod().endInstant(date, timezone);
  }

  /**
   * @param {Temporal.Instant} instant
   * @returns {boolean}
   */
  notInSchool(instant) {
    const date = this.date;
    const tz = this.calendar.timezone;
    return (
      !this.calendar.isSchoolDay(date) ||
      Temporal.Instant.compare(instant, this.endOfDay(date, tz)) >= 0 ||
      Temporal.Instant.compare(instant, this.startOfDay(date, tz)) <= 0
    );
  }

  /**
   * @param {Temporal.Instant} instant
   * @returns {Interval | null}
   */
  currentInterval(instant) {
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
      for (let p = first; p !== null; p = p.next) {
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
  /**
   * @param {string} name
   * @param {Temporal.PlainTime} start
   * @param {Temporal.PlainTime} end
   * @param {string[] | undefined} tags
   * @param {boolean | undefined} teachers
   */
  constructor(name, start, end, tags, teachers) {
    this.name = name;
    this.start = start; // Temporal.PlainTime
    this.end = end;     // Temporal.PlainTime
    this.tags = tags || [];
    this.teachers = !!teachers;
    this.next = null;
  }

  /**
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {Temporal.Instant}
   */
  startInstant(date, timezone) {
    return date.toPlainDateTime(this.start).toZonedDateTime(timezone).toInstant();
  }

  /**
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {Temporal.Instant}
   */
  endInstant(date, timezone) {
    return date.toPlainDateTime(this.end).toZonedDateTime(timezone).toInstant();
  }

  /**
   * @param {Temporal.Instant} instant
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {boolean}
   */
  isAfter(instant, date, timezone) {
    return Temporal.Instant.compare(this.startInstant(date, timezone), instant) > 0;
  }

  /**
   * @param {Temporal.Instant} instant
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {boolean}
   */
  isBefore(instant, date, timezone) {
    return Temporal.Instant.compare(this.endInstant(date, timezone), instant) < 0;
  }

  /**
   * @param {Temporal.Instant} instant
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {boolean}
   */
  contains(instant, date, timezone) {
    return (
      Temporal.Instant.compare(this.startInstant(date, timezone), instant) < 0 &&
      Temporal.Instant.compare(instant, this.endInstant(date, timezone)) < 0
    );
  }

  /**
   * @param {Temporal.PlainDate} date
   * @param {string} timezone
   * @returns {Interval}
   */
  toInterval(date, timezone) {
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
  /**
   * @param {string} name
   * @param {Temporal.Instant} start
   * @param {Temporal.Instant} end
   * @param {boolean} duringSchool
   * @param {'period'|'passing'|'before-school'|'after-school'|'break'} type
   * @param {string[]} tags
   */
  constructor(name, start, end, duringSchool, type, tags) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.duringSchool = duringSchool;
    this.type = type;
    this.tags = tags;
  }

  /**
   * @param {Temporal.Instant} [now]
   * @returns {Temporal.Duration}
   */
  left(now = Temporal.Now.instant()) {
    return now.until(this.end);
  }

  /**
   * @param {Temporal.Instant} [now]
   * @returns {Temporal.Duration}
   */
  done(now = Temporal.Now.instant()) {
    return this.start.until(now);
  }
}

export { Calendar, Schedule, Period, Interval, normalizeIncludeTags };

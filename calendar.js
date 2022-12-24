import { datestring, parseDate, parseTime, daysBetween, noon, includesWeekend } from './datetime.js';

class Calendar {
  firstDay;
  lastDay;
  schedules;
  holidays;
  breakNames;

  constructor(data, extraPeriods) {
    this.firstDay = data.firstDay;
    this.lastDay = data.lastDay;
    this.schedules = data.schedules;
    this.holidays = data.holidays;
    this.breakNames = data.breakNames;
    this.extraPeriods = extraPeriods;
  }

  isInCalendar(t) {
    return this.startOfYear() <= t && t <= this.endOfYear();
  }

  startOfYear() {
    const sched = this.schedule(parseDate(this.firstDay));
    const d = parseDate(this.firstDay);
    return parseTime(sched.firstPeriod(d).start, d);
  }

  endOfYear() {
    const sched = this.schedule(parseDate(this.lastDay));
    const d = parseDate(this.lastDay);
    return parseTime(sched.lastPeriod(d).end, d);
  }

  schedule(t) {
    const d = datestring(t);
    return new Schedule(
      this,
      d in this.schedules
        ? this.schedules[d]
        : t.getDay() === 1
        ? this.schedules['default'].LATE_START
        : this.schedules['default'].NORMAL,
      this.extraPeriods,
    );
  }

  isSchoolDay(t) {
    return t.getDay() !== 0 && t.getDay() !== 6 && !this.isHoliday(t);
  }

  isHoliday(t) {
    return this.holidays.indexOf(datestring(t)) !== -1;
  }

  nextHoliday(t) {
    const d = new Date(t);
    do {
      d.setDate(d.getDate() + 1);
    } while (!this.isHoliday(d));
    return d;
  }

  nextSchoolDayStart(t) {
    if (this.isSchoolDay(t)) {
      const start = this.schedule(t).startOfDay(t);
      if (start > t) {
        return start;
      }
    }
    const next = this.nextSchoolDay(t);
    return this.schedule(next).startOfDay(next);
  }

  previousSchoolDayEnd(t) {
    if (this.isSchoolDay(t)) {
      const end = this.schedule(t).endOfDay(t);
      if (end < t) {
        return end;
      }
    }
    const prev = this.previousSchoolDay(t);
    return this.schedule(prev).endOfDay(prev);
  }

  nextSchoolDay(t) {
    const d = new Date(t);
    do {
      d.setDate(d.getDate() + 1);
    } while (!this.isSchoolDay(d));
    return d;
  }

  previousSchoolDay(t) {
    const d = new Date(t);
    do {
      d.setDate(d.getDate() - 1);
    } while (!this.isSchoolDay(d));
    return d;
  }

  currentOrNextDay(t) {
    if (this.isSchoolDay(t) && t < this.schedule(t).endOfDay(t)) {
      return t;
    } else {
      return this.nextSchoolDay(t);
    }
  }

  schoolDaysLeft(t, s) {
    const end = this.endOfYear();
    let c = 0;

    // Current day, if not over.
    if (this.isSchoolDay(t) && t < s.endOfDay(t)) {
      c++;
    }
    const d = new Date(t);
    do {
      d.setDate(d.getDate() + 1);
      if (this.isSchoolDay(d)) {
        c++;
      }
    } while (noon(d) <= noon(end));
    return c;
  }
}

class Schedule {
  calendar;
  periods;

  constructor(calendar, periods, extraPeriods) {
    this.calendar = calendar;
    this.periods = periods.map((x) => new Period(x.name, x.start, x.end));
    this.periods.forEach((p, i, ps) => {
      if (i < ps.length - 1) {
        p.next = ps[i + 1];
      }
    });
    this.extraPeriods = extraPeriods;
  }

  period(i) {
    return this.periods[i];
  }

  firstPeriod(d) {
    return this.periods[this.firstPeriodIndex(d)];
  }

  lastPeriod(d) {
    return this.periods[this.lastPeriodIndex(d)];
  }

  firstPeriodIndex(d) {
    const firstName = this.periods[0].name;
    const hasZeroPeriod = firstName === 'Period 0' || firstName === 'Staff meeting';
    return hasZeroPeriod ? (this.extraPeriods[d.getDay()].zero ? 0 : 1) : 0;
  }

  lastPeriodIndex(d) {
    const last = this.periods.length - 1;
    const lastName = this.periods[last].name;
    const hasSeventh = lastName === 'Period 7';
    return hasSeventh ? (this.extraPeriods[d.getDay()].seventh ? last : last - 1) : last;
  }

  startOfDay(d) {
    return this.firstPeriod(d).startTime(d);
  }

  endOfDay(d) {
    return this.lastPeriod(d).endTime(d);
  }

  notInSchool(d) {
    return !this.calendar.isSchoolDay(d) || this.endOfDay(d) < d || this.startOfDay(d) > d;
  }

  currentInterval(t) {
    // Figure out what interval we are in. May be an actual period, a passing
    // period, the weekend, a vacation or the period between the end of one
    // school day and the start of the next. (Though we label that last one
    // either "After school" or "Before school" depending which day it is.)

    const daysOff = this.maybeBreak(t);

    if (daysOff) {
      return daysOff;
    } else {
      const first = this.firstPeriod(t);
      const last = this.lastPeriod(t);

      if (first.isAfter(t)) {
        return new Interval('Before school', this.calendar.previousSchoolDayEnd(t), first.startTime(t), false);
      } else if (last.isBefore(t)) {
        return new Interval('After school', last.endTime(t), this.calendar.nextSchoolDayStart(t), false);
      } else {
        for (let p = first; p !== null; p = p.next) {
          if (p.contains(t)) {
            return p.toInterval(t);
          } else if (p.isBefore(t) && p.next.isAfter(t)) {
            return new Interval(`Passing to ${p.next.name}`, p.endTime(t), p.next.startTime(t), true, true);
          }
        }
      }
    }
  }

  /*
   * Breaks include weekends and longer vacations, i.e. any period where the
   * number of days from the end of school to the start of school is three or
   * more (i.e. Friday to Monday is three days.) In theory there could be a mid
   * week break but there aren't actually so all breaks are either weekends,
   * long weekends, or a named break.
   */
  maybeBreak(t) {
    if (this.notInSchool(t)) {
      const prev = this.calendar.previousSchoolDayEnd(t);
      const next = this.calendar.nextSchoolDayStart(t);
      const days = daysBetween(prev, next);
      if (days >= 3) {
        return new Interval(`${this.breakName(days, prev, next)}!`, prev, next, false, true);
      }
    }
  }

  breakName(days, start, end) {
    if (days > 4) {
      return this.calendar.breakNames[datestring(this.calendar.nextHoliday(start))] || 'Vacation';
    } else if (includesWeekend(start, end)) {
      return days > 3 ? 'Long weekend' : 'Weekend';
    } else {
      // This should never happen since all breaks include a weekend
      return 'Mid-week vacation?';
    }
  }
}

/*
 * Actual periods on the schedule. Start and end are strings like 8:03 and
 * 10:30, not connected to any particular date. The startTime and endTime
 * methods can parse the period endpoints to actual times relative to a given
 * date.
 */
class Period {
  constructor(name, start, end) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.next = null; // Set after all periods are made.
  }

  startTime(t) {
    return parseTime(this.start, t);
  }

  endTime(t) {
    return parseTime(this.end, t);
  }

  isAfter(t) {
    return this.startTime(t) > t;
  }

  contains(t) {
    return this.startTime(t) < t && t < this.endTime(t);
  }

  isBefore(t) {
    return this.endTime(t) < t;
  }

  toInterval(t) {
    return new Interval(this.name, this.startTime(t), this.endTime(t), true, false);
  }
}

/*
 * Intervals are specific spans of time on a particular date that may represent
 * a period or one of the intervals between periods.
 */
class Interval {
  constructor(name, start, end, duringSchool, isPassingPeriod) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.duringSchool = duringSchool;
    this.isPassingPeriod = isPassingPeriod;
  }
}

export { Calendar, Schedule, Period, Interval };

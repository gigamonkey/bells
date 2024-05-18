import calendars from './calendars.json';
import { datestring, parseDate, parseTime, daysBetween, noon, includesWeekend } from './datetime.js';

const DEFAULT_EXTRA_PERIODS = Array(7)
  .fill()
  .map(() => ({ zero: false, seventh: false }));

let extraPeriods = JSON.parse(localStorage.getItem('extraPeriods'));
let otherData = JSON.parse(localStorage.getItem('otherData')) || {};

const getZero = (day) => {
  return extraPeriods[day].zero;
};

const getSeventh = (day) => {
  return extraPeriods[day].seventh;
};

const getExt = (day) => {
  return extraPeriods[day].ext;
};

const isTeacher = () => otherData?.isTeacher;

const setZero = (day, value) => {
  extraPeriods[day].zero = value;
  saveConfiguration();
};

const setSeventh = (day, value) => {
  extraPeriods[day].seventh = value;
  saveConfiguration();
};

const setExt = (day, value) => {
  extraPeriods[day].ext = value;
  saveConfiguration();
};

const toggleTeacher = (e) => {
  otherData.isTeacher = !otherData?.isTeacher;
  e.target.innerText = otherData.isTeacher ? '🍎' : '✏️';
  saveConfiguration();
};

const saveConfiguration = () => {
  localStorage.setItem('extraPeriods', JSON.stringify(extraPeriods));
  localStorage.setItem('otherData', JSON.stringify(otherData));
};

if (extraPeriods === null) {
  extraPeriods = DEFAULT_EXTRA_PERIODS;
  saveConfiguration();
}

/**
 * Get the calendar for the given time. Undefined during the summer.
 */
const calendar = (t) => {
  return calendars.map((d) => new Calendar(d, extraPeriods)).find((c) => c.isInCalendar(t));
};

/**
 * Get just the start and end timestamps for the summer.
 */
const summer = (t) => {
  const cals = calendars.map((d) => new Calendar(d, extraPeriods));

  return {
    start: cals
      .map((c) => c.endOfYear())
      .filter((e) => e < t)
      .reduce((max, e) => Math.max(max, e), -Infinity),

    end: cals
      .map((c) => c.startOfYear())
      .filter((s) => s > t)
      .reduce((min, e) => Math.min(min, e), Infinity),
  };
};

/**
 * Get the calendar for the next year, if we have it.
 */
const nextCalendar = (t) => {
  return calendars.map((d) => new Calendar(d, extraPeriods)).find((c) => t < c.startOfYear());
};

class Calendar {
  firstDay;
  lastDay;
  schedules;
  holidays;
  breakNames;

  constructor(data, extraPeriods) {
    this.firstDay = otherData?.isTeacher ? data.firstDayTeachers : data.firstDay;
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

  isLastDay(t) {
    const eoy = this.endOfYear();
    return this.schedule(eoy).startOfDay(eoy) < t;
  }

  schedule(t) {
    const d = datestring(t);
    return new Schedule(
      this,
      d in this.schedules && d >= this.firstDay
        ? this.schedules[d]
        : t.getDay() === 1
        ? this.schedules['default'].LATE_START
        : this.schedules['default'].NORMAL,
      this.extraPeriods,
      t
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
    if (t < this.startOfYear()) {
      return this.startOfYear();
    } else {
      if (this.isSchoolDay(t) && t < this.schedule(t).endOfDay(t)) {
        return t;
      } else {
        return this.nextSchoolDay(t);
      }
    }
  }

  duringSchool(t, s) {
    return this.isSchoolDay(t) && s.startOfDay(t) < t && t < s.endOfDay(t);
  }

  beforeOrDuringSchool(t, s) {
    return this.isSchoolDay(t) && t < s.endOfDay(t);
  }

  schoolDaysLeft(t, s) {

    const end = this.endOfYear();
    const d = new Date(t);

    let c = this.beforeOrDuringSchool(t, s) ? 1 : 0;

    d.setDate(d.getDate() + 1);
    while (noon(d) <= noon(end)) {
      if (this.isSchoolDay(d)) c++;
      d.setDate(d.getDate() + 1);
    }
    return c;
  }

  schoolMillisLeft(t) {
    const eoy = this.endOfYear().getTime();

    let millis = 0;
    let s = this.schedule(t);

    // If we are starting during school, add millis until the end of the day.
    if (this.duringSchool(t, s)) {
      const start = Math.max(new Date(t), s.startOfDay(t));
      millis += s.endOfDay(t).getTime() - start;
      if (s.endOfDay(t).getTime() === eoy) {
        return millis;
      }
    }

    // Now count full days after the current time. (Will be today if we are
    // before school or tomorrow if we are during or after school.)
    let start = this.nextSchoolDayStart(t);
    let end = this.schedule(start).endOfDay(start);
    while (true) {
      millis += end.getTime() - start.getTime();
      if (end.getTime() === eoy) {
        return millis;
      } else {
        start = this.nextSchoolDayStart(end);
        end = this.schedule(start).endOfDay(start);
      }
    }
  }

  calendarDaysLeft(t, s) {
    const end = new Date(this.endOfYear());
    end.setDate(end.getDate() + 1);
    return daysBetween(noon(t), noon(end));
  }
}

class Schedule {
  calendar;
  periods;
  extraPeriods;
  t;
  isTeacher;

  // FIXME: now that we store the time t in the Schedule object there are a
  // bunch of methods that presumably don't need to be passed the time like
  // startOfDay and endOfDay. Either that or be smarter about not making a whole
  // new Schedule object every second which was presumably the original idea: we
  // only need to make a new schedule when it's a new day but then any question
  // about a particular time needs to pass in the time. As it stands we have the
  // worst of both worlds. So fix it one way or the other.
  constructor(calendar, periods, extraPeriods, t) {
    this.calendar = calendar;
    this.periods = periods.map((x) => new Period(x.name, x.start, x.end, x.teachers, x.nonSchool));
    this.periods.forEach((p, i, ps) => {
      if (i < ps.length - 1) {
        p.next = ps[i + 1];
      }
    });
    this.extraPeriods = extraPeriods;
    this.t = t;
    this.isTeacher = otherData?.isTeacher;
  }

  actualPeriods() {
    // Get the actual periods we have. First we filter 0, 7, and Ext periods
    // unless we have them and also all teacher-only periods unless the user is
    // a teacher. Then we trim "nonSchool" periods from the ends of the day.
    // This is for periods like Lunch and Carnival when they're at the end of
    // the day (assuming you don't have 7th or Ext) and you could go home.
    const base = this.periods.filter(p => this.hasPeriod(p));

    while (base[0].nonSchool) base.shift();
    while (base[base.length - 1].nonSchool) base.pop();

    return base;
  }

  hasPeriod(p) {
    const extra = this.extraPeriods[this.t.getDay()];
    if (p.name === 'Period 0') {
      return extra.zero;
    } else if (p.name === 'Period 7') {
      return extra.seventh;
    } else if (p.name === 'Period Ext') {
      return extra.ext;
    } else if (p.teachers) {
      return this.isTeacher;
    } else {
      return true;
    }
  }

  firstPeriod(d) {
    return this.actualPeriods()[0];
  }

  lastPeriod(d) {
    const ps = this.actualPeriods();
    return ps[ps.length - 1];
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
  constructor(name, start, end, teachers, nonSchool) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.teachers = teachers;
    this.nonSchool = nonSchool;
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

  left(t) {
    return this.end - t;
  }

  done(t) {
    return t - this.start;
  }
}

export { calendar, summer, nextCalendar, getZero, getSeventh, getExt, setZero, setSeventh, setExt, toggleTeacher, isTeacher };

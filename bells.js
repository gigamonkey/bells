const DEFAULT_EXTRA_PERIODS = Array(7).fill({ zero: false, seventh: false });

// This variable and the next function can be used in testing but aren't
// otherwise used.
let offset = 0;

const setOffset = (year, month, date, hour = 12, min = 0, second = 0) => {
  offset = new Date(year, month - 1, date, hour, min, second).getTime() - new Date().getTime();
};

//setOffset(2023, 1, 3, 12, 22);

// Always use this to get the "current" time to ease testing.
const now = () => new Date(new Date().getTime() + offset);

const $ = (id) => document.getElementById(id);

const calendars = await fetch("calendars.json").then(r => { if (r.ok) return r.json(); });

class Calendar {

  firstDay;
  lastDay;
  schedules;
  holidays;
  breakNames;

  constructor(data) {
    this.firstDay = data.firstDay;
    this.lastDay = data.lastDay;
    this.schedules = data.schedules;
    this.holidays = data.holidays;
    this.breakNames = data.breakNames;
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
        ? this.schedules["default"].LATE_START
        : this.schedules["default"].NORMAL
    );
  }

  isSchoolDay(t) {
    return t.getDay() !== 0 && t.getDay() !== 6 && !this.isHoliday(t);
  }

  isHoliday(t) {
    return this.holidays.indexOf(datestring(t)) !== -1;
  }

  nextHoliday(t) {
    let d = new Date(t);
    do {
      d.setDate(d.getDate() + 1);
    } while (!this.isHoliday(d));
    return d;
  }

  nextStart(t) {
    if (this.isSchoolDay(t)) {
      const start = this.schedule(t).startOfDay(t);
      if (start > t) {
        return start;
      }
    }
    const next = this.nextDay(t);
    return this.schedule(next).startOfDay(next);
  }

  previousEnd(t) {
    if (this.isSchoolDay(t)) {
      const end = this.schedule(t).endOfDay(t);
      if (end < t) {
        return end;
      }
    }
    const prev = this.previousDay(t);
    return this.schedule(prev).endOfDay(prev);
  }

  nextDay(t) {
    let d = new Date(t);
    do {
      d.setDate(d.getDate() + 1);
    } while (!this.isSchoolDay(d));
    return d;
  }

  previousDay(t) {
    let d = new Date(t);
    do {
      d.setDate(d.getDate() - 1);
    } while (!this.isSchoolDay(d));
    return d;
  }

  currentOrNextDay() {
    const t = now();
    return this.isSchoolDay(t) && t < this.schedule(t).endOfDay(t) ? t : this.nextDay(t);
  }

  schoolDaysLeft(t, s) {
    let end = this.endOfYear();
    let c = 0;

    // Current day, if not over.
    if (this.isSchoolDay(t) && t < s.endOfDay(t)) {
      c++;
    }
    let d = new Date(t);
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

  constructor(calendar, periods) {
    this.calendar = calendar;
    this.periods = periods.map((x) => new Period(x.name, x.start, x.end));
    this.periods.forEach((p, i, ps) => {
      if (i < ps.length - 1) {
        p.next = ps[i + 1];
      }
    });
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
    const hasZeroPeriod = firstName === "Period 0" || firstName === "Staff meeting";
    return hasZeroPeriod ? (extraPeriods[d.getDay()].zero ? 0 : 1) : 0;
  }

  lastPeriodIndex(d) {
    const last = this.periods.length - 1;
    const lastName = this.periods[last].name;
    const hasSeventh = lastName === "Period 7";
    return hasSeventh ? (extraPeriods[d.getDay()].seventh ? last : last - 1) : last;
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
        return new Interval("Before school", this.calendar.previousEnd(t), first.startTime(t), false);

      } else if (last.isBefore(t)) {
        return new Interval("After school", last.endTime(t), this.calendar.nextStart(t), false);

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

  minutesLeftToday(t) {
    let minutes = 0;
    let first = this.firstPeriodIndex(t);
    let last = this.lastPeriodIndex(t);

    for (let i = first; i <= last; i++) {
      let p = this.period(i);
      let interval = p.toInterval(t);
      if (interval.contains(t)) {
        minutes += interval.minutesLeft(t);
      } else if (t <= interval.start) {
        minutes += interval.minutes();
      }
    }
    return minutes;
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
      const prev = this.calendar.previousEnd(t);
      const next = this.calendar.nextStart(t);
      const days = daysBetween(prev, next);
      if (days >= 3) {
        return new Interval(`${this.breakName(days, prev, next)}!`, prev, next, false, true);
      }
    }
  }

  breakName(days, start, end) {
    if (days > 4) {
      return this.calendar.breakNames[datestring(this.calendar.nextHoliday(start))] || "Vacation";
    } else if (includesWeekend(start, end)) {
      return days > 3 ? "Long weekend" : "Weekend";
    } else {
      // This should never happen since all breaks include a weekend
      return "Mid-week vacation?";
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
    this.next = null;
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
 * Intervals are specific spans of time on a particular date.
 */
class Interval {
  constructor(name, start, end, duringSchool, isPassingPeriod) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.duringSchool = duringSchool;
    this.isPassingPeriod = isPassingPeriod;
  }

  contains(t) {
    return this.start <= t && t <= this.end;
  }

  minutesLeft(t) {
    return Math.floor((this.end - t) / (1000 * 60));
  }

  minutes() {
    return (this.end - this.start) / (1000 * 60);
  }
}

// Kept in local storage
let extraPeriods = null;

let togo = true;

const noon = (date) => {
  let d = new Date(date);
  d.setHours(12);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
};

const loadConfiguration = () => {
  extraPeriods = JSON.parse(localStorage.getItem("extraPeriods"));
  if (extraPeriods === null) {
    extraPeriods = DEFAULT_EXTRA_PERIODS;
    saveConfiguration();
  }
};

const saveConfiguration = () => {
  localStorage.setItem("extraPeriods", JSON.stringify(extraPeriods));
};

const setupConfigPanel = () => {
  document.querySelector("#qr").onclick = toggleQR;
  document.querySelector("#gear").onclick = toggleConfig;
  document.querySelector("#sched").onclick = togglePeriods;

  let rows = document.querySelectorAll("#configuration table tbody tr");
  let day = 1;

  for (let node of rows) {
    let cells = node.querySelectorAll("td");
    let zero = cells[1].querySelector("input");
    let seventh = cells[2].querySelector("input");
    let ep = extraPeriods[day];

    zero.checked = ep.zero;
    seventh.checked = ep.seventh;

    zero.onchange = () => {
      ep.zero = zero.checked;
      saveConfiguration();
    };

    seventh.onchange = () => {
      ep.seventh = seventh.checked;
      saveConfiguration();
    };

    day++;
  }
};

const progressBars = () => {
  for (let bar of document.querySelectorAll(".bar")) {
    bar.appendChild(barSpan(0, "done"));
    bar.appendChild(barSpan(0, "togo"));
  }
};

const barSpan = (width, color) => {
  let s = document.createElement("span");
  s.classList.add(color);
  return s;
};

const toggleQR = () => {
  let div = document.querySelector("#qr-code");
  div.style.display = div.style.display === "block" ? "none" : "block";
};

const toggleConfig = () => {
  let table = document.querySelector("#periods_config");
  table.style.display = table.style.display === "table" ? "none" : "table";
};

const togglePeriods = () => {
  let table = document.querySelector("#periods");
  if (table.style.display === "table") {
    table.style.display = "none";
  } else {
    table.replaceChildren();

    let c = calendar(now());
    let t = c.currentOrNextDay();
    let s = c.schedule(t);
    let first = s.firstPeriodIndex(t);
    let last = s.lastPeriodIndex(t);

    for (let i = first; i <= last; i++) {
      let tr = document.createElement("tr");
      let p = s.period(i);
      tr.append(td(p.name));
      tr.append(td(timestring(parseTime(p.start, t))));
      tr.append(td(timestring(parseTime(p.end, t))));
      table.append(tr);
    }
    table.style.display = "table";
  }
};

const update = () => {
  let t = now();
  let c = calendar(t);

  if (!c) {
    $("container").style.background = "rgba(255, 0, 128, 0.25)";
    summerCountdown(t);
  } else {
    const s = c.schedule(t);
    updateProgress(t, c, s);
    updateCountdown(t, c, s);
  }
};

const summerCountdown = (t) => {
  const nextCal = nextCalendar(t);
  if (nextCal) {
    const start = nextCalendar(t).startOfYear();
    const time = daysCountdown(t, start);
    $("untilSchool").replaceChildren(document.createTextNode(`${time} until start of school.`));
    $("summer").style.display = "block";
    $("main").style.display = "none";
    $("noCalendar").style.display = "none";
  } else {
    $("noCalendar").style.display = "block";
    $("main").style.display = "none";
    $("summer").style.display = "none";
  }
};

const daysCountdown = (t, until) => {
  const days = daysBetween(t, until);
  const hours = hoursBetween(t, until);
  return hours <= 24 ? hhmmss(until - t) : `${days} day${days === 1 ? "" : "s"}`;
};

const updateProgress = (t, c, s) => {
  $("noCalendar").style.display = "none";
  $("summer").style.display = "none";
  $("main").style.display = "block";
  const interval = s.currentInterval(t);
  const { start, end, isPassingPeriod, duringSchool } = interval

  // Default to passing period.
  let color = "rgba(64, 0, 64, 0.25)";

  const tenMinutes = 10 * 60 * 1000;
  const inFirstTen = t - start < tenMinutes;
  const inLastTen = end - t < tenMinutes;

  if (!isPassingPeriod) {
    if (inFirstTen || inLastTen) {
      color = "rgba(255, 0, 0, 0.5)";
    } else {
      color = "rgba(64, 0, 255, 0.25)";
    }
  }

  $("container").style.background = color;
  $("period").replaceChildren(periodName(interval), periodTimes(interval));

  const time = togo ? daysCountdown(t, end) : daysCountdown(start, t);
  $("left").innerHTML = time + " " + (togo ? "to go" : "done");
  updateProgressBar("periodbar", start, end, t);

  if (duringSchool) {
    $("today").innerHTML = hhmmss(togo ? s.endOfDay(t) - t : t - s.startOfDay(t)) + " " + (togo ? "to go" : "done");
    updateProgressBar("todaybar", s.startOfDay(t), s.endOfDay(t), t);
  } else {
    $("today").replaceChildren();
    $("todaybar").replaceChildren();
  }
};

const updateCountdown = (t, cal, s) => {
  let days = cal.schoolDaysLeft(t, s);
  if (days === 1) {
    $("countdown").innerHTML = "Last day of school!";
  } else if (days <= 30) {
    const s = days == 1 ? "" : "s";
    $("countdown").innerHTML = `${days} school day${s} left in the year.`;
  } else {
    $("countdown").replaceChildren();
  }
};

const div = (className, contents) => {
  const d = document.createElement("div");
  d.classList.add(className);
  d.innerHTML = contents;
  return d;
};

// Adapted from https://stackoverflow.com/a/17727953
const daysBetween = (start, end) => {
  // A day in UTC always lasts 24 hours (unlike in other time formats)
  const s = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const e = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());

  // so it's safe to divide by 24 hours
  return (s - e) / (1000 * 60 * 60 * 24);
};

const hoursBetween = (start, end) => {
  return Math.abs((end - start) / (1000 * 60 * 60));
};

const updateProgressBar = (id, start, end, t) => {
  let bar = $(id);
  let total = end - start;
  let done = Math.round((100 * (t - start)) / total);
  bar.childNodes[0].style.width = done + "%";
  bar.childNodes[1].style.width = 100 - done + "%";
};

const td = (text) => {
  let td = document.createElement("td");
  td.innerText = text;
  return td;
};

const periodName = (p) => {
  let d = document.createElement("p");
  d.innerHTML = p.name;
  return d;
};

const periodTimes = (p) => {
  let d = document.createElement("p");
  d.innerHTML = timestring(p.start) + "–" + timestring(p.end);
  return d;
};

const timestring = (t) => {
  return hours(t.getHours()) + ":" + xx(t.getMinutes());
};

const datestring = (t) => {
  return t.getFullYear() + "-" + xx(t.getMonth() + 1) + "-" + xx(t.getDate());
};

const hhmmss = (millis) => {
  let seconds = Math.floor(millis / 1000);
  let minutes = Math.floor(seconds / 60);
  let ss = seconds % 60;
  let mm = minutes % 60;
  let hh = Math.floor(minutes / 60);
  return xx(hh) + ":" + xx(mm) + ":" + xx(ss);
};

const countdownText = (millis) => {
  let seconds = Math.floor(millis / 1000);
  let minutes = Math.floor(seconds / 60);
  let ss = seconds % 60;
  let mm = minutes % 60;
  let hours = Math.floor(minutes / 60);
  let hh = hours % 24;
  let dd = Math.floor(hours / 24);
  return `${dd} days, ${hh} hours, ${mm} minutes, ${ss} seconds of school left.`;
};

const hours = (h) => {
  // Render 12 as 12, not 0 as a simple h % 12 would.
  return ((h + 11) % 12) + 1;
};

const xx = (n) => {
  return (n < 10 ? "0" : "") + n;
};

/**
 * Get the calendar for the given time. Undefined during the summer.
 */
const calendar = (t) => {
  return calendars.map((d) => new Calendar(d)).find((c) => c.isInCalendar(t));
};

/**
 * Get the calendar for the next year, if we have it.
 */
const nextCalendar = (t) => {
  return calendars.map((d) => new Calendar(d)).find((c) => t < c.startOfYear());
};

const parseTime = (x, date) => {
  let [h, m] = x.split(":").map((s) => parseInt(s));
  let d = new Date(date);
  d.setHours(h);
  d.setMinutes(m);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
};

const parseDate = (x) => {
  let [year, month, date] = x.split("-").map((s) => parseInt(s));
  return new Date(year, month - 1, date, 12, 0, 0, 0);
};

const tomorrow = (t) => {
  let d = new Date(t);
  d.setDate(d.getDate() + 1);
  return d;
};

const includesWeekend = (start, end) => {
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    if ([0, 6].includes(d.getDay())) {
      return true;
    }
  }
  return false;
};

const go = () => {
  loadConfiguration();
  setupConfigPanel();
  $("left").onclick = () => {
    togo = !togo;
    update();
  };
  progressBars();
  update();
  setTimeout(() => {
    setInterval(update, 1000);
  }, Date.now() % 1000);
};

go();

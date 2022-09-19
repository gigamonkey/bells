const DEFAULT_EXTRA_PERIODS = Array(7).fill({ zero: false, seventh: false });

// This variable and the next function can be used in testing but aren't
// otherwise used.
let offset = 0;

const setOffset = (year, month, date, hour = 12, min = 0, second = 0) => {
  offset = new Date(year, month - 1, date, hour, min, second).getTime() - new Date().getTime();
};

// Always use this to get the "current" time to ease testing.
const now = () => new Date(new Date().getTime() + offset);

const $ = (id) => document.getElementById(id);

const calendars = [
  {
    year: "2022-2023",
    firstDay: "2022-08-15",
    lastDay: "2023-06-02",
    schedules: {
      default: {
        NORMAL: [
          { name: "Period 0", start: "7:26", end: "8:24" },
          { name: "Period 1", start: "8:30", end: "9:28" },
          { name: "Period 2", start: "9:34", end: "10:37" },
          { name: "Period 3", start: "10:43", end: "11:41" },
          { name: "Lunch", start: "11:41", end: "12:21" },
          { name: "Period 4", start: "12:27", end: "13:25" },
          { name: "Period 5", start: "13:31", end: "14:29" },
          { name: "Period 6", start: "14:35", end: "15:33" },
          { name: "Period 7", start: "15:39", end: "16:37" },
        ],
        LATE_START: [
          { name: "Staff meeting", start: "8:03", end: "9:33" },
          { name: "Period 1", start: "10:00", end: "10:43" },
          { name: "Period 2", start: "10:49", end: "11:37" },
          { name: "Period 3", start: "11:43", end: "12:26" },
          { name: "Lunch", start: "12:26", end: "13:06" },
          { name: "Period 4", start: "13:12", end: "13:55" },
          { name: "Period 5", start: "14:01", end: "14:44" },
          { name: "Period 6", start: "14:50", end: "15:33" },
          { name: "Period 7", start: "15:39", end: "16:22" },
        ],
      },
      "2022-09-01": [
        { name: "Period 0", start: "7:26", end: "8:24" },
        { name: "Period 1", start: "8:30", end: "9:12" },
        { name: "Period 2A", start: "9:18", end: "10:26" },
        { name: "Period 2B", start: "10:32", end: "11:40" },
        { name: "Period 3", start: "11:46", end: "12:28" },
        { name: "Lunch", start: "12:28", end: "13:08" },
        { name: "Period 4", start: "13:14", end: "13:56" },
        { name: "Period 5", start: "14:02", end: "14:44" },
        { name: "Period 6", start: "14:50", end: "15:33" },
        { name: "Period 7", start: "15:39", end: "16:37" },
      ],
      "2022-09-22": [

        // Normal schedule during day
        { name: "Period 0", start: "7:26", end: "8:24" },
        { name: "Period 1", start: "8:30", end: "9:28" },
        { name: "Period 2", start: "9:34", end: "10:37" },
        { name: "Period 3", start: "10:43", end: "11:41" },
        { name: "Lunch", start: "11:41", end: "12:21" },
        { name: "Period 4", start: "12:27", end: "13:25" },
        { name: "Period 5", start: "13:31", end: "14:29" },
        { name: "Period 6", start: "14:35", end: "15:33" },
        { name: "Period 7", start: "15:39", end: "16:37" },

        // Back to school night
        { name: "Back to School Period 0", start: "18:15", end: "18:25" },
        { name: "Back to School Period 1", start: "18:30", end: "18:40" },
        { name: "Principal's announcement", start: "18:45", end: "18:50" },
        { name: "Back to School Period 2", start: "18:50", end: "19:00" },
        { name: "Back to School Period 3", start: "19:05", end: "19:15" },
        { name: "Back to School Period 4", start: "19:20", end: "19:30" },
        { name: "Back to School Period 5", start: "19:35", end: "19:45" },
        { name: "Back to School Period 6", start: "19:50", end: "20:00" },
        { name: "Back to School Period 7", start: "20:05", end: "20:15" },
      ],
    },
    holidays: [
      "2022-09-05",
      "2022-10-10",
      "2022-10-28",
      "2022-11-11",
      "2022-11-21",
      "2022-11-22",
      "2022-11-23",
      "2022-11-24",
      "2022-11-25",
      "2022-12-19",
      "2022-12-20",
      "2022-12-21",
      "2022-12-22",
      "2022-12-23",
      "2022-12-26",
      "2022-12-27",
      "2022-12-28",
      "2022-12-29",
      "2022-12-30",
      "2023-01-02",
      "2023-01-16",
      "2023-02-17",
      "2023-02-20",
      "2023-04-03",
      "2023-04-04",
      "2023-04-05",
      "2023-04-06",
      "2023-04-07",
      "2023-05-15",
      "2023-05-29",
    ],
  },
];

class Calendar {
  firstDay;
  lastDay;
  schedules;
  holidays;

  constructor(data) {
    this.firstDay = data.firstDay;
    this.lastDay = data.lastDay;
    this.schedules = data.schedules;
    this.holidays = data.holidays;
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
      d in this.schedules
        ? this.schedules[d]
        : t.getDay() === 1
        ? this.schedules["default"].LATE_START
        : this.schedules["default"].NORMAL
    );
  }

  isSchoolDay(t) {
    return t.getDay() !== 0 && t.getDay() !== 6 && this.holidays.indexOf(datestring(t)) == -1;
  }

  isHoliday(t) {
    return this.holidays.indexOf(datestring(t)) !== -1;
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
    let t = now();
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
  periods;

  constructor(periods) {
    this.periods = periods.map((x) => new Period(x.name, x.start, x.end));
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
    const hasExtra = this.periods[0].name === "Period 0";
    return hasExtra ? (extraPeriods[d.getDay()].zero ? 0 : 1) : 0;
  }

  lastPeriodIndex(d) {
    const last = this.periods.length - 1;
    const hasExtra = this.periods[last].name === "Period 7";
    return hasExtra ? (extraPeriods[d.getDay()].seventh ? last : last - 1) : last;
  }

  startOfDay(d) {
    return this.firstPeriod(d).startTime(d);
  }

  endOfDay(d) {
    return this.lastPeriod(d).endTime(d);
  }

  currentPeriod(t) {
    // Figure out what period, if any, we are in. May be the weekend or
    // the long period between the end of school today and the start of
    // school tomorrow or from the end of school yesterday and the start
    // of school today.
    let c = calendar(t);

    let weekend = this.maybeWeekend(t, c);
    let holiday = this.maybeHoliday(t, c);

    if (weekend !== null) {
      return weekend;
    } else if (holiday !== null) {
      return holiday;
    } else {
      let first = this.firstPeriodIndex(t);
      let last = this.lastPeriodIndex(t);

      for (let i = first; i <= last; i++) {
        let p = this.period(i);
        let start = p.startTime(t);
        let end = p.endTime(t);

        if (i === first && t < start) {
          const prevDay = c.previousDay(t);
          return new Interval("Before school", c.schedule(prevDay).endOfDay(prevDay), start, false);
        } else if (start <= t && t <= end) {
          return p.toInterval(t);
        } else if (i === last) {
          const nextDay = c.nextDay(t);
          return new Interval("After school", end, c.schedule(nextDay).startOfDay(nextDay), false);
        } else {
          let next = this.period(i + 1);
          let nextStart = next.startTime(t);
          if (t <= nextStart) {
            return new Interval(`Passing to ${next.name}`, end, nextStart, true, true);
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

  maybeWeekend(t, c) {
    let day = t.getDay();
    let isWeekend = false;
    let start;

    if (day === 5 && this.endOfDay(t) < t) {
      isWeekend = true;
      start = this.endOfDay(t);
    } else if ([0, 6].includes(day)) {
      isWeekend = true;
      const prev = c.previousDay(t);
      start = c.schedule(prev).endOfDay(prev);
    }

    if (isWeekend) {
      const next = c.nextDay(t);
      const end = c.schedule(next).startOfDay(next);
      const label = start.getDay() < 5 || end.getDay() > 1 ? "Long weekend!" : "Weekend!";
      return new Interval(label, start, end, false, true);
    } else {
      return null;
    }
  }

  maybeHoliday(t, c) {
    if (c.isHoliday(t)) {
      const prev = c.previousDay(t);
      const next = c.nextDay(t);
      const start = c.schedule(prev).endOfDay(prev);
      const end = c.schedule(next).startOfDay(next);
      return new Interval("Holiday!", start, end, false, true);
    } else {
      return null;
    }
  }
}

// Actual periods on the schedle.
class Period {
  constructor(name, start, end) {
    this.name = name;
    this.start = start;
    this.end = end;
  }

  startTime(t) {
    return parseTime(this.start, t);
  }

  endTime(t) {
    return parseTime(this.end, t);
  }

  toInterval(t) {
    return new Interval(this.name, this.startTime(t), this.endTime(t), true, false);
  }
}

// An actual concrete named interval of time.
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

function noon(date) {
  let d = new Date(date);
  d.setHours(12);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

function onLoad(event) {
  if (event.target.readyState === "complete") {
    loadConfiguration();
    setupConfigPanel();
    $("left").onclick = () => {
      togo = !togo;
      update();
    };
    progressBars();
    update();
    setInterval(update, 1000);
  }
}

function loadConfiguration() {
  extraPeriods = JSON.parse(localStorage.getItem("extraPeriods"));
  if (extraPeriods === null) {
    extraPeriods = DEFAULT_EXTRA_PERIODS;
    saveConfiguration();
  }
}

function saveConfiguration() {
  localStorage.setItem("extraPeriods", JSON.stringify(extraPeriods));
}

function setupConfigPanel() {
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
}

function progressBars() {
  for (let bar of document.querySelectorAll(".bar")) {
    bar.appendChild(barSpan(0, "done"));
    bar.appendChild(barSpan(0, "togo"));
  }
}

function barSpan(width, color) {
  let s = document.createElement("span");
  s.classList.add(color);
  return s;
}

function toggleQR() {
  let div = document.querySelector("#qr-code");
  div.style.display = div.style.display === "block" ? "none" : "block";
}

function toggleConfig() {
  let table = document.querySelector("#periods_config");
  table.style.display = table.style.display === "table" ? "none" : "table";
}

function togglePeriods() {
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
}

function update() {
  let t = now();
  let c = calendar(t);

  if (!c) {
    $("container").style.background = "rgba(255, 0, 128, 0.25)";
    summerCountdown(t);
  } else {
    let s = c.schedule(t);
    updateProgress(t, c, s);
    updateCountdown(t, c, s);
  }
}

function summerCountdown(t) {
  const nextCal = nextCalendar(t);
  if (nextCal) {
    const start = nextCalendar(t).startOfYear();
    const days = daysBetween(t, start);
    const hours = hoursBetween(t, start);
    const time = hours <= 24 ? hhmmss(start - t) : `${days} day${days === 1 ? "" : "s"}`;
    $("untilSchool").replaceChildren(document.createTextNode(`${time} until start of school.`));
    $("summer").style.display = "block";
    $("main").style.display = "none";
    $("noCalendar").style.display = "none";
  } else {
    $("noCalendar").style.display = "block";
    $("main").style.display = "none";
    $("summer").style.display = "none";
  }
}

function updateProgress(t, c, s) {
  $("noCalendar").style.display = "none";
  $("summer").style.display = "none";
  $("main").style.display = "block";
  let p = s.currentPeriod(t);

  // Default to passing period.
  let color = "rgba(64, 0, 64, 0.25)";

  const tenMinutes = (10 * 60 * 1000);
  const inFirstTen = (t - p.start) < tenMinutes;
  const inLastTen = (p.end - t) < tenMinutes;

  if (!p.isPassingPeriod) {
    if (inFirstTen || inLastTen) {
      color = "rgba(255, 0, 0, 0.5)";
    } else {
      color = "rgba(64, 0, 255, 0.25)";
    }
  }

  $("container").style.background = color;
  $("period").replaceChildren(periodName(p), periodTimes(p));
  $("left").innerHTML = hhmmss(togo ? p.end - t : t - p.start) + " " + (togo ? "to go" : "done");
  updateProgressBar("periodbar", p.start, p.end, t);

  if (p.duringSchool) {
    $("today").innerHTML = hhmmss(togo ? s.endOfDay(t) - t : t - s.startOfDay(t)) + " " + (togo ? "to go" : "done");
    updateProgressBar("todaybar", s.startOfDay(t), s.endOfDay(t), t);
  } else {
    $("today").replaceChildren();
    $("todaybar").replaceChildren();
  }
}

function updateCountdown(t, cal, s) {
  let days = cal.schoolDaysLeft(t, s);
  if (days === 1) {
    $("countdown").innerHTML = "Last day of school!";
  } else if (days <= 30) {
    const s = days == 1 ? "" : "s";
    $("countdown").innerHTML = `${days} school day${s} left in the year.`;
  } else {
    $("countdown").replaceChildren();
  }
}

function div(className, contents) {
  const d = document.createElement("div");
  d.classList.add(className);
  d.innerHTML = contents;
  return d;
}

// Adapted from https://stackoverflow.com/a/17727953
function daysBetween(start, end) {
  // A day in UTC always lasts 24 hours (unlike in other time formats)
  const s = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const e = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());

  // so it's safe to divide by 24 hours
  return (s - e) / (1000 * 60 * 60 * 24);
}

function hoursBetween(start, end) {
  return Math.abs((end - start) / (1000 * 60 * 60));
}

function updateProgressBar(id, start, end, t) {
  let bar = $(id);
  let total = end - start;
  let done = Math.round((100 * (t - start)) / total);
  bar.childNodes[0].style.width = done + "%";
  bar.childNodes[1].style.width = 100 - done + "%";
}

function td(text) {
  let td = document.createElement("td");
  td.innerText = text;
  return td;
}

function periodName(p) {
  let d = document.createElement("p");
  d.innerHTML = p.name;
  return d;
}

function periodTimes(p) {
  let d = document.createElement("p");
  d.innerHTML = timestring(p.start) + "–" + timestring(p.end);
  return d;
}

function timestring(t) {
  return hours(t.getHours()) + ":" + xx(t.getMinutes());
}

function datestring(t) {
  return t.getFullYear() + "-" + xx(t.getMonth() + 1) + "-" + xx(t.getDate());
}

function hhmmss(millis) {
  let seconds = Math.floor(millis / 1000);
  let minutes = Math.floor(seconds / 60);
  let ss = seconds % 60;
  let mm = minutes % 60;
  let hh = Math.floor(minutes / 60);
  return xx(hh) + ":" + xx(mm) + ":" + xx(ss);
}

function countdownText(millis) {
  let seconds = Math.floor(millis / 1000);
  let minutes = Math.floor(seconds / 60);
  let ss = seconds % 60;
  let mm = minutes % 60;
  let hours = Math.floor(minutes / 60);
  let hh = hours % 24;
  let dd = Math.floor(hours / 24);
  return `${dd} days, ${hh} hours, ${mm} minutes, ${ss} seconds of school left.`;
}

function hours(h) {
  // Render 12 as 12, not 0 as a simple h % 12 would.
  return ((h + 11) % 12) + 1;
}

function xx(n) {
  return (n < 10 ? "0" : "") + n;
}

/**
 * Get the calendar for the given time. Undefined during the summer.
 */
function calendar(t) {
  return calendars.map((d) => new Calendar(d)).find((c) => c.isInCalendar(t));
}

/**
 * Get the calendar for the next year, if we have it.
 */
function nextCalendar(t) {
  return calendars.map((d) => new Calendar(d)).find((c) => t < c.startOfYear());
}

function parseTime(x, date) {
  let [h, m] = x.split(":").map((s) => parseInt(s));
  let d = new Date(date);
  d.setHours(h);
  d.setMinutes(m);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

function parseDate(x) {
  let [year, month, date] = x.split("-").map((s) => parseInt(s));
  return new Date(year, month - 1, date, 12, 0, 0, 0);
}

document.addEventListener("readystatechange", onLoad);

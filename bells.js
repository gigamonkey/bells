const DEFAULT_EXTRA_PERIODS = Array(7).fill({ zero: false, seventh: false });

//const offset = new Date(2022,5,3,10,31,55).getTime() - new Date().getTime();
const offset = 0;

// Always use this to get the "current" time to ease testing.
const now = () => {
  // const minutes = (m) => m * 1000 * 60;
  // const hours = (h) => h * minutes(60);
  // const days = (d) => d * hours(24);
  let t = new Date();
  t.setTime(t.getTime() + offset);
  return t;
};

const calendars = [
  {
    year: "2021-2022",
    firstDay: "2021-08-16",
    lastDay: "2022-06-03",

    schedules: {
      default: {
        NORMAL: [
          { period: "Period 0", start: "07:23", end: "08:21" },
          { period: "Period 1", start: "08:27", end: "09:25" },
          { period: "Period 2", start: "09:31", end: "10:34" },
          { period: "Period 3", start: "10:40", end: "11:38" },
          { period: "Lunch", start: "11:38", end: "12:18" },
          { period: "Period 4", start: "12:24", end: "13:22" },
          { period: "Period 5", start: "13:28", end: "14:26" },
          { period: "Period 6", start: "14:32", end: "15:30" },
          { period: "Period 7", start: "15:36", end: "16:34" },
        ],
        LATE_START: [
          { period: "Staff meeting", start: "08:00", end: "09:30" },
          { period: "Period 1", start: "09:57", end: "10:40" },
          { period: "Period 2", start: "10:46", end: "11:34" },
          { period: "Period 3", start: "11:40", end: "12:23" },
          { period: "Lunch", start: "12:23", end: "13:03" },
          { period: "Period 4", start: "13:09", end: "13:52" },
          { period: "Period 5", start: "13:58", end: "14:41" },
          { period: "Period 6", start: "14:47", end: "15:30" },
          { period: "Period 7", start: "15:36", end: "16:19" },
        ],
      },
      "2022-05-25": [
        { period: "Period 0", start: "7:23", end: "8:21" },
        { period: "Period 1", start: "8:27", end: "9:07" },
        { period: "Period 2", start: "9:13", end: "9:53" },
        { period: "Period 3", start: "9:59", end: "10:39" },
        { period: "Period 4", start: "10:45", end: "11:25" },
        { period: "Lunch", start: "11:25", end: "12:05" },
        { period: "Period 5", start: "12:11", end: "12:51" },
        { period: "Period 6", start: "12:57", end: "13:37" },
        { period: "Period 7", start: "15:36", end: "16:34" },
      ],
      "2022-05-31": [
        { period: "Period 1 Exam", start: "8:30", end: "10:30" },
        { period: "Period 2 Exam", start: "10:40", end: "12:40" },
        { period: "Lunch", start: "12:40", end: "13:20" },
        { period: "Make Up", start: "13:26", end: "14:32" },
      ],
      "2022-06-01": [
        { period: "Period 3 Exam", start: "8:30", end: "10:30" },
        { period: "Period 4 Exam", start: "10:40", end: "12:40" },
        { period: "Lunch", start: "12:40", end: "13:20" },
        { period: "Make Up", start: "13:26", end: "14:32" },
      ],
      "2022-06-02": [
        { period: "Period 5 Exam", start: "8:30", end: "10:30" },
        { period: "Period 6 Exam", start: "10:40", end: "12:40" },
        { period: "Lunch", start: "12:40", end: "13:20" },
        { period: "Make Up", start: "13:26", end: "14:32" },
      ],
      "2022-06-03": [{ period: "Make Up", start: "8:40", end: "12:40" }],
    },

    holidays: [
      "2021-09-06",
      "2021-10-11",
      "2021-10-29",
      "2021-11-22",
      "2021-11-23",
      "2021-11-24",
      "2021-11-25",
      "2021-11-26",
      "2021-12-20",
      "2021-12-21",
      "2021-12-22",
      "2021-12-23",
      "2021-12-24",
      "2021-12-25",
      "2021-12-26",
      "2021-12-27",
      "2021-12-28",
      "2021-12-29",
      "2021-12-30",
      "2021-12-31",
      "2022-01-17",
      "2022-01-31",
      "2022-02-18",
      "2022-02-21",
      "2022-04-04",
      "2022-04-05",
      "2022-04-06",
      "2022-04-07",
      "2022-04-08",
      "2022-05-16",
      "2022-05-30",
    ],
  },

  {
    year: "2022-2023",
    firstDay: "2022-08-15",
    lastDay: "2023-06-02",
    schedules: {
      default: {
        NORMAL: [
          { period: "Period 0", start: "7:26", end: "8:24" },
          { period: "Period 1", start: "8:30", end: "9:28" },
          { period: "Period 2", start: "9:34", end: "10:37" },
          { period: "Period 3", start: "10:43", end: "11:41" },
          { period: "Lunch", start: "11:41", end: "12:21" },
          { period: "Period 4", start: "12:27", end: "13:25" },
          { period: "Period 5", start: "13:31", end: "14:29" },
          { period: "Period 6", start: "14:35", end: "15:33" },
          { period: "Period 7", start: "15:39", end: "16:37" },
        ],
        LATE_START: [
          { period: "Staff meeting", start: "8:03", end: "9:33" },
          { period: "Period 1", start: "10:00", end: "10:43" },
          { period: "Period 2", start: "10:49", end: "11:37" },
          { period: "Period 3", start: "11:43", end: "12:26" },
          { period: "Lunch", start: "12:26", end: "13:06" },
          { period: "Period 4", start: "13:12", end: "13:55" },
          { period: "Period 5", start: "14:01", end: "14:44" },
          { period: "Period 6", start: "14:50", end: "15:33" },
          { period: "Period 7", start: "15:39", end: "16:22" },
        ],
      },
    },
    holidays: [
      "2022-09-05",
      "2022-10-10",
      "2022-10-28",
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
      "2022-12-24",
      "2022-12-25",
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

class Schedule {
  periods;

  constructor(periods) {
    this.periods = periods;
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
    return this.periods.length == 9 ? (extraPeriods[d.getDay()].zero ? 0 : 1) : 0;
  }

  lastPeriodIndex(d) {
    return this.periods.length == 9 ? (extraPeriods[d.getDay()].seventh ? 8 : 7) : this.periods.length - 1;
  }

  startOfDay(d) {
    return toDate(this.firstPeriod(d).start, d);
  }

  endOfDay(d) {
    return toDate(this.lastPeriod(d).end, d);
  }

  currentPeriod(t) {
    // Figure out what period, if any, we are in. May be the weekend or
    // the long period between the end of school today and the start of
    // school tomorrow or from the end of school yesterday and the start
    // of school today.

    let weekend = this.maybeWeekend(t);

    if (weekend !== null) {
      return weekend;
    } else {
      let first = this.firstPeriodIndex(t);
      let last = this.lastPeriodIndex(t);

      for (let i = first; i <= last; i++) {
        let start = toDate(this.period(i).start, t);
        let end = toDate(this.period(i).end, t);

        if (i === first && t < start) {
          return new Period("Before school", this.endOfDay(previousDay(t)), start, false);
        } else if (start <= t && t <= end) {
          return new Period(this.period(i).period, start, end);
        } else if (i === last) {
          return new Period("After school", end, this.startOfDay(nextDay(t)), false);
        } else {
          let nextStart = toDate(this.period(i + 1).start, t);
          if (t <= nextStart) {
            return new Period("Passing period", end, nextStart, true, true);
          }
        }
      }
    }
  }

  maybeWeekend(t) {
    let day = t.getDay();
    let isWeekend = false;
    let start;

    if (day === 5 && this.endOfDay(t) < t) {
      isWeekend = true;
      start = this.endOfDay(t);
    } else if ([0, 6].includes(day)) {
      isWeekend = true;
      start = this.endOfDay(previousDay(t));
    }

    return isWeekend ? new Period("Weekend!", start, this.startOfDay(nextDay(t)), false, true) : null;
  }
}

// Kept in local storage
let extraPeriods = null;

let togo = true;

class Period {
  constructor(name, start, end, duringSchool = true, passingPeriod = false) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.duringSchool = duringSchool;
    this.passingPeriod = passingPeriod;
  }
}

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
    document.getElementById("left").onclick = () => {
      togo = !togo;
      update();
    };
    progressBars();
    update();
    setInterval(update, 1000);
  }
}

function nextDay(t) {
  let c = calendar(t);
  let d = new Date(t);
  do {
    d.setDate(d.getDate() + 1);
  } while (!isSchoolDay(d, c));
  return d;
}

function previousDay(t) {
  let c = calendar(t);
  let d = new Date(t);
  do {
    d.setDate(d.getDate() - 1);
  } while (!isSchoolDay(d, c));
  return d;
}

function currentOrNextDay() {
  // Current if it's a school day and the day is not over, next otherwise
  let t = now();
  let s = schedule(t);
  if ([0, 6].includes(t.getDay())) {
    return nextDay(t);
  } else {
    return t < s.endOfDay(t) ? t : nextDay(t);
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

    let t = currentOrNextDay();
    let s = schedule(t);
    console.log(JSON.stringify(s.periods));
    let first = s.firstPeriodIndex(t);
    let last = s.lastPeriodIndex(t);

    for (let i = first; i <= last; i++) {
      let tr = document.createElement("tr");
      let p = s.period(i);
      tr.append(td(p.period));
      tr.append(td(timestring(toDate(p.start, t))));
      tr.append(td(timestring(toDate(p.end, t))));
      table.append(tr);
    }
    table.style.display = "table";
  }
}

function td(text) {
  let td = document.createElement("td");
  td.innerText = text;
  return td;
}

function update() {
  let t = now();

  let cal = calendar(t);

  if (!cal) {
    document.getElementById("container").style.background = "rgba(64, 0, 255, 0.25)";
    summerCountdown(t);
  } else {
    let s = schedule(t);
    let p = s.currentPeriod(t);
    let color = p.passingPeriod ? "rgba(64, 0, 64, 0.25)" : "rgba(64, 0, 255, 0.25)";
    document.getElementById("container").style.background = color;
    document.getElementById("period").replaceChildren(periodName(p), periodTimes(p));
    document.getElementById("left").innerHTML =
      hhmmss(togo ? p.end - t : t - p.start) + " " + (togo ? "to go" : "done");
    updateProgressBar("periodbar", p.start, p.end, t);

    if (p.duringSchool) {
      document.getElementById("today").innerHTML =
        hhmmss(togo ? s.endOfDay(t) - t : t - s.startOfDay(t)) + " " + (togo ? "to go" : "done");
      updateProgressBar("todaybar", s.startOfDay(t), s.endOfDay(t), t);
    } else {
      document.getElementById("today").replaceChildren();
    }
    updateCountdown(t, cal, s);
  }
}

function summerCountdown(t) {
  const days = daysBetween(t, startOfYear(nextCalendar(t)));
  const s = days == 1 ? "" : "s";
  document.getElementById("period").innerHTML = "Summer vacation!";
  document.getElementById("left").innerHTML = `${days} day${s} until start of school.`;
}

function updateCountdown(t, cal, s) {
  let days = schoolDaysLeft(t, cal, s);
  console.log(days);
  if (days == 1) {
    document.getElementById("countdown").innerHTML = "Last day of school!";
  } else if (days <= 30) {
    const s = days == 1 ? "" : "s";
    document.getElementById("countdown").innerHTML = `${days} school day${s} left in the year.`;
  }
}

// Adapted from https://stackoverflow.com/a/17727953
function daysBetween(start, end) {
  // A day in UTC always lasts 24 hours (unlike in other time formats)
  const s = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const e = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());

  // so it's safe to divide by 24 hours
  return (s - e) / (1000 * 60 * 60 * 24);
}

function updateProgressBar(id, start, end, t) {
  let bar = document.getElementById(id);
  let total = end - start;
  let done = Math.round((100 * (t - start)) / total);
  bar.childNodes[0].style.width = done + "%";
  bar.childNodes[1].style.width = 100 - done + "%";
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

function hours(h) {
  // Render 12 as 12, not 0 as a simple h % 12 would.
  return ((h + 11) % 12) + 1;
}

function xx(n) {
  return (n < 10 ? "0" : "") + n;
}

/**
 * Get schedule for the given time. Undefined during the summer.
 */
function schedule(t) {
  const c = calendar(t);
  const d = datestring(t);
  if (c) {
    if (d in c.schedules) {
      return new Schedule(c.schedules[d]);
    } else {
      const s = c.schedules["default"];
      return new Schedule(t.getDay() === 1 ? s.LATE_START : s.NORMAL);
    }
  }
}

/**
 * Get the calendar for the given time. Undefined during the summer.
 */
function calendar(t) {
  return calendars.find((c) => isInCalendar(t, c));
}

function nextCalendar(t) {
  return calendars.find((c) => t < startOfYear(c));
}

function startOfYear(c) {
  const sched = scheduleForDay(c.firstDay, c);
  const t = toDay(c.firstDay);
  const x = toDate(sched.firstPeriod(t).start);
  t.setHours(x.getHours());
  t.setMinutes(x.getMinutes());
  return t;
}

function endOfYear(c) {
  const sched = scheduleForDay(c.lastDay, c);
  const t = toDay(c.lastDay);
  const x = toDate(sched.lastPeriod(t).end);
  t.setHours(x.getHours());
  t.setMinutes(x.getMinutes());
  return t;
}

function scheduleForDay(d, c) {
  const t = toDay(d);
  return new Schedule(
    d in c.schedules
      ? c.schedules[d]
      : t.getDate() === 1
      ? c.schedules["default"].LATE_START
      : c.schedules["default"].NORMAL
  );
}

function isInCalendar(t, cal) {
  return startOfYear(cal) <= t && t <= endOfYear(cal);
}

function toDate(x, date) {
  let [h, m] = x.split(":").map((s) => parseInt(s));
  let d = new Date(date || now());
  d.setHours(h);
  d.setMinutes(m);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

function toDay(x) {
  let [year, month, date] = x.split("-").map((s) => parseInt(s));
  return new Date(year, month - 1, date, 12, 0, 0, 0);
}

function schoolDaysLeft(t, calendar, s) {
  let end = endOfYear(calendar);
  let c = 0;

  // Current day, if not over.
  if (isSchoolDay(t, calendar) && t < s.endOfDay(t)) {
    c++;
  }
  let d = new Date(t);
  do {
    d.setDate(d.getDate() + 1);
    if (isSchoolDay(d, calendar)) {
      c++;
    }
  } while (noon(d) <= noon(end));
  return c;
}

function isSchoolDay(d, calendar) {
  return d.getDay() !== 0 && d.getDay() !== 6 && calendar.holidays.indexOf(datestring(d)) == -1;
}

document.addEventListener("readystatechange", onLoad);

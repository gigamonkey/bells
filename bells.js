const TO_NEXT_SCHOOL_DAY = [1, 1, 1, 1, 1, 3, 2];

const DEFAULT_EXTRA_PERIODS = Array(7).fill({ zero: false, seventh: false });

const PERIODS = [
  "Period 0",
  "Period 1",
  "Period 2",
  "Period 3",
  "Lunch",
  "Period 4",
  "Period 5",
  "Period 6",
  "Period 7",
];

const CALENDAR_2021_2022 = {
  year: "2021-2022",
  firstDay: "2022-08-16",
  lastDay: "2022-06-03",
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
};

const CALENDAR_2022_2023 = {
  year: "2022-2023",
  firstDay: "2022-08-15",
  lastDay: "2023-06-02",
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
};

const LAST_DAY_2021_22 = toDay(CALENDAR_2021_2022.lastDay);
const FIRST_DAY_2022_23 = toDay(CALENDAR_2022_2023.firstDay);

const SCHEDULES_2021_2022 = {
  NORMAL: [
    { start: "07:23", end: "08:21" },
    { start: "08:27", end: "09:25" },
    { start: "09:31", end: "10:34" },
    { start: "10:40", end: "11:38" },
    { start: "11:38", end: "12:18" },
    { start: "12:24", end: "13:22" },
    { start: "13:28", end: "14:26" },
    { start: "14:32", end: "15:30" },
    { start: "15:36", end: "16:34" },
  ],
  LATE_START: [
    { start: "08:00", end: "09:30" }, // Staff meeting, no zero period on Monday.
    { start: "09:57", end: "10:40" },
    { start: "10:46", end: "11:34" },
    { start: "11:40", end: "12:23" },
    { start: "12:23", end: "13:03" },
    { start: "13:09", end: "13:52" },
    { start: "13:58", end: "14:41" },
    { start: "14:47", end: "15:30" },
    { start: "15:36", end: "16:19" },
  ],
};

const SCHEDULES_2022_2023 = {
  NORMAL: [
    { start: "7:26", end: "8:24" },
    { start: "8:30", end: "9:28" },
    { start: "9:34", end: "10:37" },
    { start: "10:43", end: "11:41" },
    { start: "11:41", end: "12:21" },
    { start: "12:27", end: "13:25" },
    { start: "13:31", end: "14:29" },
    { start: "14:35", end: "15:33" },
    { start: "15:39", end: "16:37" },
  ],
  LATE_START: [
    { start: "8:03", end: "9:33" }, // Staff meeting, no zero period on Monday.
    { start: "10:00", end: "10:43" },
    { start: "10:49", end: "11:37" },
    { start: "11:43", end: "12:26" },
    { start: "12:26", end: "13:06" },
    { start: "13:12", end: "13:55" },
    { start: "14:01", end: "14:44" },
    { start: "14:50", end: "15:33" },
    { start: "15:39", end: "16:22" },
  ],
};

const SCHEDULES = new Date() > LAST_DAY_2021_22 ? SCHEDULES_2022_2023 : SCHEDULES_2021_2022;

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

function onLoad(event) {
  if (event.target.readyState === "complete") {
    loadConfiguration();
    setupConfigPanel();
    document.getElementById("left").onclick = (e) => (togo = !togo);
    progressBars();
    update();
    setInterval(update, 1000);
  }
}

function currentPeriod(now) {
  // Figure out what period, if any, we are in. May be the weekend or
  // the long period between the end of school today and the start of
  // school tomorrow or from the end of school yesterday and the start
  // of school today.

  let weekend = maybeWeekend(now);

  if (weekend !== null) {
    return weekend;
  } else {
    let sched = schedule(now);
    let first = firstPeriod(now);
    let last = lastPeriod(now);

    for (let i = first; i <= last; i++) {
      let start = toDate(sched[i].start, now);
      let end = toDate(sched[i].end, now);

      if (i === first && now < start) {
        return new Period("Before school", endOfDay(previousDay(now)), start, false);
      } else if (start <= now && now <= end) {
        return new Period(PERIODS[i], start, end);
      } else if (i === last) {
        return new Period("After school", end, startOfDay(nextDay(now)), false);
      } else {
        let nextStart = toDate(sched[i + 1].start, now);
        if (now <= nextStart) {
          return new Period("Passing period", end, nextStart, true, true);
        }
      }
    }
  }
}

function maybeWeekend(now) {
  let day = now.getDay();
  let isWeekend = false;
  let start;

  if (day === 5 && now >= endOfDay(now)) {
    isWeekend = true;
    start = endOfDay(now);
  } else if ([0, 6].includes(day)) {
    isWeekend = true;
    start = endOfDay(previousDay(now));
  }

  return isWeekend ? new Period("Weekend!", start, startOfDay(nextDay(now)), false, true) : null;
}

function startOfDay(d) {
  return toDate(schedule(d)[firstPeriod(d)].start, d);
}

function endOfDay(d) {
  return toDate(schedule(d)[lastPeriod(d)].end, d);
}

function firstPeriod(d) {
  return extraPeriods[d.getDay()].zero ? 0 : 1;
}

function lastPeriod(d) {
  return extraPeriods[d.getDay()].seventh ? 8 : 7;
}

function nextDay(t) {
  let d = new Date(t);
  d.setDate(d.getDate() + TO_NEXT_SCHOOL_DAY[d.getDay()]);
  while (!isSchoolDay(d, CALENDAR_2021_2022)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function previousDay(t) {
  let d = new Date(t);
  let rindex = TO_NEXT_SCHOOL_DAY.length - 1 - d.getDay();
  d.setDate(d.getDate() - TO_NEXT_SCHOOL_DAY[rindex]);
  return d;
}

function currentOrNextDay() {
  // Current if it's a school day and the day is not over, next otherwise
  let now = new Date();
  if ([0, 6].includes(now.getDay())) {
    return nextDay(now);
  } else {
    return now < endOfDay(now) ? now : nextDay(now);
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
    let sched = schedule(t);
    let first = firstPeriod(t);
    let last = lastPeriod(t);

    for (let i = first; i <= last; i++) {
      let tr = document.createElement("tr");
      tr.append(td(PERIODS[i]));
      tr.append(td(timestring(toDate(sched[i].start, t))));
      tr.append(td(timestring(toDate(sched[i].end, t))));
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
  let now = new Date();

  if (LAST_DAY_2021_22 < now && now < FIRST_DAY_2022_23) {
    document.getElementById("container").style.background = "rgba(64, 0, 255, 0.25)";
    summerCountdown(now);
  } else {
    let p = currentPeriod(now);
    let color = p.passingPeriod ? "rgba(64, 0, 64, 0.25)" : "rgba(64, 0, 255, 0.25)";
    document.getElementById("container").style.background = color;
    document.getElementById("period").replaceChildren(periodName(p), periodTimes(p));
    document.getElementById("left").innerHTML =
      hhmmss(togo ? p.end - now : now - p.start) + " " + (togo ? "to go" : "done");
    updateProgressBar("periodbar", p.start, p.end, now);

    if (p.duringSchool) {
      document.getElementById("today").innerHTML =
        hhmmss(togo ? endOfDay(now) - now : now - startOfDay(now)) + " " + (togo ? "to go" : "done");
      updateProgressBar("todaybar", startOfDay(now), endOfDay(now), now);
    } else {
      document.getElementById("today").replaceChildren();
    }
    updateCountdown(now);
  }
}

function summerCountdown(now) {
  const days = daysBetween(now, FIRST_DAY_2022_23);
  const s = days == 1 ? "" : "s";
  document.getElementById("period").innerHTML = "Summer vacation!";
  document.getElementById("left").innerHTML = `${days} day${s} until start of school.`;
}

function updateCountdown(now) {
  const days = schoolDaysLeft(CALENDAR_2021_2022);
  if (days == 0) {
    document.getElementById("countdown").innerHTML = "Last day of school!";
  } else {
    const s = days == 1 ? "" : "s";
    document.getElementById("countdown").innerHTML = `${days} day${s} until end of school.`;
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

function updateProgressBar(id, start, end, now) {
  let bar = document.getElementById(id);
  let total = end - start;
  let done = Math.round((100 * (now - start)) / total);
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

function schedule(t) {
  return t.getDay() === 1 ? SCHEDULES.LATE_START : SCHEDULES.NORMAL;
}

function toDate(x, date) {
  let [h, m] = x.split(":").map((s) => parseInt(s));
  let d = new Date(date || new Date());
  d.setHours(h);
  d.setMinutes(m);
  d.setSeconds(0);
  return d;
}

function toDay(x) {
  let [y, m, d] = x.split("-").map((s) => parseInt(s));
  let date = new Date();
  date.setFullYear(y);
  date.setMonth(m - 1);
  date.setDate(d);
  date.setHours(12);
  date.setMinutes(0);
  date.setSeconds(0);
  return date;
}

function schoolDaysLeft(calendar) {
  let d = new Date();
  let end = toDay(calendar.lastDay);
  let c = 0;
  while (d <= end) {
    if (isSchoolDay(d, calendar)) {
      c++;
    }
    d.setDate(d.getDate() + 1);
  }
  return c;
}

function isSchoolDay(d, calendar) {
  return d.getDay() !== 0 && d.getDay() !== 6 && calendar.holidays.indexOf(datestring(d)) == -1;
}

document.addEventListener("readystatechange", onLoad);

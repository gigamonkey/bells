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

const SCHEDULES = {
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

document.addEventListener("readystatechange", onLoad);

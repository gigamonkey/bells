const PREVIOUS_DAY = [-2, -3, -1, -1, -1, -1, -1];
const NEXT_DAY = [1, 1, 1, 1, 1, 3, 2, 1];

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

class Period {
  constructor(name, start, end) {
    this.name = name;
    this.start = start;
    this.end = end;
  }

  contains(t) {
    return this.start <= t && t <= this.end;
  }
}

function currentPeriod(t) {
  // Figure out what period, if any, we are in. May be the long period
  // between the end of school and the start tomorrow or from the end
  // of school yesterday and the start of school today.

  let sched = schedule(t);

  for (let i = 0; i < sched.length; i++) {
    let s = sched[i];
    let start = toDate(s.start, t);
    let end = toDate(s.end, t);
    let p = new Period(PERIODS[i], start, end);

    if (p.contains(t)) {
      return p;
    } else if (i === 0 && t < p.start) {
      return new Period("Before school", endOfPreviousDay(t), p.start);
    } else if (i === sched.length - 1) {
      return new Period("After school", p.end, startOfNextDay(t));
    } else {
      let nextStart = toDate(sched[i + 1].start, t);
      if (t <= nextStart) {
        return new Period("Passing period", p.end, nextStart);
      }
    }
  }
}

function endOfToday() {
  let day = new Date();
  let sched = schedule(day);
  return toDate(sched[sched.length - 1].end, day);
}

function endOfPreviousDay(t) {
  let day = new Date(t);
  day.setDate(day.getDate() + PREVIOUS_DAY[day.getDay()]);
  let sched = schedule(day);
  return toDate(sched[sched.length - 1].end, day);
}

function startOfNextDay(t) {
  let day = new Date(t);
  day.setDate(day.getDate() + NEXT_DAY[day.getDay()]);
  return toDate(schedule(t)[0].start, day);
}

function start(event) {
  if (event.target.readyState === "complete") {
    update();
    setInterval(update, 1000);
  }
}
function update() {
  console.log("updating");
  let now = new Date();
  let p = currentPeriod(now);
  document.getElementById("period").innerHTML = p.name;
  document.getElementById("left").innerHTML = hhmmss(p.end - now);
  if (endOfToday() > now) {
    document.getElementById("today").innerHTML = hhmmss(endOfToday() - now);
  } else {
    document.getElementById("today").innerHTML = "-";
  }
}

function timestring(t) {
  return xx(t.getHours()) + ":" + xx(t.getMinutes());
}

function hhmmss(millis) {
  let seconds = Math.floor(millis / 1000);
  let minutes = Math.floor(seconds / 60);
  let ss = seconds % 60;
  let mm = minutes % 60;
  let hh = Math.floor(minutes / 60);
  return xx(hh) + ":" + xx(mm) + ":" + xx(ss);
}

function xx(n) {
  return (n < 10 ? "0" : "") + n;
}

function schedule(t) {
  return t.getDay() === 1 ? SCHEDULES.LATE_START : SCHEDULES.NORMAL;
}

function hhmm(x) {
  return x.split(":").map((s) => parseInt(s));
}

function toDate(x, date) {
  let [h, m] = hhmm(x);
  let d = date !== undefined ? new Date(date) : new Date();
  d.setHours(h);
  d.setMinutes(m);
  d.setSeconds(0);
  return d;
}

document.addEventListener("readystatechange", start);

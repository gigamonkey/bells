import { Calendar } from './calendar.js';
import { timestring, hours, hhmmss, ddhhmmss, parseTime } from './datetime.js';
import { $, $$, text } from './dom.js';

const DEFAULT_EXTRA_PERIODS = Array(7).fill().map(() => ({ zero: false, seventh: false }));

// This variable and the next function can be used in testing but aren't
// otherwise used.
let offset = 0;

const setOffset = (year, month, date, hour = 12, min = 0, second = 0) => {
  offset = new Date(year, month - 1, date, hour, min, second).getTime() - new Date().getTime();
};

//setOffset(2023, 5, 15, 8, 2, 50);
//setOffset(2023, 2, 14, 12, 36, 55);
//setOffset(2023, 2, 16, 16, 31, 29);
//setOffset(2022, 7, 10);
//setOffset(2023, 1, 26, 8, 29, 55)
//setOffset(2023, 1, 26, 18, 35);
//setOffset(2023, 4, 21, 16, 35);
//setOffset(2023, 5, 12, 8, 30, 55);

// Always use this to get the "current" time to ease testing.
const now = () => new Date(new Date().getTime() + offset);

const calendars = await fetch('calendars.json').then((r) => {
  if (r.ok) return r.json();
});

// Kept in local storage
let extraPeriods = null;

let togo = true;

const loadConfiguration = () => {
  extraPeriods = JSON.parse(localStorage.getItem('extraPeriods'));
  if (extraPeriods === null) {
    extraPeriods = DEFAULT_EXTRA_PERIODS;
    saveConfiguration();
  }
};

const saveConfiguration = () => {
  localStorage.setItem('extraPeriods', JSON.stringify(extraPeriods));
};

const setupConfigPanel = () => {
  $('#qr').onclick = toggleQR;
  $('#gear').onclick = toggleConfig;
  $('#sched').onclick = togglePeriods;

  let day = 1;

  const rows = $$('#configuration table tbody tr');
  for (const node of rows) {
    const cells = node.querySelectorAll('td');
    const zero = cells[1].querySelector('input');
    const seventh = cells[2].querySelector('input');
    const ep = extraPeriods[day];

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

const addProgressBars = () => {
  for (const bar of $$('.bar')) {
    addProgressBarSpans(bar);
  }
};

const addProgressBarSpans = (bar) => {
  bar.appendChild(barSpan(0, 'done'));
  bar.appendChild(barSpan(0, 'togo'));
};

const barSpan = (width, color) => {
  const s = $('<span>');
  s.classList.add(color);
  return s;
};

const toggleQR = () => {
  const div = $('#qr-code');
  div.style.display = div.style.display === 'block' ? 'none' : 'block';
};

const toggleConfig = () => {
  const table = $('#periods_config');
  table.style.display = table.style.display === 'table' ? 'none' : 'table';
};

const togglePeriods = () => {
  const table = $('#periods');
  if (table.style.display === 'table') {
    table.style.display = 'none';
  } else {
    table.replaceChildren();

    const n = now();
    const c = calendar(n);
    const t = c.currentOrNextDay(n);
    const s = c.schedule(t);

    const first = s.firstPeriod(t);
    const last = s.lastPeriod(t);

    for (let p = first; p !== null; p = p.next) {
      const tr = $('<tr>');
      tr.append(td(p.name));
      tr.append(td(timestring(parseTime(p.start, t))));
      tr.append(td(timestring(parseTime(p.end, t))));
      table.append(tr);
    }
    table.style.display = 'table';
  }
};

let timeoutID;

const update = () => {
  if (timeoutID) clearTimeout(timeoutID);
  const t = now();
  const c = calendar(t);
  if (!c) {
    summerCountdown(t);
  } else {
    normalCountdown(t, c);
  }
  timeoutID = setTimeout(update, 1000 - t.getMilliseconds());
};

const summerCountdown = (t) => {
  const nextCal = nextCalendar(t);
  if (nextCal) {
    const start = nextCalendar(t).startOfYear();
    const time = countdownText(start - t);
    $('#untilSchool').replaceChildren(text(`${time} until school starts.`));
    $('#summer').style.display = 'block';
    $('#main').style.display = 'none';
    $('#noCalendar').style.display = 'none';
  } else {
    $('#noCalendar').style.display = 'block';
    $('#main').style.display = 'none';
    $('#summer').style.display = 'none';
  }
  $('#container').style.background = 'rgba(255, 0, 128, 0.25)';
};

const normalCountdown = (t, c) => {
  const s = c.schedule(t);
  updateProgress(t, s);
  updateCountdown(t, c, s);
};

const countdownText = (millis) => {
  const h = hours(millis);
  if (h < 24) {
    return hhmmss(millis);
  } else {
    const days = Math.floor(h / 24);
    const hh = millis - (days * 24 * 60 * 60 * 1000);
    return `${days} day${days === 1 ? '' : 's'}, ${hhmmss(hh)}`;
  }
};

const updateProgress = (t, s) => {
  $('#noCalendar').style.display = 'none';
  $('#summer').style.display = 'none';
  $('#main').style.display = 'block';
  const interval = s.currentInterval(t);
  const { start, end, isPassingPeriod, duringSchool } = interval;

  // Default to passing period.
  let color = 'rgba(64, 0, 64, 0.25)';

  const tenMinutes = 10 * 60 * 1000;
  const inFirstTen = interval.done(t) < tenMinutes;
  const inLastTen = interval.left(t) < tenMinutes;

  if (!isPassingPeriod) {
    if (inFirstTen || inLastTen) {
      color = 'rgba(255, 0, 0, 0.5)';
    } else {
      color = 'rgba(64, 0, 255, 0.25)';
    }
  }

  $('#container').style.background = color;
  $('#period').replaceChildren(periodName(interval), periodTimes(interval));

  const time = togo ? countdownText(interval.left(t)) : countdownText(interval.done(t));

  $('#left').innerHTML = time + ' ' + (togo ? 'to go' : 'done');
  updateProgressBar('periodbar', start, end, t);

  if (duringSchool) {
    updateTodayProgress(t, s);
  } else {
    $('#today').replaceChildren();
    $('#todaybar').replaceChildren();
  }
};

const updateTodayProgress = (t, s) => {
  const start = s.startOfDay(t);
  const end = s.endOfDay(t);
  $('#today').innerHTML = hhmmss(togo ? end - t : t - start) + ' ' + (togo ? 'to go' : 'done');
  updateProgressBar('todaybar', start, end, t);
};

const updateCountdown = (t, cal, s) => {
  const inSchool = cal.duringSchool(t, s);
  const days = cal.schoolDaysLeft(t, s);
  const millis = cal.schoolMillisLeft(t, s);
  const hours = millis / (1000 * 60 * 60);
  const calendarDays = cal.calendarDaysLeft(t, s);
  if (days === 1) {
    $('#countdown').innerHTML = 'Last day of school!';
  } else if (days <= 30) {
    const s = days == 1 ? '' : 's';
    const s2 = calendarDays == 1 ? '' : 's';
    const time = hours < 100 ? `(${hhmmss(millis)} in school) ` : '';
    $('#countdown').innerHTML = `${days} school day${s} ${time}left in the year${inSchool ? ' counting today' : ''}. (${calendarDays} calendar day${s2})`;
  } else {
    $('#countdown').replaceChildren();
  }
};

const updateProgressBar = (id, start, end, t) => {
  const bar = $(`#${id}`);
  const total = end - start;
  const done = Math.round((100 * (t - start)) / total);
  if (bar.childNodes.length == 0) addProgressBarSpans(bar);
  bar.childNodes[0].style.width = done + '%';
  bar.childNodes[1].style.width = 100 - done + '%';
};

const td = (text) => {
  const td = $('<td>');
  td.innerText = text;
  return td;
};

const periodName = (p) => {
  const d = $('<p>');
  d.innerHTML = p.name;
  return d;
};

const periodTimes = (p) => {
  const d = $('<p>');
  d.innerHTML = timestring(p.start) + '–' + timestring(p.end);
  return d;
};

/**
 * Get the calendar for the given time. Undefined during the summer.
 */
const calendar = (t) => {
  return calendars.map((d) => new Calendar(d, extraPeriods)).find((c) => c.isInCalendar(t));
};

/**
 * Get the calendar for the next year, if we have it.
 */
const nextCalendar = (t) => {
  return calendars.map((d) => new Calendar(d, extraPeriods)).find((c) => t < c.startOfYear());
};

const go = () => {
  loadConfiguration();
  setupConfigPanel();
  $('#left').onclick = () => {
    togo = !togo;
    update();
  };
  addProgressBars();
  update();
};

go();

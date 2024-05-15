import { Temporal } from '@js-temporal/polyfill';
import { calendar, summer, nextCalendar, getZero, getSeventh, setZero, setSeventh, toggleTeacher } from './calendar.js';
import { timestring, hours, hhmmss, parseTime, timeCountdown } from './datetime.js';
import { $, $$, text } from './dom.js';

const tz = Temporal.TimeZone.from('America/Los_Angeles');

// This variable and the next function can be used in testing but aren't
// otherwise used.
let offset = 0;

const setOffset = (year, month, date, hour = 12, min = 0, second = 0) => {
  offset = new Date(year, month - 1, date, hour, min, second).getTime() - new Date().getTime();
};

//setOffset(2024, 6, 4, 11, 4, 0);

// Always use this to get the "current" time to ease testing.
const now = () => {
  // This is a terrible kludge. Because everything else is written in terms of
  // date we just use Temporal to adjust our notion of now to account for the
  // difference between the current timezone (i.e. where the browser is) and the
  // home timezone of BHS. Really this whole thing should be rewritten to use
  // Temporal throughout.
  const instant = Temporal.Now.instant().epochMilliseconds;
  const localTime = Temporal.Now.plainDateTimeISO();
  const otherTime = localTime.toZonedDateTime(tz);
  const delta = Math.abs(Temporal.Instant.from(otherTime).epochMilliseconds - instant);
  return new Date(instant - delta + offset);
};

let togo = true;

const setupConfigPanel = () => {
  //$('#apple').onclick = toggleTeacher;
  $('#qr').onclick = toggleQR;
  $('#gear').onclick = toggleConfig;
  $('#sched').onclick = togglePeriods;

  let day = 1;

  const rows = $$('#configuration table tbody tr');
  for (const node of rows) {
    const cells = node.querySelectorAll('td');
    const zero = cells[1].querySelector('input');
    const seventh = cells[2].querySelector('input');
    const d = day; // capture value.

    zero.checked = getZero(d);
    seventh.checked = getSeventh(d);

    zero.onchange = () => {
      setZero(d, zero.checked);
    };

    seventh.onchange = () => {
      setSeventh(d, seventh.checked);
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
    const c = calendar(n) || nextCalendar(n);
    const t = c.currentOrNextDay(n);
    const s = c.schedule(t);

    const first = s.firstPeriod(t);

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
  // We use setTimeout rather than setInterval so we can stay as synced as
  // possible with exactly when the second rolls over.
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
    updateSummerProgress(t);
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
    const hh = millis - days * 24 * 60 * 60 * 1000;
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

const updateSummerProgress = (t) => {
  const { start, end } = summer(t);
  updateProgressBar('summerbar', start, end, t);
};

const updateCountdown = (t, cal, s) => {
  const inSchool = cal.duringSchool(t, s);
  const left = cal.schoolDaysLeft(t, s);
  const millis = cal.schoolMillisLeft(t, s);
  const hours = millis / (1000 * 60 * 60);
  const calendarDays = cal.calendarDaysLeft(t, s);
  const classDays = Math.max(0, left - (3 + 2)); // three days of exams plus two chaos days
  const examDays = Math.min(3, left - 2);
  const chaosDays = Math.min(2, left);
  const countingToday = inSchool ? ' counting today' : '';

  $('#countdown').replaceChildren();
  if (left <= 30) {
    if (cal.isLastDay(t)) {
      $('#countdown').append($('<p>', 'Last day of school!'));
    } else {
      $('#countdown').append($('<p>', `${days(left, 'school')} left in the year${countingToday}`));
      if (classDays > 0) {
        $('#countdown').append($('<p>', `${days(classDays, 'class')} until exams${countingToday}`));
      }
      $('#countdown').append($('<p>', days(examDays, 'exam')));
      $('#countdown').append($('<p>', days(chaosDays, 'bonus')));
      $('#countdown').append($('<p>', `${days(calendarDays, 'calendar')} until summer vacation!`));
    }
    if (hours < 100) {
      $('#countdown').append($('<p>', `${timeCountdown(millis)} to go.`));
    }
  } else {
  }
};

const plural = (n, w) => {
  return n === 1 ? w : `${w}s`;
};

const days = (n, what) => plural(n, `${n} ${what} day`);

const updateProgressBar = (id, start, end, t) => {
  const bar = $(`#${id}`);
  const total = end - start;
  const done = (100 * (t - start)) / total;
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

setupConfigPanel();
$('#left').onclick = () => {
  togo = !togo;
  update();
};
addProgressBars();
update();

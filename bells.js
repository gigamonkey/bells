import { Temporal } from '@js-temporal/polyfill';
import { version } from './version.js';
import {
  getBellSchedule,
  getZero,
  getSeventh,
  getExt,
  setZero,
  setSeventh,
  setExt,
  toggleTeacher,
  isTeacher,
} from './calendar.js';
import { timestring, hhmmss, timeCountdown } from './datetime.js';
import { $, $$, text } from './dom.js';

// This variable and the next function can be used in testing but aren't
// otherwise used.
let offset = 0;

const setOffset = (year, month, date, hour = 12, min = 0, second = 0) => {
  offset = new Date(year, month - 1, date, hour, min, second).getTime() - new Date().getTime();
};

// setOffset(2026, 2, 5, 8, 15, 55);

// Always use this to get the "current" time to ease testing.
const now = () => {
  // This is a terrible kludge. Because everything else is written in terms of
  // date we just use Temporal to adjust our notion of now to account for the
  // difference between the current timezone (i.e. where the browser is) and the
  // home timezone of BHS. Really this whole thing should be rewritten to use
  // Temporal throughout.
  const instant = Temporal.Now.instant().epochMilliseconds;
  const localTime = Temporal.Now.plainDateTimeISO();
  const otherTime = localTime.toZonedDateTime(getBellSchedule().timezone);
  const delta = Math.abs(Temporal.Instant.from(otherTime).epochMilliseconds - instant);
  return new Date(instant - delta + offset);
};

/**
 * Convert a Date to a Temporal.Instant.
 */
const toInstant = (date) => Temporal.Instant.fromEpochMilliseconds(date.getTime());

/**
 * Convert a Temporal.Instant to epoch milliseconds (number).
 */
const toMillis = (instant) => instant.epochMilliseconds;

/**
 * Convert a Temporal.Duration to milliseconds.
 */
const durationToMillis = (duration) => duration.total({ unit: 'milliseconds' });

let togo = true;

/** 
 * To handle local PWA install state
*/
let installPrompt = null;

/**
 * Keep track of online state
*/
let onlineState = {lan: true, network: true};

const setupConfigPanel = () => {
  $('#apple').onclick = toggleTeacher;
  $('#qr').onclick = toggleQR;
  $('#gear').onclick = toggleConfig;
  $('#sched').onclick = togglePeriods;
  $('#reload-app').onclick = forceReload;
  $('#reload-app-container').classList.toggle('visible', isStandalone());
  updateSwVersionDisplay();

  $('#apple').innerText = isTeacher() ? '🍎' : '✏️';

  let day = 1;

  const rows = $$('#periods_config tbody tr');
  for (const node of rows) {
    const cells = node.querySelectorAll('td');
    const zero = cells[1].querySelector('input');
    const seventh = cells[2].querySelector('input');
    const ext = cells[3].querySelector('input');
    const d = day; // capture value.

    zero.checked = getZero(d);
    seventh.checked = getSeventh(d);
    ext.checked = getExt(d);

    zero.onchange = () => {
      setZero(d, zero.checked);
    };

    seventh.onchange = () => {
      setSeventh(d, seventh.checked);
    };

    ext.onchange = () => {
      setExt(d, ext.checked);
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

const togglePopup = (id) => {
  const overlay = $(`#${id}`);
  overlay.classList.toggle('active');
};

const closeAllPopups = () => {
  for (const overlay of $$('.popup-overlay')) {
    overlay.classList.remove('active');
  }
};

const toggleQR = () => togglePopup('popup-qr');

const toggleConfig = () => {
  togglePopup('popup-config');
  updateSwVersionDisplay();
};

let scheduleDate = null;

const renderSchedule = () => {
  const table = $('#periods');
  table.replaceChildren();

  const bellSchedule = getBellSchedule();
  const { timezone } = bellSchedule;

  // Date header row with navigation arrows
  const headerRow = $('<tr>');
  const headerCell = $('<td>');
  headerCell.colSpan = 3;
  headerCell.style.textAlign = 'center';
  headerCell.style.paddingBottom = '30px';

  const leftArrow = $('<span>');
  leftArrow.innerText = '\u25C0';
  leftArrow.style.cursor = 'pointer';
  leftArrow.style.padding = '0 12px';
  leftArrow.onclick = (e) => {
    e.stopPropagation();
    scheduleDate = bellSchedule.previousSchoolDay(scheduleDate);
    renderSchedule();
  };

  const rightArrow = $('<span>');
  rightArrow.innerText = '\u25B6';
  rightArrow.style.cursor = 'pointer';
  rightArrow.style.padding = '0 12px';
  rightArrow.onclick = (e) => {
    e.stopPropagation();
    scheduleDate = bellSchedule.nextSchoolDay(scheduleDate);
    renderSchedule();
  };

  const dateLabel = $('<span>');
  dateLabel.style.display = 'inline-block';
  dateLabel.style.width = '150px';
  dateLabel.style.textAlign = 'center';
  const today = Temporal.Now.plainDateISO(bellSchedule.timezone);
  const isToday = Temporal.PlainDate.compare(scheduleDate, today) === 0;
  if (isToday) {
    dateLabel.innerText = 'Today';
  } else {
    const dow = scheduleDate.toLocaleString('en-US', { weekday: 'short' });
    dateLabel.innerText = `${dow} ${scheduleDate.month}/${scheduleDate.day}/${scheduleDate.year}`;
    dateLabel.style.cursor = 'pointer';
    dateLabel.onclick = (e) => {
      e.stopPropagation();
      scheduleDate = bellSchedule.isSchoolDay(today) ? today : bellSchedule.nextSchoolDay(today);
      renderSchedule();
    };
  }

  headerCell.append(leftArrow, dateLabel, rightArrow);
  headerRow.append(headerCell);
  table.append(headerRow);

  // Period rows
  bellSchedule.scheduleFor(scheduleDate).forEach(({ name, start, end }) => {
    const tr = $('<tr>');
    tr.append(td(name));
    tr.append(td(timestring(start, timezone)));
    tr.append(td(timestring(end, timezone)));
    table.append(tr);
  });
};

const togglePeriods = () => {
  const overlay = $('#popup-schedule');
  if (overlay.classList.contains('active')) {
    overlay.classList.remove('active');
  } else {
    const bellSchedule = getBellSchedule();
    const today = Temporal.Now.plainDateISO(bellSchedule.timezone);
    scheduleDate = bellSchedule.isSchoolDay(today) ? today : bellSchedule.nextSchoolDay(today);
    renderSchedule();
    overlay.classList.add('active');
  }
};

let timeoutID;

const update = () => {
  if (timeoutID) clearTimeout(timeoutID);
  const t = now();
  const instant = toInstant(t);

  // Auto reload the page if it's been open more than a day.
  if (Temporal.Instant.compare(instant, reloadAt) >= 0) {
    location.reload();
    return;
  }

  const bellSchedule = getBellSchedule();

  // summerBounds returns null when we are inside a school year; non-null during summer.
  const summerInfo = bellSchedule.summerBounds(instant);
  if (summerInfo !== null) {
    summerCountdown(instant, bellSchedule);
  } else {
    normalCountdown(t, instant, bellSchedule);
  }

  // We use setTimeout rather than setInterval so we can stay as synced as
  // possible with exactly when the second rolls over.
  timeoutID = setTimeout(update, 1000 - t.getMilliseconds());
};

const summerCountdown = (instant, bellSchedule) => {
  let nextYearStart = null;
  try {
    nextYearStart = bellSchedule.nextYearStart(instant);
  } catch (e) {
    // No next year data.
  }

  if (nextYearStart) {
    const time = countdownText(instant.until(nextYearStart));
    $('#untilSchool').replaceChildren(text(`${time} until school starts.`));
    $('#summer').style.display = 'block';
    $('#main').style.display = 'none';
    $('#noCalendar').style.display = 'none';
    updateSummerProgress(instant, bellSchedule);
  } else {
    $('#noCalendar').style.display = 'block';
    $('#main').style.display = 'none';
    $('#summer').style.display = 'none';
  }
  $('#container').style.background = 'rgba(255, 0, 128, 0.25)';
};

const normalCountdown = (t, instant, bellSchedule) => {
  updateProgress(t, instant, bellSchedule);
  updateCountdown(t, instant, bellSchedule);
};

const countdownText = (duration) => {
  const { hours, minutes, seconds } = duration.round({ largestUnit: 'hours', smallestUnit: 'seconds' });
  if (hours < 24) {
    return hhmmss(duration);
  } else {
    const daysCount = Math.floor(hours / 24);
    const remainder = Temporal.Duration.from({ hours: hours % 24, minutes, seconds });
    return `${daysCount} day${daysCount === 1 ? '' : 's'}, ${hhmmss(remainder)}`;
  }
};

const updateProgress = (t, instant, bellSchedule) => {
  $('#noCalendar').style.display = 'none';
  $('#summer').style.display = 'none';
  $('#main').style.display = 'block';
  const interval = bellSchedule.currentInterval(instant);

  if (!interval) {
    // Shouldn't happen during normal school year, but handle gracefully.
    return;
  }

  const startMillis = toMillis(interval.start);
  const endMillis = toMillis(interval.end);
  const tMillis = t.getTime();
  const isPassingPeriod = interval.type === 'passing' || interval.type === 'break';
  const { duringSchool } = interval;

  // Default to passing period.
  let color = 'rgba(64, 0, 64, 0.25)';

  const tenMinutes = 10 * 60 * 1000;
  const done = tMillis - startMillis;
  const left = endMillis - tMillis;
  const inFirstTen = done < tenMinutes;
  const inLastTen = left < tenMinutes;

  if (!isPassingPeriod) {
    if (inFirstTen || inLastTen) {
      color = 'rgba(255, 0, 0, 0.5)';
    } else {
      color = 'rgba(64, 0, 255, 0.25)';
    }
  }

  $('#container').style.background = color;

  $('#period').replaceChildren(periodName(interval), periodTimes(interval, bellSchedule.timezone));

  const time = togo ? countdownText(interval.left(instant)) : countdownText(interval.done(instant));

  $('#left').innerHTML = time + ' ' + (togo ? 'to go' : 'done');
  updateProgressBar('periodbar', startMillis, endMillis, tMillis);

  if (duringSchool) {
    updateTodayProgress(t, instant, bellSchedule);
  } else {
    $('#today').replaceChildren();
    $('#todaybar').replaceChildren();
  }
};

const updateTodayProgress = (t, instant, bellSchedule) => {
  const bounds = bellSchedule.currentDayBounds(instant);
  if (!bounds) return;
  const startMillis = toMillis(bounds.start);
  const endMillis = toMillis(bounds.end);
  const tMillis = t.getTime();
  $('#today').innerHTML = hhmmss(togo ? instant.until(bounds.end) : bounds.start.until(instant)) + ' ' + (togo ? 'to go' : 'done');
  updateProgressBar('todaybar', startMillis, endMillis, tMillis);
};

const updateSummerProgress = (instant, bellSchedule) => {
  const bounds = bellSchedule.summerBounds(instant);
  if (!bounds) return;
  const startMillis = bounds.start ? toMillis(bounds.start) : 0;
  const endMillis = bounds.end ? toMillis(bounds.end) : 0;
  const tMillis = instant.epochMilliseconds;
  updateProgressBar('summerbar', startMillis, endMillis, tMillis);
};

const updateCountdown = (t, instant, bellSchedule) => {
  const interval = bellSchedule.currentInterval(instant);
  const inSchool = interval ? interval.duringSchool : false;
  const left = bellSchedule.schoolDaysLeft(instant);
  const schoolTimeLeft = bellSchedule.schoolTimeLeft(instant);
  const millisLeft = durationToMillis(schoolTimeLeft);
  const hoursLeft = millisLeft / (1000 * 60 * 60);
  const calendarDays = bellSchedule.calendarDaysLeft(instant);
  const classDays = Math.max(0, left - (3 + 1)); // three days of exams plus one chaos day
  const examDays = Math.max(0, Math.min(3, left - 1));
  const chaosDays = Math.max(0, Math.min(1, left));
  const countingToday = inSchool ? ' counting today' : '';

  const totalMillis = durationToMillis(bellSchedule.totalSchoolTime(instant));
  const done = totalMillis - millisLeft;

  const smallCountdown = $('#small-countdown > p');

  const displaySmallCountdown = () => {
    if (smallCountdown.classList.contains('clicked')) {
      smallCountdown.innerText = `${((100 * done) / totalMillis).toPrecision(7)}%`;
    } else {
      const percent = Math.round((100 * done) / totalMillis);
      const nice = percent === 69 ? ' Nice!' : '';
      smallCountdown.innerText = `${percent}%${nice}`;
    }
  };

  displaySmallCountdown();

  smallCountdown.onclick = (e) => {
    e.target.classList.toggle('clicked');
    displaySmallCountdown();
  };

  // Determine if it's the last day of school.
  const isLastDay = (() => {
    const bounds = bellSchedule.currentDayBounds(instant);
    if (!bounds) return false;
    // It's the last day if today's end equals the end of the school year.
    // We check by seeing if there are no more school days after today.
    // schoolDaysLeft counts today if we're before/during school; after school it's 0.
    // If left === 1 and we're in school, or left === 0 and we just finished,
    // that's the last day. Simpler: check if bounds.end matches endOfYear.
    // We can't get endOfYear directly from BellSchedule, so approximate:
    // last day = when schoolDaysLeft would be 0 after end of today.
    return left <= 1 && Temporal.Instant.compare(instant, bounds.end) < 0 &&
      bellSchedule.schoolDaysLeft(bounds.end.add({ seconds: 1 })) === 0;
  })();

  $('#countdown').replaceChildren();
  if (left <= 30) {
    if (isLastDay) {
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
    if (hoursLeft < 100) {
      $('#countdown').append($('<p>', `${timeCountdown(schoolTimeLeft)} to go.`));
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

const periodTimes = (p, timezone) => {
  const d = $('<p>');
  d.innerHTML = timestring(p.start, timezone) + '–' + timestring(p.end, timezone);
  return d;
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;

  // Capture controller state BEFORE register() so we can distinguish the
  // first-ever install (no prior controller → controllerchange fires once
  // but we shouldn't reload) from an update (existing controller replaced
  // by a new one → reload to pick up the new bundle).
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    location.reload();
  });

  try {
    await navigator.serviceWorker.register('./sw.js');
    console.log('Registered SW');
  } catch (error) {
    console.error('Could not register service worker', error);
  }
};

const updateSwVersionDisplay = async () => {
  const el = $('#sw-version');
  if (!el) return;
  try {
    const keys = (await caches?.keys?.()) ?? [];
    const name = keys.find((k) => k.startsWith('bells-'));
    el.textContent = name ?? '';
  } catch {
    el.textContent = '';
  }
};

const forceReload = async () => {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches?.keys?.() ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch (error) {
    console.warn('forceReload cleanup failed', error);
  }
  location.reload();
};

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const isIOSSafari = () => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(/CriOS|FxiOS|Chrome/.test(ua));
};

const handleLocalInstallSetup = () => {

  const installArea = $(".local-install");
  const installButton = $(".local-install > button");
  const iosInstallArea = $(".ios-install");

  // Already running as an installed PWA — hide all install UI.
  if (isStandalone()) return;

  // iOS Safari: show manual install instructions.
  if (isIOSSafari()) {
    if (iosInstallArea) {
      iosInstallArea.removeAttribute("hidden");
      const installLink = $(".ios-install-link");
      if (installLink) {
        installLink.addEventListener("click", () => {
          $('#popup-ios-install').classList.add('active');
        });
      }
    }
    return;
  }

  // Chromium browsers: use beforeinstallprompt.
  if (!installArea || !installButton) return;

  const disableInAppInstallPrompt = () => {
    installPrompt = null;
    installArea.setAttribute("hidden", "");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installArea.removeAttribute("hidden");
  });

  window.addEventListener("appinstalled", () => {
    disableInAppInstallPrompt();
  });

  installButton.addEventListener("click", async () => {
    if (!installPrompt) return;
    const result = await installPrompt.prompt();
    disableInAppInstallPrompt();
    // console.log(`Install prompt was: ${result.outcome}`);
  });

};

const setupOnlineDisplay = () => {    

  const updateOnlineNotification = () => {
    if(onlineState.lan && onlineState.network) $(".no-wifi").setAttribute("hidden", "");
    else $(".no-wifi").removeAttribute("hidden");
  }

  setInterval(async () => {
    await fetch("./online-check.txt")
      .then(async (res) => {
        let content = await res.text()
        onlineState.network = content === "online" && res.ok;
      })
      .catch(e => onlineState.network = false);
    updateOnlineNotification();
  }, 60_000)

  const handleNetworkChange = () => {
    console.log("Online status update: ", navigator.onLine ? "online" : "offline");
    onlineState.lan = navigator.onLine;
    updateOnlineNotification();
  };

  window.addEventListener('online', handleNetworkChange);
  window.addEventListener('offline', handleNetworkChange);
  handleNetworkChange();

}

const versionEl = $('#version > p');
versionEl.innerText = version;
versionEl.onclick = (e) => {
  e.target.classList.toggle('clicked');
};

setupConfigPanel();

// Close popups via close button or clicking the backdrop
for (const overlay of $$('.popup-overlay')) {

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
  overlay.querySelector('.popup-close').addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.classList.remove('active');
  });
}

$('#left').onclick = () => {
  togo = !togo;
  update();
};

registerServiceWorker();
addProgressBars();

// Auto-refresh if the page has been open for more than 24 hours.
const reloadAt = toInstant(now()).add({ hours: 24 });

update();

if (document.readyState === 'loading') {
  window.addEventListener("DOMContentLoaded", () => {
    handleLocalInstallSetup()
    setupOnlineDisplay();
  });
} else {
  handleLocalInstallSetup();
  setupOnlineDisplay();
}
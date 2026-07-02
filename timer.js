import { Temporal } from '@js-temporal/polyfill';
import { $ } from './dom.js';
import { isTeacher } from './calendar.js';
import { timestring, hhmmss } from './datetime.js';
import { playChime, showBanner } from './alarms.js';
import {
  loadRoutines,
  saveRoutines,
  routineForPeriod,
  resolveChunks,
  activeChunk,
  nextChunk,
  toEditorRows,
  compileRows,
  fixedSeconds,
  formatSeconds,
  describeRoutine,
} from './timer-routines.js';

/*
 * The class-timer feature: a mode of the app (toggled by the header timer
 * icon) with its own full-screen display, plus the routines popup/editor.
 * The idle display's big heading — the next queued routine, or "Period
 * timer" when there is none — is what makes the mode visually obvious.
 * Follows the alarms.js integration contract: setupTimer() at startup,
 * tickTimer(instant) every tick for chunk-transition chimes regardless of
 * mode, and renderTimer() when the mode is on.
 */

const MODE_KEY = 'timerMode';
const SELECTED_KEY = 'timerSelectedRoutine';
const CHUNK_COLORS = ['#4000ff', '#008040', '#b05a00', '#800080', '#006080', '#a00040'];

let routines = loadRoutines();
let routinesVersion = 0;
let getBellScheduleFn = null;
let requestUpdateFn = null;
let timerMode = localStorage.getItem(MODE_KEY) === 'true';
let togoChunk = true;

// Chime state: previous tick's instant and active-chunk key.
let previousInstant = null;
let lastChunkKey = null;

// Cache for the next-scoped-occurrence search used by the idle display.
let idleCache = null;

// Cache for the current-or-next-period search used by the routine buttons.
let nextPeriodCache = null;

const isTimerMode = () => timerMode;

const toggleTimerMode = () => {
  timerMode = !timerMode;
  localStorage.setItem(MODE_KEY, String(timerMode));
  if (requestUpdateFn) requestUpdateFn();
};

// The timer is teacher-facing, so like the bell icon the timer icon is shown
// only in teacher mode. Since the icon is the only way in or out of timer
// mode, switching to student view while the timer is up also drops out of
// timer mode rather than stranding the display with no way back.
const updateTimerTeacherVisibility = () => {
  const teacher = isTeacher();
  $('#timer-icon').style.display = teacher ? '' : 'none';
  if (!teacher) {
    if (timerMode) toggleTimerMode();
    $('#popup-routines').classList.remove('active');
  }
};

const saveAndRefresh = () => {
  saveRoutines(routines);
  routinesVersion++;
  idleCache = null;
  if (requestUpdateFn) requestUpdateFn();
};

/*
 * Which routine to run for a specific period occurrence. Normally the first
 * enabled routine scoped to the period name, but the routine buttons on the
 * timer display can pick a different applicable routine (or none) for one
 * occurrence. The choice is keyed to the exact occurrence, so it expires on
 * its own; only the latest choice is kept.
 */
let selectedRoutine = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(SELECTED_KEY));
    return v && typeof v.periodKey === 'string' ? v : null;
  } catch {
    return null;
  }
})();

const occurrenceKey = (period) => `${period.name}|${period.start.epochMilliseconds}`;

const selectRoutine = (period, routineId) => {
  selectedRoutine = { periodKey: occurrenceKey(period), routineId };
  localStorage.setItem(SELECTED_KEY, JSON.stringify(selectedRoutine));
  idleCache = null;
  if (requestUpdateFn) requestUpdateFn();
};

const routineForOccurrence = (period) => {
  if (selectedRoutine && selectedRoutine.periodKey === occurrenceKey(period)) {
    if (selectedRoutine.routineId === null) return null;
    const r = routines.find((r) => r.id === selectedRoutine.routineId && r.enabled !== false);
    if (r) return r;
  }
  return routineForPeriod(routines, period.name);
};

const newId = () => Math.random().toString(36).slice(2, 10);

const hexToRgba = (hex, alpha) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(64, 0, 255, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const setBar = (id, startMs, endMs, nowMs) => {
  const bar = $(`#${id}`);
  if (bar.childNodes.length === 0) {
    for (const cls of ['done', 'togo']) {
      const s = $('<span>');
      s.classList.add(cls);
      bar.appendChild(s);
    }
  }
  const total = endMs - startMs;
  const done = total > 0 ? Math.min(100, Math.max(0, (100 * (nowMs - startMs)) / total)) : 0;
  bar.childNodes[0].style.width = done + '%';
  bar.childNodes[1].style.width = 100 - done + '%';
};

const countdownText = (duration) => {
  const { hours, minutes, seconds } = duration.round({
    largestUnit: 'hours',
    smallestUnit: 'seconds',
    roundingMode: 'trunc',
  });
  if (hours < 24) return hhmmss(duration);
  const days = Math.floor(hours / 24);
  const rest = Temporal.Duration.from({ hours: hours % 24, minutes, seconds });
  return `${days} day${days === 1 ? '' : 's'}, ${hhmmss(rest)}`;
};

/*
 * Per-tick chunk-transition detection. Runs in both modes so the pacing chime
 * fires even when the bells display is showing. Only chimes on a transition
 * observed live (previous tick less than five seconds ago), so loading or
 * waking mid-chunk stays silent.
 */
const tickTimer = (instant) => {
  if (!getBellScheduleFn) return;
  const bellSchedule = getBellScheduleFn();
  const prev = previousInstant;
  previousInstant = instant;

  const interval = bellSchedule.currentInterval(instant);
  let routine = null;
  let chunk = null;
  let key = null;
  if (interval && interval.type === 'period') {
    routine = routineForOccurrence(interval);
    if (routine) {
      chunk = activeChunk(resolveChunks(routine, interval), instant);
      if (chunk) key = `${routine.id}|${chunk.id}|${interval.start.epochMilliseconds}`;
    }
  }

  const live = prev && instant.epochMilliseconds - prev.epochMilliseconds < 5000;
  if (chunk && key !== lastChunkKey && live && routine.chime !== false) {
    if (timerMode) {
      playChime();
    } else {
      showBanner(chunk.label, { dedupKey: `chunk:${key}` });
    }
  }
  lastChunkKey = key;
};

/*
 * Full render of the dedicated timer display. Called from the update loop
 * instead of the normal countdown when timer mode is on (and it's not
 * summer). Owns the #timer-main region and the container background.
 */
const renderTimer = (t, instant, bellSchedule) => {
  $('#noCalendar').style.display = 'none';
  $('#summer').style.display = 'none';
  $('#main').style.display = 'none';
  $('#timer-main').style.display = 'block';

  const interval = bellSchedule.currentInterval(instant);
  const routine = interval && interval.type === 'period' ? routineForOccurrence(interval) : null;

  if (routine) {
    renderActive(t, instant, interval, routine, bellSchedule);
  } else {
    renderIdle(instant, interval, bellSchedule);
  }
  renderRoutineButtons(bellSchedule, instant, interval);
};

const renderActive = (t, instant, interval, routine, bellSchedule) => {
  const tz = bellSchedule.timezone;
  const resolved = resolveChunks(routine, interval);
  const chunk = activeChunk(resolved, instant);
  const next = nextChunk(resolved, instant);

  if (chunk) {
    $('#chunk-label').innerText = chunk.label;
    const time = togoChunk ? countdownText(instant.until(chunk.end)) : countdownText(chunk.start.until(instant));
    $('#chunk-left').innerText = time + ' ' + (togoChunk ? 'to go' : 'done');
    setBar('chunkbar', chunk.start.epochMilliseconds, chunk.end.epochMilliseconds, t.getTime());

    // Chunk color as the base tint; red as the chunk boundary approaches (the
    // warning window scales with the chunk: a fifth of its length, capped at
    // ten minutes, never less than one minute); flashing once a second for
    // the final ten seconds. The chunk-flash animation overrides the inline
    // background while the class is on.
    const chunkSecs = (chunk.end.epochMilliseconds - chunk.start.epochMilliseconds) / 1000;
    const leftSecs = (chunk.end.epochMilliseconds - t.getTime()) / 1000;
    const warnSecs = Math.max(60, Math.min(600, chunkSecs / 5));
    $('#container').style.background = leftSecs < warnSecs ? 'rgba(255, 0, 0, 0.5)' : hexToRgba(chunk.color, 0.25);
    $('#container').classList.toggle('chunk-flash', leftSecs <= 10);
  } else {
    $('#chunk-label').innerText = 'Between segments';
    $('#chunk-left').innerText = next ? countdownText(instant.until(next.start)) + ' to go' : '';
    setBar('chunkbar', 0, 1, 0);
    $('#container').style.background = 'rgba(64, 0, 64, 0.25)';
    $('#container').classList.remove('chunk-flash');
  }

  $('#chunk-next').innerText = next ? `Next: ${next.label} at ${timestring(next.start, tz)}` : '';
  renderChunkList(resolved, instant, tz);
  $('#timer-period-line').innerText =
    `${interval.name} · ${timestring(interval.start, tz)}–${timestring(interval.end, tz)}` +
    ` · ${hhmmss(instant.until(interval.end))} left`;
};

const renderChunkList = (resolved, instant, tz) => {
  const list = $('#timer-chunks');
  list.replaceChildren();
  for (const c of resolved) {
    const row = $('<div>');
    row.className = 'timer-chunk-row';
    if (instant && Temporal.Instant.compare(c.end, instant) <= 0) row.classList.add('done');
    if (instant && Temporal.Instant.compare(c.start, instant) <= 0 && Temporal.Instant.compare(instant, c.end) < 0) {
      row.classList.add('active');
    }
    row.append($('<span>', c.label), $('<span>', `${timestring(c.start, tz)}–${timestring(c.end, tz)}`));
    list.appendChild(row);
  }
};

/*
 * Find the next occurrence of any period some enabled routine is scoped to,
 * starting from `instant` and scanning up to 15 school days out. Cached per
 * (routines version, date, result) since it's called every second while idle.
 */
const nextScopedOccurrence = (bellSchedule, instant) => {
  const tz = bellSchedule.timezone;
  const dateStr = instant.toZonedDateTimeISO(tz).toPlainDate().toString();
  if (
    idleCache &&
    idleCache.version === routinesVersion &&
    idleCache.dateStr === dateStr &&
    (!idleCache.value || Temporal.Instant.compare(idleCache.value.period.start, instant) > 0)
  ) {
    return idleCache.value;
  }

  let value = null;
  let date = instant.toZonedDateTimeISO(tz).toPlainDate();
  // nextSchoolDay throws once we're past all calendar data.
  try {
    outer: for (let i = 0; i < 15; i++) {
      for (const p of bellSchedule.scheduleFor(date)) {
        if (Temporal.Instant.compare(p.start, instant) <= 0) continue;
        const routine = routineForOccurrence(p);
        if (routine) {
          value = { routine, period: p };
          break outer;
        }
      }
      date = bellSchedule.nextSchoolDay(date);
    }
  } catch {
    // Ran out of calendar; no upcoming occurrence.
  }
  idleCache = { version: routinesVersion, dateStr, value };
  return value;
};

const hasApplicableRoutine = (periodName) =>
  routines.some((r) => r.enabled !== false && (r.scopeNames || []).includes(periodName));

/*
 * The period the routine buttons apply to: the current period if any routine
 * is scoped to it, otherwise the next period some routine is scoped to
 * (scanning up to 15 school days out). Scoping is checked by name, ignoring
 * the per-occurrence selection, so a toggled-off routine's buttons stay
 * visible and it can be turned back on. Cached like idleCache since it runs
 * every second.
 */
const routineButtonsPeriod = (bellSchedule, instant, interval) => {
  if (interval && interval.type === 'period' && hasApplicableRoutine(interval.name)) return interval;
  const tz = bellSchedule.timezone;
  const dateStr = instant.toZonedDateTimeISO(tz).toPlainDate().toString();
  if (
    nextPeriodCache &&
    nextPeriodCache.version === routinesVersion &&
    nextPeriodCache.dateStr === dateStr &&
    (!nextPeriodCache.period || Temporal.Instant.compare(nextPeriodCache.period.start, instant) > 0)
  ) {
    return nextPeriodCache.period;
  }

  let period = null;
  let date = instant.toZonedDateTimeISO(tz).toPlainDate();
  try {
    outer: for (let i = 0; i < 15; i++) {
      for (const p of bellSchedule.scheduleFor(date)) {
        if (Temporal.Instant.compare(p.start, instant) <= 0) continue;
        if (hasApplicableRoutine(p.name)) {
          period = p;
          break outer;
        }
      }
      date = bellSchedule.nextSchoolDay(date);
    }
  } catch {
    // Ran out of calendar; no upcoming period.
  }
  nextPeriodCache = { version: routinesVersion, dateStr, period };
  return period;
};

/*
 * One button per enabled routine scoped to the current-or-next period.
 * Tapping a button runs that routine for this occurrence of the period;
 * tapping the one already running turns routines off for the occurrence.
 */
const renderRoutineButtons = (bellSchedule, instant, interval) => {
  const label = $('#routine-buttons-label');
  const grid = $('#routine-buttons');
  const period = routineButtonsPeriod(bellSchedule, instant, interval);
  const applicable = period
    ? routines.filter((r) => r.enabled !== false && (r.scopeNames || []).includes(period.name))
    : [];

  grid.replaceChildren();
  if (applicable.length === 0) {
    label.innerText = '';
    return;
  }

  const tz = bellSchedule.timezone;
  const isCurrent = interval && interval.type === 'period' && occurrenceKey(interval) === occurrenceKey(period);
  const today = instant.toZonedDateTimeISO(tz).toPlainDate();
  const periodDate = period.start.toZonedDateTimeISO(tz).toPlainDate();
  const when = isCurrent
    ? ''
    : Temporal.PlainDate.compare(periodDate, today) === 0
      ? ' (next)'
      : ` (${periodDate.toLocaleString('en-US', { weekday: 'short' })} ${periodDate.month}/${periodDate.day})`;
  label.innerText = `Routines for ${period.name}${when}`;

  const active = routineForOccurrence(period);
  for (const routine of applicable) {
    const btn = $('<button>', routine.name);
    btn.className = 'routine-btn';
    const isActive = active !== null && active.id === routine.id;
    btn.classList.toggle('selected', isActive);
    btn.onclick = () => selectRoutine(period, isActive ? null : routine.id);
    grid.appendChild(btn);
  }
};

const renderIdle = (instant, interval, bellSchedule) => {
  const tz = bellSchedule.timezone;
  // A null interval means no calendar covers this instant: summer (or we've
  // run out of calendar data entirely).
  const summer = !interval && bellSchedule.summerBounds(instant) !== null;
  setBar('chunkbar', 0, 1, 0);
  $('#container').style.background = summer ? 'rgba(255, 0, 128, 0.25)' : 'rgba(64, 0, 64, 0.25)';
  $('#container').classList.remove('chunk-flash');

  const occurrence = nextScopedOccurrence(bellSchedule, instant);
  if (occurrence) {
    const { routine, period } = occurrence;
    $('#chunk-label').innerText = `${routine.name} — ${period.name}`;
    $('#chunk-left').innerText = `starts in ${countdownText(instant.until(period.start))}`;
    $('#chunk-next').innerText = '';
    renderChunkList(resolveChunks(routine, period), null, tz);
  } else {
    $('#chunk-label').innerText = 'Period timer';
    $('#chunk-left').innerText = '';
    $('#chunk-next').innerText =
      routines.length === 0 ? 'No routines yet. Tap Routines… to create one.' : 'No upcoming scoped period found.';
    $('#timer-chunks').replaceChildren();
  }
  $('#timer-period-line').innerText = interval
    ? `${interval.name} · ${timestring(interval.start, tz)}–${timestring(interval.end, tz)}`
    : summer
      ? 'Summer vacation!'
      : 'No calendar data';
};

/*
 * Routines popup: list, preview, and editor. Patterned on the alarms popup.
 */

const allPeriodNames = () => {
  if (!getBellScheduleFn) return [];
  const bellSchedule = getBellScheduleFn();
  const names = new Set();
  try {
    const today = Temporal.Now.plainDateISO(bellSchedule.timezone);
    const date = bellSchedule.isSchoolDay(today) ? today : bellSchedule.nextSchoolDay(today);
    for (const p of bellSchedule.scheduleFor(date)) names.add(p.name);
  } catch {
    // Past all calendar data; offer only names already in use.
  }
  return [...names];
};

/*
 * Next occurrence of a period with this name (today or up to 20 school days
 * out), for editor warnings and previews. Includes a period in progress.
 */
const nextOccurrenceOfPeriod = (bellSchedule, instant, name) => {
  const tz = bellSchedule.timezone;
  let date = instant.toZonedDateTimeISO(tz).toPlainDate();
  try {
    for (let i = 0; i < 20; i++) {
      for (const p of bellSchedule.scheduleFor(date)) {
        if (p.name === name && Temporal.Instant.compare(p.end, instant) > 0) return p;
      }
      date = bellSchedule.nextSchoolDay(date);
    }
  } catch {
    // Past all calendar data.
  }
  return null;
};

const renderRoutineList = () => {
  const list = $('#routine-list');
  list.replaceChildren();

  if (routines.length === 0) {
    const empty = $('<div>', 'No routines yet.');
    empty.className = 'alarm-empty';
    list.appendChild(empty);
    return;
  }

  for (const routine of routines) {
    const row = $('<div>');
    row.className = 'alarm-row';

    const toggle = $('<input>');
    toggle.type = 'checkbox';
    toggle.checked = routine.enabled !== false;
    toggle.onchange = () => {
      routine.enabled = toggle.checked;
      saveAndRefresh();
    };

    const desc = $('<span>');
    desc.className = 'alarm-desc';
    desc.append($('<strong>', routine.name), document.createElement('br'), describeRoutine(routine));

    const previewBtn = $('<button>', 'Preview');
    previewBtn.className = 'alarm-btn';
    const editBtn = $('<button>', 'Edit');
    editBtn.className = 'alarm-btn';
    editBtn.onclick = () => openRoutineEditor(routine);
    const delBtn = $('<button>', 'Delete');
    delBtn.className = 'alarm-btn';
    delBtn.onclick = () => {
      routines = routines.filter((r) => r.id !== routine.id);
      saveAndRefresh();
      renderRoutineList();
    };

    row.append(toggle, desc, previewBtn, editBtn, delBtn);
    list.appendChild(row);

    const preview = $('<div>');
    preview.className = 'routine-preview';
    preview.style.display = 'none';
    list.appendChild(preview);
    previewBtn.onclick = () => {
      if (preview.style.display !== 'none') {
        preview.style.display = 'none';
        return;
      }
      preview.replaceChildren();
      const bellSchedule = getBellScheduleFn();
      const tz = bellSchedule.timezone;
      const now = Temporal.Now.instant();
      let shown = false;
      for (const name of routine.scopeNames || []) {
        const period = nextOccurrenceOfPeriod(bellSchedule, now, name);
        if (!period) continue;
        shown = true;
        const date = period.start.toZonedDateTimeISO(tz).toPlainDate();
        const dow = date.toLocaleString('en-US', { weekday: 'short' });
        preview.append($('<p>', `${name} — ${dow} ${date.month}/${date.day}:`));
        for (const c of resolveChunks(routine, period)) {
          preview.append($('<p>', `  ${timestring(c.start, tz)}–${timestring(c.end, tz)}  ${c.label}`));
        }
      }
      if (!shown) preview.append($('<p>', 'No upcoming occurrence of the scoped periods.'));
      preview.style.display = 'block';
    };
  }
};

const openRoutineEditor = (existing) => {
  const editor = $('#routine-editor');
  const isNew = !existing;
  const draft = existing
    ? {
        id: existing.id,
        name: existing.name,
        chime: existing.chime !== false,
        scopeNames: [...(existing.scopeNames || [])],
      }
    : { id: newId(), name: '', chime: true, scopeNames: [] };
  let rows = existing
    ? toEditorRows(existing.chunks)
    : [
        { id: newId(), label: 'Do Now', color: CHUNK_COLORS[0], mode: 'start', seconds: 600 },
        { id: newId(), label: 'Work time', color: CHUNK_COLORS[1], mode: 'elastic', seconds: 0 },
        { id: newId(), label: 'Wrap up', color: CHUNK_COLORS[2], mode: 'end', seconds: 300 },
      ];

  editor.replaceChildren();
  editor.appendChild($('<h3>', isNew ? 'New routine' : 'Edit routine'));

  const addField = (labelText, input) => {
    const wrap = $('<div>');
    wrap.className = 'alarm-field';
    wrap.append($('<label>', labelText), input);
    editor.appendChild(wrap);
  };

  const nameInput = $('<input>');
  nameInput.type = 'text';
  nameInput.value = draft.name;
  nameInput.placeholder = 'e.g. Block lesson';
  addField('Name', nameInput);

  const names = [...new Set([...allPeriodNames(), ...draft.scopeNames])];
  const checksWrap = $('<div>');
  checksWrap.className = 'alarm-checks';
  const nameCheckboxes = [];
  for (const n of names) {
    const lbl = $('<label>');
    lbl.className = 'alarm-check';
    const cb = $('<input>');
    cb.type = 'checkbox';
    cb.value = n;
    cb.checked = draft.scopeNames.includes(n);
    cb.onchange = updateStatus;
    lbl.append(cb, document.createTextNode(' ' + n));
    checksWrap.appendChild(lbl);
    nameCheckboxes.push(cb);
  }
  addField('Periods', checksWrap);

  const chimeCb = $('<input>');
  chimeCb.type = 'checkbox';
  chimeCb.checked = draft.chime;
  const chimeWrap = $('<span>');
  chimeWrap.append(chimeCb, document.createTextNode(' chime at segment changes'));
  addField('Chime', chimeWrap);

  editor.appendChild($('<div>', 'Segments')).className = 'routine-segments-title';
  const rowsDiv = $('<div>');
  editor.appendChild(rowsDiv);

  const addRowBtn = $('<button>', 'Add segment');
  addRowBtn.className = 'alarm-btn-small';
  addRowBtn.onclick = () => {
    rows.push({
      id: newId(),
      label: '',
      color: CHUNK_COLORS[rows.length % CHUNK_COLORS.length],
      mode: 'start',
      seconds: 300,
    });
    renderRows();
  };
  const addRowWrap = $('<div>');
  addRowWrap.className = 'routine-add-row';
  addRowWrap.appendChild(addRowBtn);
  editor.appendChild(addRowWrap);

  const status = $('<div>');
  status.className = 'routine-status';
  editor.appendChild(status);

  const scoped = () => nameCheckboxes.filter((c) => c.checked).map((c) => c.value);

  function updateStatus() {
    status.replaceChildren();
    const { error } = compileRows(rows);
    if (error) {
      const p = $('<p>', error);
      p.className = 'warn';
      status.appendChild(p);
      return;
    }
    if (!getBellScheduleFn) return;
    const bellSchedule = getBellScheduleFn();
    const now = Temporal.Now.instant();
    const fixed = fixedSeconds(rows);
    const hasElastic = rows.some((r) => r.mode === 'elastic');
    for (const name of scoped()) {
      const period = nextOccurrenceOfPeriod(bellSchedule, now, name);
      if (!period) continue;
      const length = (period.end.epochMilliseconds - period.start.epochMilliseconds) / 1000;
      if (fixed > length) {
        const p = $(
          '<p>',
          `${name}: fixed segments (${formatSeconds(fixed)}) exceed its ${formatSeconds(length)} length.`,
        );
        p.className = 'warn';
        status.appendChild(p);
      } else if (hasElastic) {
        status.appendChild($('<p>', `${name}: elastic segment gets ${formatSeconds(length - fixed)}.`));
      }
    }
  }

  function renderRows() {
    rowsDiv.replaceChildren();
    rows.forEach((row, i) => {
      const div = $('<div>');
      div.className = 'chunk-row';

      const up = $('<button>', '↑');
      up.className = 'alarm-btn-small';
      up.disabled = i === 0;
      up.onclick = () => {
        [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
        renderRows();
      };
      const down = $('<button>', '↓');
      down.className = 'alarm-btn-small';
      down.disabled = i === rows.length - 1;
      down.onclick = () => {
        [rows[i], rows[i + 1]] = [rows[i + 1], rows[i]];
        renderRows();
      };

      const label = $('<input>');
      label.type = 'text';
      label.placeholder = 'label';
      label.value = row.label;
      label.oninput = () => {
        row.label = label.value;
      };

      const mins = $('<input>');
      mins.type = 'number';
      mins.className = 'alarm-num';
      mins.min = '0';
      mins.step = 'any';
      mins.value = row.seconds ? +(row.seconds / 60).toFixed(2) : '';
      mins.oninput = () => {
        row.seconds = Math.round((parseFloat(mins.value) || 0) * 60);
        updateStatus();
      };

      const mode = $('<select>');
      for (const [v, t] of [
        ['start', 'from start'],
        ['elastic', 'elastic'],
        ['end', 'from end'],
      ]) {
        const opt = $('<option>', t);
        opt.value = v;
        if (row.mode === v) opt.selected = true;
        mode.appendChild(opt);
      }
      mode.onchange = () => {
        row.mode = mode.value;
        mins.disabled = row.mode === 'elastic';
        updateStatus();
      };
      mins.disabled = row.mode === 'elastic';

      const color = $('<input>');
      color.type = 'color';
      color.value = row.color || CHUNK_COLORS[i % CHUNK_COLORS.length];
      color.oninput = () => {
        row.color = color.value;
      };

      const del = $('<button>', '×');
      del.className = 'alarm-btn-small';
      del.onclick = () => {
        rows = rows.filter((r) => r.id !== row.id);
        renderRows();
      };

      div.append(up, down, label, mins, mode, color, del);
      rowsDiv.appendChild(div);
    });
    updateStatus();
  }

  const actions = $('<div>');
  actions.className = 'alarm-actions';
  const save = $('<button>', 'Save');
  save.className = 'alarm-btn alarm-save';
  save.onclick = () => {
    const compiled = compileRows(rows);
    if (compiled.error) {
      updateStatus();
      return;
    }
    const routine = {
      id: draft.id,
      name: nameInput.value.trim() || 'Routine',
      scopeNames: scoped(),
      chime: chimeCb.checked,
      enabled: existing ? existing.enabled !== false : true,
      chunks: compiled.chunks.map((c) => ({ ...c, label: c.label.trim() || 'Segment' })),
    };
    if (isNew) {
      routines.push(routine);
    } else {
      const i = routines.findIndex((r) => r.id === routine.id);
      if (i >= 0) routines[i] = routine;
    }
    saveAndRefresh();
    renderRoutineList();
    closeRoutineEditor();
  };
  const cancel = $('<button>', 'Cancel');
  cancel.className = 'alarm-btn';
  cancel.onclick = closeRoutineEditor;
  actions.append(save, cancel);
  editor.appendChild(actions);

  renderRows();
  editor.style.display = 'block';
  $('#routine-add').style.display = 'none';
};

const closeRoutineEditor = () => {
  $('#routine-editor').style.display = 'none';
  $('#routine-add').style.display = '';
};

const openRoutinesPopup = () => {
  renderRoutineList();
  closeRoutineEditor();
  $('#popup-routines').classList.add('active');
};

const setupTimer = (getBellScheduleFnArg, requestUpdateFnArg) => {
  getBellScheduleFn = getBellScheduleFnArg;
  requestUpdateFn = requestUpdateFnArg;

  $('#timer-icon').onclick = toggleTimerMode;
  updateTimerTeacherVisibility();
  $('#routines-edit').onclick = openRoutinesPopup;
  $('#routine-add').onclick = () => openRoutineEditor(null);

  $('#chunk-left').onclick = () => {
    togoChunk = !togoChunk;
    if (requestUpdateFn) requestUpdateFn();
  };
};

export { setupTimer, tickTimer, renderTimer, isTimerMode, updateTimerTeacherVisibility };

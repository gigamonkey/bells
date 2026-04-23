import { Temporal } from '@js-temporal/polyfill';
import { $ } from './dom.js';
import { isTeacher } from './calendar.js';

const STORAGE_KEY = 'alarms';
const FIRED_KEY = 'alarmsFired';
const MAX_MISSED_MS = 60 * 1000;
const CHIME_INTERVAL_MS = 15000;

let alarms = loadAlarms();
let audioCtx = null;
let audioWarningEl = null;
let getBellScheduleFn = null;
let previousInstant = null;
let cachedFirings = null;
let cachedDate = null;
let cachedAlarmsVersion = 0;
let alarmsVersion = 0;

function loadAlarms() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveAlarms() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
  alarmsVersion++;
}

function loadFiredKeys() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(FIRED_KEY));
    if (!raw || typeof raw !== 'object') return { date: null, keys: [] };
    return raw;
  } catch {
    return { date: null, keys: [] };
  }
}

function saveFiredKeys(obj) {
  sessionStorage.setItem(FIRED_KEY, JSON.stringify(obj));
}

function firedKeysForDate(dateStr) {
  const rec = loadFiredKeys();
  if (rec.date !== dateStr) return new Set();
  return new Set(rec.keys);
}

function recordFired(dateStr, key) {
  const rec = loadFiredKeys();
  const keys = rec.date === dateStr ? new Set(rec.keys) : new Set();
  keys.add(key);
  saveFiredKeys({ date: dateStr, keys: [...keys] });
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function periodMatchesScope(period, alarm) {
  return (alarm.scopeNames || []).includes(period.name);
}

function computeFirings(date, bellSchedule) {
  const periods = bellSchedule.scheduleFor(date);
  const out = [];
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    for (const period of periods) {
      if (!periodMatchesScope(period, alarm)) continue;
      const fireAt = alarm.anchor === 'before-end'
        ? period.end.subtract({ seconds: alarm.offset })
        : period.start.add({ seconds: alarm.offset });
      out.push({ alarm, period, fireAt });
    }
  }
  out.sort((a, b) => Temporal.Instant.compare(a.fireAt, b.fireAt));
  return out;
}

function getFirings(bellSchedule, instant) {
  const date = instant.toZonedDateTimeISO(bellSchedule.timezone).toPlainDate();
  const dateStr = date.toString();
  if (
    cachedFirings &&
    cachedDate === dateStr &&
    cachedAlarmsVersion === alarmsVersion
  ) {
    return { firings: cachedFirings, dateStr };
  }
  cachedFirings = computeFirings(date, bellSchedule);
  cachedDate = dateStr;
  cachedAlarmsVersion = alarmsVersion;
  return { firings: cachedFirings, dateStr };
}

function tickAlarms(instant) {
  if (!getBellScheduleFn) return;
  if (!isTeacher()) {
    previousInstant = instant;
    return;
  }
  const bellSchedule = getBellScheduleFn();
  const prev = previousInstant;
  previousInstant = instant;
  if (!prev) return;

  const { firings, dateStr } = getFirings(bellSchedule, instant);
  const fired = firedKeysForDate(dateStr);

  for (const f of firings) {
    const fireMs = f.fireAt.epochMilliseconds;
    const nowMs = instant.epochMilliseconds;
    const prevMs = prev.epochMilliseconds;
    if (fireMs > nowMs) break;
    if (fireMs <= prevMs) continue;
    if (nowMs - fireMs > MAX_MISSED_MS) continue;
    const key = `${f.alarm.id}|${f.period.name}|${fireMs}`;
    if (fired.has(key)) continue;
    recordFired(dateStr, key);
    fired.add(key);
    fireAlarm(f.alarm, f.period);
    if (!f.alarm.recurring) {
      f.alarm.enabled = false;
      saveAlarms();
      if (document.getElementById('popup-alarms')?.classList.contains('active')) {
        renderAlarmList();
      }
      break;
    }
  }
}

function fireAlarm(alarm, period) {
  showBanner(describeAlarm(alarm, period, { short: true }), { repeatChime: true });
}

function showBanner(labelText, { repeatChime = false } = {}) {
  let stack = $('#alarm-banner-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'alarm-banner-stack';
    document.body.appendChild(stack);
  }
  const banner = document.createElement('div');
  banner.className = 'alarm-banner';
  const label = document.createElement('span');
  label.className = 'alarm-banner-label';
  label.textContent = labelText;
  const close = document.createElement('span');
  close.className = 'alarm-banner-close';
  close.textContent = '×';
  let intervalId = null;
  const dismiss = () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    banner.classList.add('closing');
    setTimeout(() => {
      banner.remove();
      if (!document.querySelector('.alarm-banner')) {
        document.getElementById('container')?.classList.remove('alarm-pulse');
      }
    }, 300);
  };
  close.onclick = dismiss;
  banner.append(label, close);
  stack.appendChild(banner);
  document.getElementById('container')?.classList.add('alarm-pulse');
  playChime();
  if (repeatChime) {
    intervalId = setInterval(playChime, CHIME_INTERVAL_MS);
  }
}

function ensureAudio() {
  if (!audioCtx) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    } catch {
      audioCtx = null;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  updateAudioWarning();
  return audioCtx;
}

function playChime() {
  const ctx = ensureAudio();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  playTone(ctx, 880, now, 0.22);
  playTone(ctx, 660, now + 0.24, 0.28);
}

function playTone(ctx, freq, startAt, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
  gain.gain.linearRampToValueAtTime(0.25, startAt + duration - 0.04);
  gain.gain.linearRampToValueAtTime(0, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function updateAudioWarning() {
  if (!audioWarningEl) return;
  const ok = audioCtx && audioCtx.state === 'running';
  audioWarningEl.style.display = ok ? 'none' : 'block';
}

function formatOffset(seconds) {
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const parts = [];
  if (m) parts.push(`${m}m`);
  if (s || !m) parts.push(`${s}s`);
  return parts.join(' ');
}

function scopeDescription(alarm) {
  const names = alarm.scopeNames || [];
  if (names.length === 0) return '(no periods selected)';
  if (names.length === 1) return names[0];
  return names.join(', ');
}

function describeAlarm(alarm, period, { short = false } = {}) {
  const off = formatOffset(alarm.offset);
  const anchorText = alarm.anchor === 'before-end' ? 'before end of' : 'after start of';
  const target = short && period ? period.name : scopeDescription(alarm);
  const suffix = alarm.recurring ? '' : ' (once)';
  const spec = `${off} ${anchorText} ${target}${suffix}`;
  const label = alarm.label && alarm.label.trim();
  return label ? `${label} (${spec})` : spec;
}

function allPeriodNamesForToday() {
  if (!getBellScheduleFn) return [];
  const bs = getBellScheduleFn();
  const today = Temporal.Now.plainDateISO(bs.timezone);
  const date = bs.isSchoolDay(today) ? today : bs.nextSchoolDay(today);
  const names = new Set();
  for (const p of bs.scheduleFor(date)) names.add(p.name);
  return [...names];
}

function renderAlarmList() {
  const list = $('#alarm-list');
  if (!list) return;
  list.replaceChildren();

  if (alarms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'alarm-empty';
    empty.textContent = 'No alarms yet.';
    list.appendChild(empty);
    return;
  }

  for (const alarm of alarms) {
    const row = document.createElement('div');
    row.className = 'alarm-row';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!alarm.enabled;
    toggle.onchange = () => {
      alarm.enabled = toggle.checked;
      saveAlarms();
    };

    const desc = document.createElement('span');
    desc.className = 'alarm-desc';
    desc.textContent = describeAlarm(alarm);

    const testBtn = document.createElement('button');
    testBtn.className = 'alarm-btn';
    testBtn.textContent = 'Test';
    testBtn.onclick = () => {
      showBanner(describeAlarm(alarm) + ' (test)', { repeatChime: true });
    };

    const editBtn = document.createElement('button');
    editBtn.className = 'alarm-btn';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => openEditor(alarm);

    const delBtn = document.createElement('button');
    delBtn.className = 'alarm-btn';
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => {
      alarms = alarms.filter((a) => a.id !== alarm.id);
      saveAlarms();
      renderAlarmList();
    };

    row.append(toggle, desc, testBtn, editBtn, delBtn);
    list.appendChild(row);
  }
}

function openEditor(existing) {
  const editor = $('#alarm-editor');
  const isNew = !existing;
  const draft = existing
    ? { ...existing }
    : {
        id: newId(),
        offset: 300,
        anchor: 'before-end',
        scopeNames: [],
        label: '',
        recurring: true,
        enabled: true,
      };

  editor.replaceChildren();

  const title = document.createElement('h3');
  title.textContent = isNew ? 'New alarm' : 'Edit alarm';
  editor.appendChild(title);

  const addField = (labelText, input) => {
    const wrap = document.createElement('div');
    wrap.className = 'alarm-field';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    wrap.append(lbl, input);
    editor.appendChild(wrap);
  };

  const totalSecs = Math.abs(draft.offset || 0);
  const mins = document.createElement('input');
  mins.type = 'number';
  mins.step = '1';
  mins.min = '0';
  mins.value = Math.floor(totalSecs / 60);
  mins.className = 'alarm-num';

  const secs = document.createElement('input');
  secs.type = 'number';
  secs.step = '1';
  secs.min = '0';
  secs.max = '59';
  secs.value = totalSecs % 60;
  secs.className = 'alarm-num';

  const recurringCb = document.createElement('input');
  recurringCb.type = 'checkbox';
  recurringCb.checked = draft.recurring !== false;
  const recurringLbl = document.createElement('label');
  recurringLbl.className = 'alarm-recurring';
  recurringLbl.append(recurringCb, document.createTextNode(' Recurring'));

  const offsetWrap = document.createElement('span');
  offsetWrap.className = 'alarm-offset-wrap';
  offsetWrap.append(
    mins, document.createTextNode(' min '),
    secs, document.createTextNode(' sec '),
    recurringLbl,
  );
  addField('Offset', offsetWrap);

  const anchorWrap = document.createElement('span');
  anchorWrap.className = 'alarm-anchor';
  const anchorRadios = [];
  const anchorGroup = `alarm-anchor-${draft.id}`;
  for (const [v, t] of [['after-start', 'after start of period'], ['before-end', 'before end of period']]) {
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = anchorGroup;
    r.value = v;
    if (draft.anchor === v) r.checked = true;
    const lbl = document.createElement('label');
    lbl.className = 'alarm-radio';
    lbl.append(r, document.createTextNode(' ' + t));
    anchorWrap.appendChild(lbl);
    anchorRadios.push(r);
  }
  addField('Anchor', anchorWrap);

  const nameWrap = document.createElement('div');
  nameWrap.className = 'alarm-field alarm-field-checks';
  const nameLbl = document.createElement('label');
  nameLbl.textContent = 'Periods';
  const checksCol = document.createElement('div');
  checksCol.className = 'alarm-checks-col';
  const checksWrap = document.createElement('div');
  checksWrap.className = 'alarm-checks';
  const names = allPeriodNamesForToday();
  const allNames = [...new Set([...names, ...(draft.scopeNames || [])])];
  const nameCheckboxes = [];
  for (const n of allNames) {
    const checkLbl = document.createElement('label');
    checkLbl.className = 'alarm-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = n;
    cb.checked = (draft.scopeNames || []).includes(n);
    checkLbl.append(cb, document.createTextNode(' ' + n));
    checksWrap.appendChild(checkLbl);
    nameCheckboxes.push(cb);
  }

  const checkActions = document.createElement('div');
  checkActions.className = 'alarm-check-actions';
  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.className = 'alarm-btn-small';
  selectAll.textContent = 'Select all';
  selectAll.onclick = () => nameCheckboxes.forEach((c) => (c.checked = true));
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'alarm-btn-small';
  clearAll.textContent = 'Clear all';
  clearAll.onclick = () => nameCheckboxes.forEach((c) => (c.checked = false));
  checkActions.append(selectAll, clearAll);

  checksCol.append(checksWrap, checkActions);
  nameWrap.append(nameLbl, checksCol);
  editor.appendChild(nameWrap);

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = draft.label || '';
  labelInput.placeholder = '(optional)';
  addField('Label', labelInput);

  const actions = document.createElement('div');
  actions.className = 'alarm-actions';

  const save = document.createElement('button');
  save.className = 'alarm-btn alarm-save';
  save.textContent = 'Save';
  save.onclick = () => {
    const m = Math.max(0, parseInt(mins.value, 10) || 0);
    const s = Math.max(0, parseInt(secs.value, 10) || 0);
    draft.offset = m * 60 + s;
    draft.anchor = anchorRadios.find((r) => r.checked)?.value || 'before-end';
    draft.scopeNames = nameCheckboxes.filter((c) => c.checked).map((c) => c.value);
    draft.recurring = recurringCb.checked;
    draft.label = labelInput.value;
    if (isNew) alarms.push(draft);
    else {
      const i = alarms.findIndex((a) => a.id === draft.id);
      if (i >= 0) alarms[i] = draft;
    }
    saveAlarms();
    renderAlarmList();
    editor.style.display = 'none';
  };

  const cancel = document.createElement('button');
  cancel.className = 'alarm-btn';
  cancel.textContent = 'Cancel';
  cancel.onclick = () => {
    editor.style.display = 'none';
  };

  actions.append(save, cancel);
  editor.appendChild(actions);

  editor.style.display = 'block';
}

function setupAlarmPopup() {
  $('#bell-icon').onclick = () => {
    togglePopup('popup-alarms');
    if ($('#popup-alarms').classList.contains('active')) {
      ensureAudio();
      renderAlarmList();
      $('#alarm-editor').style.display = 'none';
    }
  };

  $('#alarm-add').onclick = () => openEditor(null);

  audioWarningEl = $('#alarm-audio-warning');
  updateAudioWarning();

  document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(updateAudioWarning).catch(() => {});
    }
  }, { capture: true });
}

function togglePopup(id) {
  $(`#${id}`).classList.toggle('active');
}

function updateTeacherModeVisibility() {
  const icon = $('#bell-icon');
  if (icon) icon.style.display = isTeacher() ? '' : 'none';
  if (!isTeacher()) {
    $('#popup-alarms')?.classList.remove('active');
  }
}

function setupAlarms(getBellScheduleFnArg) {
  getBellScheduleFn = getBellScheduleFnArg;
  setupAlarmPopup();
  updateTeacherModeVisibility();
}

export { setupAlarms, tickAlarms, updateTeacherModeVisibility };

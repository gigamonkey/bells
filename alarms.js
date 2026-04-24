import { Temporal } from '@js-temporal/polyfill';
import { $ } from './dom.js';
import { isTeacher } from './calendar.js';

const STORAGE_KEY = 'alarms';
const FIRED_KEY = 'alarmsFired';
const MAX_MISSED_MS = 60 * 1000;
const CHIME_INTERVAL_MS = 15000;
const NOTIF_TAG_PREFIX = 'alarm:';
const NOTIF_SCHEDULE_SLOP_MS = 2000;

let alarms = loadAlarms();
let audioCtx = null;
let audioWarningEl = null;
let permissionStatusEl = null;
let getBellScheduleFn = null;
let previousInstant = null;
let lastTickDateStr = null;
let cachedFirings = null;
let cachedDate = null;
let cachedAlarmsVersion = 0;
let alarmsVersion = 0;

function hasBackgroundSupport() {
  return (
    typeof Notification !== 'undefined' &&
    'showTrigger' in Notification.prototype &&
    'serviceWorker' in navigator &&
    'TimestampTrigger' in window
  );
}

function notificationTagFor(alarmId, dateStr, fireMs) {
  return `${NOTIF_TAG_PREFIX}${alarmId}:${dateStr}:${fireMs}`;
}

async function swRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function scheduleNotification(firing, dateStr) {
  if (!hasBackgroundSupport()) return;
  if (Notification.permission !== 'granted') return;
  const reg = await swRegistration();
  if (!reg) return;
  const fireMs = firing.fireAt.epochMilliseconds;
  if (fireMs <= Date.now() + NOTIF_SCHEDULE_SLOP_MS) return;
  const tag = notificationTagFor(firing.alarm.id, dateStr, fireMs);
  const title = 'Bell alarm';
  const body = describeAlarm(firing.alarm, firing.period, { short: true });
  try {
    await reg.showNotification(title, {
      tag,
      body,
      requireInteraction: true,
      showTrigger: new TimestampTrigger(fireMs),
      data: { tag, alarmId: firing.alarm.id, periodName: firing.period.name, fireMs },
    });
  } catch (e) {
    console.warn('scheduleNotification failed', e);
  }
}

async function existingScheduledTags() {
  const reg = await swRegistration();
  if (!reg) return new Map();
  try {
    const ns = await reg.getNotifications({ includeTriggered: false });
    const map = new Map();
    for (const n of ns) {
      if (n.tag && n.tag.startsWith(NOTIF_TAG_PREFIX)) map.set(n.tag, n);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function cancelNotificationByTag(tag) {
  const reg = await swRegistration();
  if (!reg) return;
  try {
    const ns = await reg.getNotifications({ tag });
    for (const n of ns) n.close();
  } catch {}
}

async function cancelAllAlarmNotifications() {
  const existing = await existingScheduledTags();
  for (const n of existing.values()) n.close();
}

async function reconcileNotifications() {
  if (!hasBackgroundSupport()) return;
  if (!isTeacher() || Notification.permission !== 'granted') {
    await cancelAllAlarmNotifications();
    return;
  }
  if (!getBellScheduleFn) return;
  const bellSchedule = getBellScheduleFn();
  const now = Temporal.Now.instant();
  const date = now.toZonedDateTimeISO(bellSchedule.timezone).toPlainDate();
  const dateStr = date.toString();
  const firings = computeFirings(date, bellSchedule);
  const wantedTags = new Set();
  const wantedFirings = [];
  for (const f of firings) {
    const fireMs = f.fireAt.epochMilliseconds;
    if (fireMs <= Date.now() + NOTIF_SCHEDULE_SLOP_MS) continue;
    const tag = notificationTagFor(f.alarm.id, dateStr, fireMs);
    wantedTags.add(tag);
    wantedFirings.push({ firing: f, tag });
  }
  const existing = await existingScheduledTags();
  for (const [tag, n] of existing) {
    if (!wantedTags.has(tag)) n.close();
  }
  for (const { firing, tag } of wantedFirings) {
    if (existing.has(tag)) continue;
    await scheduleNotification(firing, dateStr);
    void tag;
  }
}

async function ensurePermissionAndReconcile() {
  if (!hasBackgroundSupport()) {
    updatePermissionStatus();
    return;
  }
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {}
  }
  updatePermissionStatus();
  reconcileNotifications();
}

function updatePermissionStatus() {
  if (!permissionStatusEl) return;
  if (!hasBackgroundSupport()) {
    permissionStatusEl.style.display = 'none';
    return;
  }
  const p = Notification.permission;
  if (p === 'granted') {
    permissionStatusEl.textContent = 'On-screen notifications enabled for alarms fired while this window is hidden.';
  } else if (p === 'denied') {
    permissionStatusEl.textContent = 'Notifications disabled — alarms will still chime, but no on-screen alert will appear when the window is hidden.';
  } else {
    permissionStatusEl.textContent = 'Grant notification permission to see an on-screen alert when an alarm fires while the window is hidden. (Will ask when you save an alarm.)';
  }
  permissionStatusEl.style.display = 'block';
}

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
  reconcileNotifications();
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
    if (alarm.anchor === 'from-now') {
      if (!alarm.fromNowFireMs) continue;
      const fireAt = Temporal.Instant.fromEpochMilliseconds(alarm.fromNowFireMs);
      const fireDate = fireAt.toZonedDateTimeISO(bellSchedule.timezone).toPlainDate();
      if (Temporal.PlainDate.compare(fireDate, date) !== 0) continue;
      out.push({ alarm, period: { name: 'Timer' }, fireAt });
      continue;
    }
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
  if (lastTickDateStr !== dateStr) {
    lastTickDateStr = dateStr;
    reconcileNotifications();
  }
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
    fireAlarm(f.alarm, f.period, fireMs);
    if (!f.alarm.recurring) {
      alarms = alarms.filter((a) => a.id !== f.alarm.id);
      saveAlarms();
      if (document.getElementById('popup-alarms')?.classList.contains('active')) {
        renderAlarmList();
      }
      break;
    }
  }
}

function fireAlarm(alarm, period, fireMs) {
  const visible = document.visibilityState === 'visible';
  if (visible) {
    showBanner(describeAlarm(alarm, period, { short: true }), {
      repeatChime: true,
      speakText: alarm.speakText,
      dedupKey: `alarm:${alarm.id}`,
    });
  }
  if (visible && fireMs && lastTickDateStr && 'serviceWorker' in navigator) {
    const tag = notificationTagFor(alarm.id, lastTickDateStr, fireMs);
    navigator.serviceWorker.controller?.postMessage({ type: 'alarm-fired', tag });
    cancelNotificationByTag(tag);
  }
}

function speak(text) {
  if (!text || typeof speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(u);
  } catch {}
}

function cancelSpeech() {
  if (typeof speechSynthesis === 'undefined') return;
  try { speechSynthesis.cancel(); } catch {}
}

function showBanner(labelText, { repeatChime = false, speakText = '', dedupKey = '' } = {}) {
  let stack = $('#alarm-banner-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'alarm-banner-stack';
    document.body.appendChild(stack);
  }
  if (dedupKey) {
    const existing = stack.querySelector(`[data-alarm-dedup="${CSS.escape(dedupKey)}"]`);
    if (existing) return;
  }
  const banner = document.createElement('div');
  if (dedupKey) banner.dataset.alarmDedup = dedupKey;
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
    if (!document.querySelector('.alarm-banner:not(.closing)')) cancelSpeech();
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
  const cue = () => {
    playChime();
    if (speakText) setTimeout(() => speak(speakText), 700);
  };
  cue();
  if (repeatChime) {
    intervalId = setInterval(cue, CHIME_INTERVAL_MS);
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
  let spec;
  if (alarm.anchor === 'from-now') {
    if (alarm.fromNowFireMs) {
      const offSec = alarm.offset || 0;
      const dm = Math.floor(offSec / 60);
      const ds = offSec % 60;
      const duration = `${dm}:${String(ds).padStart(2, '0')}`;
      const startD = new Date(alarm.fromNowFireMs - offSec * 1000);
      const sh = String(startD.getHours()).padStart(2, '0');
      const sm = String(startD.getMinutes()).padStart(2, '0');
      spec = `${duration} timer started at ${sh}:${sm}`;
    } else {
      spec = 'timer';
    }
  } else {
    const off = formatOffset(alarm.offset);
    const anchorText = alarm.anchor === 'before-end' ? 'before end of' : 'after start of';
    const target = short && period ? period.name : scopeDescription(alarm);
    const suffix = alarm.recurring ? '' : ' (once)';
    spec = `${off} ${anchorText} ${target}${suffix}`;
  }
  const label = (alarm.label && alarm.label.trim()) || (alarm.speakText && alarm.speakText.trim());
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
      showBanner(describeAlarm(alarm) + ' (test)', {
        repeatChime: true,
        speakText: alarm.speakText,
        dedupKey: `alarm:${alarm.id}`,
      });
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
        speakText: '',
        recurring: false,
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
  recurringCb.checked = !!draft.recurring;
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
  for (const [v, t] of [
    ['after-start', 'after start of period'],
    ['before-end', 'before end of period'],
    ['from-now', 'from now'],
  ]) {
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

  const syncAnchorDependent = () => {
    const fromNow = anchorRadios.find((r) => r.checked)?.value === 'from-now';
    nameWrap.style.display = fromNow ? 'none' : '';
    recurringLbl.style.display = fromNow ? 'none' : '';
  };
  for (const r of anchorRadios) r.addEventListener('change', syncAnchorDependent);
  syncAnchorDependent();

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = draft.label || '';
  labelInput.placeholder = '(optional)';
  addField('Label', labelInput);

  const speakInput = document.createElement('input');
  speakInput.type = 'text';
  speakInput.value = draft.speakText || '';
  speakInput.placeholder = '(optional, spoken aloud after chime)';
  addField('Speak', speakInput);

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
    draft.speakText = speakInput.value;
    if (draft.anchor === 'from-now') {
      draft.fromNowFireMs = Date.now() + draft.offset * 1000;
      draft.recurring = false;
    } else {
      delete draft.fromNowFireMs;
    }
    if (isNew) alarms.push(draft);
    else {
      const i = alarms.findIndex((a) => a.id === draft.id);
      if (i >= 0) alarms[i] = draft;
    }
    saveAlarms();
    renderAlarmList();
    closeEditor();
    if (hasBackgroundSupport() && Notification.permission === 'default') {
      ensurePermissionAndReconcile();
    }
  };

  const cancel = document.createElement('button');
  cancel.className = 'alarm-btn';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeEditor;

  actions.append(save, cancel);
  editor.appendChild(actions);

  editor.style.display = 'block';
  $('#alarm-add').style.display = 'none';
}

function closeEditor() {
  $('#alarm-editor').style.display = 'none';
  $('#alarm-add').style.display = '';
}

function setupAlarmPopup() {
  $('#bell-icon').onclick = () => {
    togglePopup('popup-alarms');
    if ($('#popup-alarms').classList.contains('active')) {
      ensureAudio();
      renderAlarmList();
      updatePermissionStatus();
      closeEditor();
    }
  };

  $('#alarm-add').onclick = () => openEditor(null);

  audioWarningEl = $('#alarm-audio-warning');
  permissionStatusEl = $('#alarm-permission-status');
  updateAudioWarning();
  updatePermissionStatus();

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
    cancelAllAlarmNotifications();
  } else {
    reconcileNotifications();
  }
}

function setupAlarms(getBellScheduleFnArg) {
  getBellScheduleFn = getBellScheduleFnArg;
  setupAlarmPopup();
  updateTeacherModeVisibility();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const data = e.data || {};
      if (data.type === 'alarm-notification-click') {
        if (data.body) showBanner(data.body, { repeatChime: true });
      }
    });
  }

  reconcileNotifications();
}

export { setupAlarms, tickAlarms, updateTeacherModeVisibility };

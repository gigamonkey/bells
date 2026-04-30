import { Temporal } from '@js-temporal/polyfill';
import { BellSchedule } from '@peterseibel/bells';
import allCalendars from '@peterseibel/bhs-calendars';

// Make Temporal available as a global so the lib (which uses it as a global
// rather than importing it explicitly) works correctly when bundled.
if (!globalThis.Temporal) {
  globalThis.Temporal = Temporal;
}

const DEFAULT_CALENDAR_ID = 'bhs';

const DEFAULT_EXTRA_PERIODS = Array.from({ length: 7 }, () => ({
  zero: false,
  seventh: false,
  ext: false,
}));

let extraPeriods = JSON.parse(localStorage.getItem('extraPeriods'));
let otherData = JSON.parse(localStorage.getItem('otherData')) || {};

/**
 * Group all yearly calendar files by `id`. Each group becomes one selectable
 * calendar in the picker. Years within a group are sorted by `firstDay` so
 * the BellSchedule sees them in chronological order.
 */
const buildRegistry = () => {
  const map = new Map();
  for (const y of allCalendars) {
    const entry = map.get(y.id) ?? { id: y.id, name: y.name, years: [] };
    entry.years.push(y);
    map.set(y.id, entry);
  }
  for (const entry of map.values()) {
    entry.years.sort((a, b) => (a.firstDay < b.firstDay ? -1 : a.firstDay > b.firstDay ? 1 : 0));
  }
  return map;
};

const registry = buildRegistry();

/** @returns {{id: string, name: string}[]} sorted alphabetically by name */
const getCalendars = () =>
  [...registry.values()]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

const getSelectedCalendarId = () => {
  const stored = localStorage.getItem('selectedCalendar');
  if (stored && registry.has(stored)) return stored;
  return DEFAULT_CALENDAR_ID;
};

const getSelectedCalendarName = () => {
  const entry = registry.get(getSelectedCalendarId()) ?? registry.get(DEFAULT_CALENDAR_ID);
  return entry?.name ?? '';
};

const setSelectedCalendar = (id) => {
  if (!registry.has(id)) return;
  localStorage.setItem('selectedCalendar', id);
  buildBellSchedule();
};

const getZero = (day) => extraPeriods[day].zero;
const getSeventh = (day) => extraPeriods[day].seventh;
const getExt = (day) => extraPeriods[day].ext;

const isTeacher = () => otherData?.isTeacher;

const setZero = (day, value) => {
  extraPeriods[day].zero = value;
  saveConfiguration();
};

const setSeventh = (day, value) => {
  extraPeriods[day].seventh = value;
  saveConfiguration();
};

const setExt = (day, value) => {
  extraPeriods[day].ext = value;
  saveConfiguration();
};

const toggleTeacher = (e) => {
  otherData.isTeacher = !otherData?.isTeacher;
  e.target.innerText = otherData.isTeacher ? '🍎' : '✏️';
  saveConfiguration();
};

/**
 * Collect the set of optional-period tags actually used by the active
 * calendar's schedules. Used by the UI to hide checkboxes for tags that
 * the selected school doesn't have (e.g. middle schools have no Period 0).
 *
 * @returns {Set<string>} subset of {'zero', 'seventh', 'ext'} (and any other
 *   optional tags) that appear on at least one period in any schedule of any
 *   year of the selected calendar.
 */
const getActiveOptionalTags = () => {
  const tags = new Set();
  const entry = registry.get(getSelectedCalendarId());
  if (!entry) return tags;
  for (const year of entry.years) {
    for (const periods of Object.values(year.schedules || {})) {
      for (const p of periods) {
        if (!p.tags?.includes('optional')) continue;
        for (const t of p.tags) {
          if (t !== 'optional' && t !== 'nonschool') tags.add(t);
        }
      }
    }
  }
  return tags;
};

/**
 * Build includeTags from extraPeriods config:
 * Maps day-of-week (1=Mon..7=Sun) to an array of tag strings for
 * optional periods that are enabled on that day.
 * Temporal uses 1=Mon..7=Sun; extraPeriods uses 0=Sun..6=Sat (JS getDay()).
 * We map: Temporal dow 1→JS 1, 2→JS 2, ..., 5→JS 5; weekend not relevant.
 */
const buildIncludeTags = () => {
  const tags = {};
  // Temporal: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  // JS getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  // extraPeriods is indexed by JS getDay() value (Mon-Fri share the same indices).
  for (let temporalDow = 1; temporalDow <= 5; temporalDow++) {
    const jsDow = temporalDow; // Mon-Fri: same index in both systems
    const ep = extraPeriods[jsDow];
    // 'nonschool' is always included so that nonSchool periods (like Lunch on
    // finals days) are passed through hasPeriod and can be trimmed from day ends.
    const dayTags = ['nonschool'];
    if (ep.zero) dayTags.push('zero');
    if (ep.seventh) dayTags.push('seventh');
    if (ep.ext) dayTags.push('ext');
    tags[temporalDow] = dayTags;
  }
  return tags;
};

let _bellSchedule = null;

const buildBellSchedule = () => {
  const role = otherData?.isTeacher ? 'teacher' : 'student';
  const includeTags = buildIncludeTags();
  const entry = registry.get(getSelectedCalendarId()) ?? registry.get(DEFAULT_CALENDAR_ID);
  _bellSchedule = new BellSchedule(entry.years, { role, includeTags });
};

/**
 * Get the current BellSchedule instance (built from current config).
 */
const getBellSchedule = () => {
  if (!_bellSchedule) buildBellSchedule();
  return _bellSchedule;
};

const saveConfiguration = () => {
  localStorage.setItem('extraPeriods', JSON.stringify(extraPeriods));
  localStorage.setItem('otherData', JSON.stringify(otherData));
  // Rebuild bell schedule when config changes.
  buildBellSchedule();
};

if (extraPeriods === null) {
  extraPeriods = DEFAULT_EXTRA_PERIODS;
  saveConfiguration();
}

// Build initial bell schedule.
buildBellSchedule();

export {
  getBellSchedule,
  getCalendars,
  getSelectedCalendarId,
  getSelectedCalendarName,
  setSelectedCalendar,
  getActiveOptionalTags,
  getZero,
  getSeventh,
  getExt,
  setZero,
  setSeventh,
  setExt,
  toggleTeacher,
  isTeacher,
};

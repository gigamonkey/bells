import { Temporal } from '@js-temporal/polyfill';
import { BellSchedule } from '@peterseibel/bells';
import calendar20252026 from './calendars/2025-2026.json' with { type: 'json' };
import calendar20242025 from './calendars/2024-2025.json' with { type: 'json' };
import calendar20232024 from './calendars/2023-2024.json' with { type: 'json' };
import calendar20222023 from './calendars/2022-2023.json' with { type: 'json' };

const rawCalendars = [calendar20252026, calendar20242025, calendar20232024, calendar20222023];

// Make Temporal available as a global so the lib (which uses it as a global
// rather than importing it explicitly) works correctly when bundled.
globalThis.Temporal = Temporal;

const TIMEZONE = 'America/Los_Angeles';

const DEFAULT_EXTRA_PERIODS = Array.from({ length: 7 }, () => ({
  zero: false,
  seventh: false,
  ext: false,
}));

let extraPeriods = JSON.parse(localStorage.getItem('extraPeriods'));
let otherData = JSON.parse(localStorage.getItem('otherData')) || {};

const getZero = (day) => {
  return extraPeriods[day].zero;
};

const getSeventh = (day) => {
  return extraPeriods[day].seventh;
};

const getExt = (day) => {
  return extraPeriods[day].ext;
};

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
 * Convert the old period format (using period names and nonSchool flag) to the
 * new library format (using tags arrays).
 *
 * - "Period 0" → tags: ['optional', 'zero']
 * - "Period 7" → tags: ['optional', 'seventh']
 * - "Period Ext" → tags: ['optional', 'ext']
 * - nonSchool: true → tags: ['optional', 'nonschool']
 *   (nonschool is always present in includeTags so these periods are always
 *   included by hasPeriod but are trimmed from the ends of actualPeriods)
 */
const adaptPeriods = (periods) => {
  return periods.map((p) => {
    const adapted = { ...p };
    const tags = [];

    if (p.name === 'Period 0') {
      tags.push('optional', 'zero');
    } else if (p.name === 'Period 7') {
      tags.push('optional', 'seventh');
    } else if (p.name === 'Period Ext') {
      tags.push('optional', 'ext');
    } else if (p.nonSchool) {
      tags.push('optional', 'nonschool');
    }

    if (tags.length > 0) {
      adapted.tags = tags;
    }
    delete adapted.nonSchool;
    return adapted;
  });
};

/**
 * Convert the old calendars.json format to what the library expects:
 * - Add timezone
 * - Convert period names/nonSchool to tags
 */
const adaptCalendarData = (data) => {
  const adapted = { ...data, timezone: TIMEZONE };

  const adaptScheduleEntry = (entry) => {
    if (Array.isArray(entry)) {
      return adaptPeriods(entry);
    }
    // It's an object with NORMAL/LATE_START keys
    const result = {};
    for (const [key, val] of Object.entries(entry)) {
      result[key] = Array.isArray(val) ? adaptPeriods(val) : val;
    }
    return result;
  };

  adapted.schedules = {};
  for (const [key, val] of Object.entries(data.schedules)) {
    adapted.schedules[key] = adaptScheduleEntry(val);
  }

  return adapted;
};

const adaptedCalendars = rawCalendars.map(adaptCalendarData);

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
  _bellSchedule = new BellSchedule(adaptedCalendars, { role, includeTags });
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
  getZero,
  getSeventh,
  getExt,
  setZero,
  setSeventh,
  setExt,
  toggleTeacher,
  isTeacher,
};

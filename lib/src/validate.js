/**
 * Validates calendar data objects.
 */

import { parsePlainDate, parsePlainTime } from './datetime.js';

/**
 * Check if a string is a valid IANA timezone identifier.
 * @param {string} tz
 * @returns {boolean}
 */
const isValidTimezone = (tz) => {
  try {
    // Try to use it as a timezone by creating a ZonedDateTime.
    Temporal.Now.instant().toZonedDateTimeISO(tz);
    return true;
  } catch {
    return false;
  }
};

/**
 * Try to parse a date string; return null if invalid.
 * @param {string} str
 * @returns {Temporal.PlainDate | null}
 */
const tryParseDate = (str) => {
  try {
    return parsePlainDate(str);
  } catch {
    return null;
  }
};

/**
 * Validate all time strings in a schedule's period list.
 * Returns an array of error strings.
 * @param {object[]} periods
 * @param {string} scheduleLabel - for error messages
 * @returns {string[]}
 */
const validatePeriodTimes = (periods, scheduleLabel) => {
  const errors = [];
  let lastTime = null;

  for (const p of periods) {
    if (!p.start || !p.end) {
      errors.push(`${scheduleLabel}: period "${p.name}" missing start or end`);
      continue;
    }

    const { time: startTime, ambiguous: startAmbiguous } = parsePlainTime(p.start, lastTime);
    if (startAmbiguous) {
      errors.push(`${scheduleLabel}: period "${p.name}" start time "${p.start}" is ambiguous`);
    }

    const { time: endTime, ambiguous: endAmbiguous } = parsePlainTime(p.end, startTime);
    if (endAmbiguous) {
      errors.push(`${scheduleLabel}: period "${p.name}" end time "${p.end}" is ambiguous`);
    }

    // Check start < end.
    const startMs = startTime.hour * 60 + startTime.minute;
    const endMs = endTime.hour * 60 + endTime.minute;
    if (startMs >= endMs) {
      errors.push(
        `${scheduleLabel}: period "${p.name}" start (${p.start}) is not before end (${p.end})`
      );
    }

    lastTime = endTime;
  }

  return errors;
};

/**
 * Check for overlapping non-optional periods in a schedule.
 * @param {object[]} periods
 * @param {string} scheduleLabel
 * @returns {string[]}
 */
const validateNoOverlap = (periods, scheduleLabel) => {
  const errors = [];

  // Resolve times first (reusing parsePlainTime logic).
  const resolved = [];
  let lastTime = null;
  for (const p of periods) {
    if (!p.start || !p.end) continue;

    const tags = p.tags || [];
    const optional = tags.includes('optional');

    const { time: startTime } = parsePlainTime(p.start, lastTime);
    const { time: endTime } = parsePlainTime(p.end, startTime);
    lastTime = endTime;

    if (!optional) {
      resolved.push({ name: p.name, startTime, endTime });
    }
  }

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      const aStart = a.startTime.hour * 60 + a.startTime.minute;
      const aEnd = a.endTime.hour * 60 + a.endTime.minute;
      const bStart = b.startTime.hour * 60 + b.startTime.minute;
      const bEnd = b.endTime.hour * 60 + b.endTime.minute;
      if (aStart < bEnd && bStart < aEnd) {
        errors.push(
          `${scheduleLabel}: periods "${a.name}" and "${b.name}" overlap`
        );
      }
    }
  }

  return errors;
};

/**
 * Validate a single year data object.
 * @param {object} year
 * @param {number} index - index in the array, for error messages
 * @returns {string[]}
 */
const validateYear = (year, index) => {
  const errors = [];
  const label = `Year ${index} (${year.year || 'unknown'})`;

  // 1. Required fields.
  for (const field of ['year', 'timezone', 'firstDay', 'lastDay', 'schedules']) {
    if (!year[field]) {
      errors.push(`${label}: missing required field "${field}"`);
    }
  }

  if (!year.schedules?.default) {
    errors.push(`${label}: missing schedules.default`);
  } else {
    if (!year.schedules.default.NORMAL) {
      errors.push(`${label}: missing schedules.default.NORMAL`);
    }
    if (!year.schedules.default.LATE_START) {
      errors.push(`${label}: missing schedules.default.LATE_START`);
    }
  }

  // Stop if basic structure is broken.
  if (errors.length > 0) return errors;

  // 2. Timezone validity.
  if (!isValidTimezone(year.timezone)) {
    errors.push(`${label}: "${year.timezone}" is not a valid IANA timezone identifier`);
  }

  // 3. Parse dates.
  const firstDay = tryParseDate(year.firstDay);
  const lastDay = tryParseDate(year.lastDay);

  if (!firstDay) {
    errors.push(`${label}: invalid firstDay "${year.firstDay}"`);
  }
  if (!lastDay) {
    errors.push(`${label}: invalid lastDay "${year.lastDay}"`);
  }

  let rangeStart = firstDay;

  if (year.firstDayTeachers) {
    const firstDayTeachers = tryParseDate(year.firstDayTeachers);
    if (!firstDayTeachers) {
      errors.push(`${label}: invalid firstDayTeachers "${year.firstDayTeachers}"`);
    } else if (firstDay && Temporal.PlainDate.compare(firstDayTeachers, firstDay) > 0) {
      errors.push(`${label}: firstDayTeachers must not be after firstDay`);
    } else {
      rangeStart = firstDayTeachers;
    }
  }

  // 4. Check all dates in schedules keys, holidays, teacherWorkDays, breakNames
  //    fall within [rangeStart, lastDay].
  const inRange = (dateStr) => {
    const d = tryParseDate(dateStr);
    if (!d) return false;
    if (!rangeStart || !lastDay) return true; // can't check without bounds
    return (
      Temporal.PlainDate.compare(d, rangeStart) >= 0 &&
      Temporal.PlainDate.compare(d, lastDay) <= 0
    );
  };

  for (const key of Object.keys(year.schedules)) {
    if (key === 'default') continue;
    if (!tryParseDate(key)) {
      errors.push(`${label}: schedule key "${key}" is not a valid date`);
    } else if (!inRange(key)) {
      errors.push(`${label}: schedule key "${key}" is outside the calendar year range`);
    }
  }

  for (const d of year.holidays || []) {
    if (!inRange(d)) {
      errors.push(`${label}: holiday "${d}" is outside the calendar year range`);
    }
  }

  for (const d of year.teacherWorkDays || []) {
    if (!inRange(d)) {
      errors.push(`${label}: teacherWorkDay "${d}" is outside the calendar year range`);
    }
  }

  for (const key of Object.keys(year.breakNames || {})) {
    if (!inRange(key)) {
      errors.push(`${label}: breakNames key "${key}" is outside the calendar year range`);
    }
  }

  // 5. Validate period times in all schedules.
  const allSchedules = [];

  if (year.schedules.default?.NORMAL) {
    allSchedules.push([year.schedules.default.NORMAL, `${label} schedules.default.NORMAL`]);
  }
  if (year.schedules.default?.LATE_START) {
    allSchedules.push([year.schedules.default.LATE_START, `${label} schedules.default.LATE_START`]);
  }
  for (const [key, periods] of Object.entries(year.schedules)) {
    if (key === 'default') continue;
    if (Array.isArray(periods)) {
      allSchedules.push([periods, `${label} schedules.${key}`]);
    }
  }

  for (const [periods, scheduleLabel] of allSchedules) {
    errors.push(...validatePeriodTimes(periods, scheduleLabel));
    errors.push(...validateNoOverlap(periods, scheduleLabel));
  }

  return errors;
};

/**
 * Validate an array of calendar year data objects.
 * @param {object | object[]} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateCalendarData = (data) => {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data must be an object or array'] };
  }

  const arr = Array.isArray(data) ? data : [data];

  if (arr.length === 0) {
    return { valid: false, errors: ['Data array is empty'] };
  }

  for (let i = 0; i < arr.length; i++) {
    errors.push(...validateYear(arr[i], i));
  }

  return { valid: errors.length === 0, errors };
};

export { validateCalendarData };

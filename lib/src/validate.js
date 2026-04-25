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

    const optional = p.tags?.includes('optional');
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

    // Don't advance lastTime for optional periods — they may run concurrently
    // with the previous period (e.g. Period 7 and Period Ext both at 15:39).
    if (!optional) {
      lastTime = endTime;
    }
  }

  return errors;
};

/**
 * Check for overlapping non-optional periods in a schedule.
 * Student vs student overlaps are errors; teacher vs student overlaps are
 * warnings (teacher schedules run on a separate track from student schedules).
 * @param {object[]} periods
 * @param {string} scheduleLabel
 * @returns {{ errors: string[], warnings: string[] }}
 */
const validateNoOverlap = (periods, scheduleLabel) => {
  const errors = [];
  const warnings = [];

  // Resolve times, separating student and teacher periods.
  const studentPeriods = [];
  const teacherPeriods = [];
  let lastTime = null;
  for (const p of periods) {
    if (!p.start || !p.end) continue;

    const optional = p.tags?.includes('optional');
    const { time: startTime } = parsePlainTime(p.start, lastTime);
    const { time: endTime } = parsePlainTime(p.end, startTime);

    if (!optional) {
      lastTime = endTime;
      const entry = { name: p.name, startTime, endTime };
      if (p.teachers) {
        teacherPeriods.push(entry);
      } else {
        studentPeriods.push(entry);
      }
    }
  }

  const overlaps = (a, b) => {
    const aStart = a.startTime.hour * 60 + a.startTime.minute;
    const aEnd = a.endTime.hour * 60 + a.endTime.minute;
    const bStart = b.startTime.hour * 60 + b.startTime.minute;
    const bEnd = b.endTime.hour * 60 + b.endTime.minute;
    return aStart < bEnd && bStart < aEnd;
  };

  // Student vs student: errors.
  for (let i = 0; i < studentPeriods.length; i++) {
    for (let j = i + 1; j < studentPeriods.length; j++) {
      if (overlaps(studentPeriods[i], studentPeriods[j])) {
        errors.push(
          `${scheduleLabel}: periods "${studentPeriods[i].name}" and "${studentPeriods[j].name}" overlap`
        );
      }
    }
  }

  // Teacher vs student: warnings.
  for (const t of teacherPeriods) {
    for (const s of studentPeriods) {
      if (overlaps(t, s)) {
        warnings.push(
          `${scheduleLabel}: teacher period "${t.name}" overlaps student period "${s.name}"`
        );
      }
    }
  }

  return { errors, warnings };
};

/**
 * Validate a single year data object.
 * @param {object} year
 * @param {number} index - index in the array, for error messages
 * @returns {{ errors: string[], warnings: string[] }}
 */
const validateYear = (year, index) => {
  const errors = [];
  const warnings = [];
  const label = `Year ${index} (${year.year || 'unknown'})`;

  // 1. Required fields.
  for (const field of ['year', 'timezone', 'firstDay', 'lastDay', 'schedules']) {
    if (!year[field]) {
      errors.push(`${label}: missing required field "${field}"`);
    }
  }

  if (year.schedules && typeof year.schedules === 'object') {
    if (!Array.isArray(year.schedules.NORMAL)) {
      errors.push(`${label}: missing schedules.NORMAL`);
    }
    for (const [key, value] of Object.entries(year.schedules)) {
      if (!Array.isArray(value)) {
        errors.push(`${label}: schedules.${key} must be an array of periods`);
      }
    }
  }

  // Stop if basic structure is broken.
  if (errors.length > 0) return { errors, warnings };

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

  const VALID_WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  for (const [day, name] of Object.entries(year.weekdaySchedules || {})) {
    if (!VALID_WEEKDAYS.has(day)) {
      errors.push(`${label}: weekdaySchedules key "${day}" is not a valid weekday name`);
    }
    if (typeof name !== 'string' || !(name in (year.schedules || {}))) {
      errors.push(`${label}: weekdaySchedules.${day} references unknown schedule "${name}"`);
    }
  }

  for (const [key, value] of Object.entries(year.dates || {})) {
    if (!tryParseDate(key)) {
      errors.push(`${label}: dates key "${key}" is not a valid date`);
    } else if (!inRange(key)) {
      errors.push(`${label}: dates key "${key}" is outside the calendar year range`);
    }
    if (typeof value === 'string') {
      if (!(value in (year.schedules || {}))) {
        errors.push(`${label}: dates.${key} references unknown schedule "${value}"`);
      }
    } else if (!Array.isArray(value)) {
      errors.push(`${label}: dates.${key} must be a schedule name or an array of periods`);
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

  for (const [key, periods] of Object.entries(year.schedules || {})) {
    if (Array.isArray(periods)) {
      allSchedules.push([periods, `${label} schedules.${key}`]);
    }
  }
  for (const [key, value] of Object.entries(year.dates || {})) {
    if (Array.isArray(value)) {
      allSchedules.push([value, `${label} dates.${key}`]);
    }
  }

  for (const [periods, scheduleLabel] of allSchedules) {
    errors.push(...validatePeriodTimes(periods, scheduleLabel));
    const overlap = validateNoOverlap(periods, scheduleLabel);
    errors.push(...overlap.errors);
    warnings.push(...overlap.warnings);
  }

  return { errors, warnings };
};

/**
 * Validate an array of calendar year data objects.
 * @param {object | object[]} data
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
const validateCalendarData = (data) => {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data must be an object or array'], warnings: [] };
  }

  const arr = Array.isArray(data) ? data : [data];

  if (arr.length === 0) {
    return { valid: false, errors: ['Data array is empty'], warnings: [] };
  }

  for (let i = 0; i < arr.length; i++) {
    const result = validateYear(arr[i], i);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
};

export { validateCalendarData };

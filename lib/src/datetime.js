/**
 * Pure Temporal utilities for the bells library.
 */

/**
 * Parse a "YYYY-MM-DD" string to a Temporal.PlainDate.
 * @param {string} str
 * @returns {Temporal.PlainDate}
 */
const parsePlainDate = (str) => {
  return Temporal.PlainDate.from(str);
};

/**
 * Parse a time string to a Temporal.PlainTime.
 *
 * Time strings may omit leading 24-hour notation for PM times. E.g. "1:25"
 * means 13:25. The function picks AM or PM such that the result is after
 * `previous`. If hour >= 13 it's unambiguous. If hour is 0-12, tries h+12
 * first (PM) if that's > previous; else tries h (AM).
 *
 * @param {string} str - e.g. "8:30", "1:25", "13:25"
 * @param {Temporal.PlainTime | null} previous - the previously resolved time
 * @returns {{ time: Temporal.PlainTime, ambiguous: boolean }}
 */
const parsePlainTime = (str, previous) => {
  const [h, m] = str.split(':').map(Number);

  if (h >= 13) {
    // Unambiguous 24-hour time.
    return { time: Temporal.PlainTime.from({ hour: h, minute: m }), ambiguous: false };
  }

  const amTime = Temporal.PlainTime.from({ hour: h, minute: m });
  const pmTime = Temporal.PlainTime.from({ hour: h + 12, minute: m });

  if (previous === null) {
    // No previous time — prefer PM if it makes sense (h > 0), else AM.
    // For the first time in a schedule it's usually morning, so prefer AM.
    return { time: amTime, ambiguous: false };
  }

  const prevMs = previous.hour * 60 + previous.minute;
  const amMs = amTime.hour * 60 + amTime.minute;
  const pmMs = pmTime.hour * 60 + pmTime.minute;

  const amAfter = amMs > prevMs;
  const pmAfter = pmMs > prevMs;

  if (pmAfter && !amAfter) {
    // Only PM works.
    return { time: pmTime, ambiguous: false };
  } else if (amAfter && !pmAfter) {
    // Only AM works.
    return { time: amTime, ambiguous: false };
  } else if (amAfter && pmAfter) {
    // Both work — prefer AM (smaller, closer to previous).
    return { time: amTime, ambiguous: true };
  } else {
    // Neither works (both before or equal to previous).
    return { time: amTime, ambiguous: true };
  }
};

/**
 * Resolve all time strings in a raw period array.
 * Returns a new array of periods with `start` and `end` as Temporal.PlainTime.
 *
 * @param {Array<{name: string, start: string, end: string, [key: string]: any}>} periods
 * @returns {Array<{name: string, start: Temporal.PlainTime, end: Temporal.PlainTime, [key: string]: any}>}
 */
const resolveScheduleTimes = (periods) => {
  let lastTime = null;
  const result = [];

  for (const p of periods) {
    const { time: start } = parsePlainTime(p.start, lastTime);
    const { time: end } = parsePlainTime(p.end, start);
    lastTime = end;
    result.push({ ...p, start, end });
  }

  return result;
};

/**
 * Number of calendar days between two Temporal.Instants.
 * Uses noon to avoid DST edge cases.
 *
 * @param {Temporal.Instant} a
 * @param {Temporal.Instant} b
 * @returns {number}
 */
const daysBetween = (a, b) => {
  // Compare as PlainDate in UTC to avoid DST issues.
  const dateA = a.toZonedDateTimeISO('UTC').toPlainDate();
  const dateB = b.toZonedDateTimeISO('UTC').toPlainDate();
  return dateA.until(dateB).days;
};

/**
 * Return a Temporal.PlainDateTime at noon on the given PlainDate.
 *
 * @param {Temporal.PlainDate} date
 * @returns {Temporal.PlainDateTime}
 */
const noon = (date) => {
  return date.toPlainDateTime({ hour: 12, minute: 0, second: 0 });
};

/**
 * Does the span from start to end (exclusive) include a Saturday or Sunday?
 * Both arguments are Temporal.Instant. timezone is an IANA timezone string.
 *
 * @param {Temporal.Instant} start
 * @param {Temporal.Instant} end
 * @param {string} timezone
 * @returns {boolean}
 */
const includesWeekend = (start, end, timezone) => {
  let d = start.toZonedDateTime(timezone).toPlainDate();
  const endDate = end.toZonedDateTime(timezone).toPlainDate();

  while (Temporal.PlainDate.compare(d, endDate) < 0) {
    const dow = d.dayOfWeek; // 1=Mon, 7=Sun
    if (dow === 6 || dow === 7) return true;
    d = d.add({ days: 1 });
  }
  return false;
};

export { parsePlainDate, parsePlainTime, resolveScheduleTimes, daysBetween, noon, includesWeekend };

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
 * Time strings may omit 24-hour notation for PM times. E.g. "1:25" means
 * 13:25. For h = 1–11, both AM (h) and PM (h+12) are candidates; for h = 12,
 * candidates are noon (12) and midnight (0); for h = 0 or >= 13, only one
 * interpretation exists. The candidate that is >= previous and closest to
 * previous is chosen.
 *
 * Examples:
 *   "8:24" after 7:26   → 8:24  (both 8:24 and 20:24 qualify; 8:24 is closer)
 *   "1:25" after 12:27  → 13:25 (1:25 is before 12:27; only PM qualifies)
 *   "12:30" after 11:40 → 12:30 (noon and midnight qualify; noon is closer)
 *   "11:41" after 11:41 → 11:41 (equal counts as valid; AM is the minimum)
 *
 * Returns ambiguous=true only when no candidate is >= previous (data error).
 *
 * @param {string} str - e.g. "8:30", "1:25", "13:25"
 * @param {Temporal.PlainTime | null} previous - the previously resolved time
 * @returns {{ time: Temporal.PlainTime, ambiguous: boolean }}
 */
const parsePlainTime = (str, previous) => {
  const [h, m] = str.split(':').map(Number);

  // h = 0 or >= 13 have exactly one interpretation — return directly.
  if (h === 0 || h >= 13) {
    return { time: Temporal.PlainTime.from({ hour: h, minute: m }), ambiguous: false };
  }

  // h = 1–11: candidates are AM (h) and PM (h+12).
  // h = 12: candidates are noon (12) and midnight (0) — 12-hour clock ambiguity.
  const candidates = h === 12
    ? [
        Temporal.PlainTime.from({ hour: 12, minute: m }),
        Temporal.PlainTime.from({ hour: 0,  minute: m }),
      ]
    : [
        Temporal.PlainTime.from({ hour: h,      minute: m }),
        Temporal.PlainTime.from({ hour: h + 12, minute: m }),
      ];

  if (previous === null) {
    // No previous — return AM (smallest candidate).
    return { time: candidates[0], ambiguous: false };
  }

  const prevMs = previous.hour * 60 + previous.minute;
  const valid = candidates.filter((t) => t.hour * 60 + t.minute >= prevMs);

  if (valid.length > 0) {
    // Pick the minimum valid interpretation (closest to previous).
    const time = valid.reduce((a, b) => (a.hour * 60 + a.minute <= b.hour * 60 + b.minute ? a : b));
    return { time, ambiguous: false };
  }

  // No candidate is >= previous — genuine data error; fall back to AM.
  return { time: candidates[0], ambiguous: true };
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
    const optional = p.tags?.includes('optional');
    const { time: start } = parsePlainTime(p.start, lastTime);
    const { time: end } = parsePlainTime(p.end, start);
    // Don't advance lastTime for optional periods — they may run concurrently
    // with the previous period (e.g. Period 7 and Period Ext both at 15:39).
    if (!optional) {
      lastTime = end;
    }
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
  let d = start.toZonedDateTimeISO(timezone).toPlainDate();
  const endDate = end.toZonedDateTimeISO(timezone).toPlainDate();

  while (Temporal.PlainDate.compare(d, endDate) < 0) {
    const dow = d.dayOfWeek; // 1=Mon, 7=Sun
    if (dow === 6 || dow === 7) return true;
    d = d.add({ days: 1 });
  }
  return false;
};

export { parsePlainDate, parsePlainTime, resolveScheduleTimes, daysBetween, noon, includesWeekend };

import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, formatTime } from '../src/abstract-time.js';
import { BellSchedule } from '../src/bell-schedule.js';
import type { BoundTime } from '../src/abstract-time.js';

const TZ = 'America/Los_Angeles';

// A synthetic year with the interesting calendar shapes: a Monday holiday
// (2025-10-13), a Thu–Fri holiday pair (Thanksgiving), a full vacation week
// (2026-02-16..20), a schedule variant missing period 3 (SHORT), a day with
// no numbered periods at all (ASSEMBLY), and non-numbered periods ("Lunch").
const CALENDAR_DATA = {
  year: '2025-2026',
  timezone: TZ,
  firstDay: '2025-09-02',
  lastDay: '2026-06-12',
  schedules: {
    NORMAL: [
      { name: 'Period 1', start: '8:30', end: '9:30' },
      { name: 'Period 2', start: '9:36', end: '10:36' },
      { name: 'Lunch', start: '10:36', end: '11:06' },
      { name: 'Period 3', start: '11:12', end: '12:12' },
    ],
    SHORT: [
      { name: 'Period 1', start: '8:30', end: '9:15' },
      { name: 'Period 2', start: '9:21', end: '10:06' },
    ],
    FINALS: [
      { name: 'Period 1 Final', start: '8:30', end: '10:00' },
      { name: 'Period 2 Final', start: '10:15', end: '11:45' },
    ],
    ASSEMBLY: [{ name: 'Assembly', start: '9:00', end: '12:00' }],
  },
  dates: {
    '2025-10-31': 'SHORT',
    '2026-01-09': 'ASSEMBLY',
    '2026-06-01': 'FINALS',
  },
  holidays: [
    '2025-10-13', // a Monday
    '2025-11-27', '2025-11-28', // Thu-Fri
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', // vacation week
  ],
};

const pd = (str: string) => Temporal.PlainDate.from(str);

const at = (date: string, hour: number, minute: number) =>
  pd(date).toPlainDateTime({ hour, minute }).toZonedDateTime(TZ).toInstant();

const makeBellSchedule = (opts = {}) => new BellSchedule([CALENDAR_DATA], opts);

const bound = (date: string, anchor: BoundTime['anchor'], offset = '+00:00'): BoundTime => ({
  date,
  anchor,
  offset,
});

// ─── parseTime ───────────────────────────────────────────────────────────────

describe('parseTime', () => {
  it('parses a bare anchor', () => {
    assert.deepStrictEqual(parseTime('start_of_period'), { anchor: 'start_of_period' });
    assert.deepStrictEqual(parseTime('midnight'), { anchor: 'midnight' });
  });

  it('parses a time offset', () => {
    assert.deepStrictEqual(parseTime('end_of_period -00:05'), {
      anchor: 'end_of_period',
      offset: '-00:05',
    });
    assert.deepStrictEqual(parseTime('start_of_day +1:30'), {
      anchor: 'start_of_day',
      offset: '+1:30',
    });
  });

  it('parses school-day offsets', () => {
    assert.deepStrictEqual(parseTime('end_of_day +1 day').day, { type: 'schoolDays', n: 1 });
    assert.deepStrictEqual(parseTime('start_of_day -2 days').day, { type: 'schoolDays', n: -2 });
  });

  it('parses week offsets', () => {
    assert.deepStrictEqual(parseTime('midnight +1 week').day, { type: 'weeks', n: 1 });
    assert.deepStrictEqual(parseTime('midnight -3 weeks').day, { type: 'weeks', n: -3 });
  });

  it('parses weekday names, full and abbreviated', () => {
    assert.deepStrictEqual(parseTime('start_of_period monday').day, { type: 'weekday', weekday: 1 });
    assert.deepStrictEqual(parseTime('midnight sun').day, { type: 'weekday', weekday: 7 });
  });

  it('parses week boundaries', () => {
    assert.deepStrictEqual(parseTime('start_of_day start of week').day, {
      type: 'week', edge: 'start', n: 0,
    });
    assert.deepStrictEqual(parseTime('end_of_day end of week').day, {
      type: 'week', edge: 'end', n: 0,
    });
    assert.deepStrictEqual(parseTime('start_of_day start of next week').day, {
      type: 'week', edge: 'start', n: 1,
    });
    assert.deepStrictEqual(parseTime('end_of_day end of next week').day, {
      type: 'week', edge: 'end', n: 1,
    });
  });

  it("parses 'next week' as an alias for 'start of next week'", () => {
    assert.deepStrictEqual(parseTime('start_of_day next week').day, {
      type: 'week', edge: 'start', n: 1,
    });
  });

  it('parses absolute dates', () => {
    assert.deepStrictEqual(parseTime('start_of_day 2026-01-05').day, {
      type: 'date', date: '2026-01-05',
    });
  });

  it('parses offset and day part together', () => {
    assert.deepStrictEqual(parseTime('end_of_period -00:05 +1 day'), {
      anchor: 'end_of_period',
      offset: '-00:05',
      day: { type: 'schoolDays', n: 1 },
    });
  });

  it('is case-insensitive', () => {
    assert.deepStrictEqual(parseTime('START_OF_DAY MONDAY'), parseTime('start_of_day monday'));
    assert.deepStrictEqual(parseTime('Midnight Start Of Next Week'), parseTime('midnight start of next week'));
  });

  it('throws on an empty spec', () => {
    assert.throws(() => parseTime(''), /Empty/);
    assert.throws(() => parseTime('   '), /Empty/);
  });

  it('throws on an unknown anchor, naming it', () => {
    assert.throws(() => parseTime('start_of_lunch'), /start_of_lunch/);
  });

  it('throws on a malformed offset, naming it', () => {
    assert.throws(() => parseTime('start_of_day +00:99'), /\+00:99/);
  });

  it('throws on unrecognized day parts, naming them', () => {
    assert.throws(() => parseTime('start_of_day someday'), /someday/);
    assert.throws(() => parseTime('start_of_day 1 day'), /1 day/); // sign required
    assert.throws(() => parseTime('start_of_day end of last week'), /end of last week/);
    assert.throws(() => parseTime('start_of_day 2026-13-05'), /2026-13-05/);
  });
});

// ─── formatTime ──────────────────────────────────────────────────────────────

describe('formatTime', () => {
  const canon = (s: string) => formatTime(parseTime(s));

  it('round-trips every grammar form', () => {
    for (const s of [
      'start_of_period',
      'end_of_period -00:05',
      'end_of_day +1 day',
      'start_of_day -2 days',
      'midnight +1 week',
      'start_of_period monday',
      'end_of_day end of week',
      'start_of_day start of next week',
      'start_of_day 2026-01-05',
    ]) {
      assert.strictEqual(canon(s), s);
    }
  });

  it('canonicalizes non-canonical input', () => {
    assert.strictEqual(canon('START_OF_DAY MON'), 'start_of_day monday');
    assert.strictEqual(canon('start_of_day next week'), 'start_of_day start of next week');
    assert.strictEqual(canon('end_of_day +1 days'), 'end_of_day +1 day');
    assert.strictEqual(canon('start_of_day +1:30'), 'start_of_day +01:30');
  });

  it('omits a zero offset, signed or unsigned', () => {
    assert.strictEqual(canon('midnight +00:00'), 'midnight');
    assert.strictEqual(formatTime({ anchor: 'midnight', offset: '00:00' }), 'midnight');
    assert.strictEqual(formatTime({ anchor: 'midnight', offset: '-00:00' }), 'midnight');
  });

  it('throws on values the string syntax cannot express', () => {
    assert.throws(() => formatTime({ anchor: 'midnight', day: { type: 'week', edge: 'start', n: 2 } }), /n=2/);
    assert.throws(() => formatTime({ anchor: 'midnight', day: { type: 'weekday', weekday: 8 } }), /weekday 8/);
  });
});

// ─── resolveDay ──────────────────────────────────────────────────────────────

describe('resolveDay', () => {
  const bs = makeBellSchedule();

  it('returns the base date when the day spec is omitted', () => {
    assert.ok(pd('2025-10-06').equals(bs.resolveDay(pd('2025-10-06'))));
  });

  it('returns absolute dates at face value, even non-school days', () => {
    assert.ok(pd('2025-10-13').equals(bs.resolveDay(pd('2025-10-06'), { type: 'date', date: '2025-10-13' })));
  });

  it('counts school days past weekends and holidays', () => {
    // Fri 10/10 +1: weekend and the 10/13 holiday are skipped → Tue 10/14
    assert.ok(pd('2025-10-14').equals(bs.resolveDay(pd('2025-10-10'), { type: 'schoolDays', n: 1 })));
    assert.ok(pd('2025-10-10').equals(bs.resolveDay(pd('2025-10-14'), { type: 'schoolDays', n: -1 })));
    assert.ok(pd('2025-10-16').equals(bs.resolveDay(pd('2025-10-10'), { type: 'schoolDays', n: 3 })));
  });

  it('counts school days from a non-school base date', () => {
    // Sat 10/11
    assert.ok(pd('2025-10-14').equals(bs.resolveDay(pd('2025-10-11'), { type: 'schoolDays', n: 1 })));
    assert.ok(pd('2025-10-10').equals(bs.resolveDay(pd('2025-10-11'), { type: 'schoolDays', n: -1 })));
  });

  it('returns the base for zero school days', () => {
    assert.ok(pd('2025-10-11').equals(bs.resolveDay(pd('2025-10-11'), { type: 'schoolDays', n: 0 })));
  });

  it('takes week offsets literally, without snapping', () => {
    // Mon 10/06 +1 week lands on the 10/13 holiday and stays there
    assert.ok(pd('2025-10-13').equals(bs.resolveDay(pd('2025-10-06'), { type: 'weeks', n: 1 })));
    assert.ok(pd('2025-10-06').equals(bs.resolveDay(pd('2025-10-13'), { type: 'weeks', n: -1 })));
  });

  it('resolves weekdays strictly after the base, without snapping', () => {
    // 'monday' on a Monday means the following Monday — here a holiday, kept literally
    assert.ok(pd('2025-10-13').equals(bs.resolveDay(pd('2025-10-06'), { type: 'weekday', weekday: 1 })));
    assert.ok(pd('2025-10-10').equals(bs.resolveDay(pd('2025-10-06'), { type: 'weekday', weekday: 5 })));
    // saturday is allowed
    assert.ok(pd('2025-10-11').equals(bs.resolveDay(pd('2025-10-06'), { type: 'weekday', weekday: 6 })));
  });

  it('rejects out-of-range weekdays', () => {
    assert.throws(() => bs.resolveDay(pd('2025-10-06'), { type: 'weekday', weekday: 0 }), /weekday 0/);
  });

  it('snaps start-of-week forward past a Monday holiday', () => {
    // Week of 10/13: Monday is a holiday → Tue 10/14
    assert.ok(pd('2025-10-14').equals(bs.resolveDay(pd('2025-10-06'), { type: 'week', edge: 'start', n: 1 })));
    // n = 0 from mid-week resolves within the base date's own week
    assert.ok(pd('2025-10-14').equals(bs.resolveDay(pd('2025-10-15'), { type: 'week', edge: 'start', n: 0 })));
  });

  it('snaps end-of-week backward past holidays', () => {
    // Week of 11/24: Thu 11/27 and Fri 11/28 are holidays → Wed 11/26
    assert.ok(pd('2025-11-26').equals(bs.resolveDay(pd('2025-11-24'), { type: 'week', edge: 'end', n: 0 })));
    assert.ok(pd('2025-11-26').equals(bs.resolveDay(pd('2025-11-17'), { type: 'week', edge: 'end', n: 1 })));
    // An ordinary week ends on Friday
    assert.ok(pd('2025-10-17').equals(bs.resolveDay(pd('2025-10-15'), { type: 'week', edge: 'end', n: 0 })));
  });

  it('advances start-of-week into the following week when the week is empty', () => {
    // Week of 2/16 is all holidays → first day back is Mon 2/23
    assert.ok(pd('2026-02-23').equals(bs.resolveDay(pd('2026-02-09'), { type: 'week', edge: 'start', n: 1 })));
  });

  it('throws for end-of-week on a week with no school days', () => {
    assert.throws(
      () => bs.resolveDay(pd('2026-02-09'), { type: 'week', edge: 'end', n: 1 }),
      /no school days/,
    );
  });

  it('throws RangeError when resolution runs past the loaded calendars', () => {
    assert.throws(() => bs.resolveDay(pd('2026-06-12'), { type: 'schoolDays', n: 5 }), RangeError);
    assert.throws(() => bs.resolveDay(pd('2025-09-02'), { type: 'schoolDays', n: -1 }), RangeError);
    assert.throws(() => bs.resolveDay(pd('2026-06-12'), { type: 'week', edge: 'start', n: 1 }), RangeError);
  });
});

// ─── addSchoolDays ───────────────────────────────────────────────────────────

describe('addSchoolDays', () => {
  const bs = makeBellSchedule();

  it('returns the date itself for n = 0', () => {
    assert.ok(pd('2025-10-13').equals(bs.addSchoolDays(pd('2025-10-13'), 0)));
  });

  it('counts forward and backward past non-school days', () => {
    assert.ok(pd('2025-10-15').equals(bs.addSchoolDays(pd('2025-10-10'), 2)));
    assert.ok(pd('2025-10-09').equals(bs.addSchoolDays(pd('2025-10-14'), -2)));
  });

  it('rejects non-integer offsets', () => {
    assert.throws(() => bs.addSchoolDays(pd('2025-10-10'), 1.5), /integer/);
  });
});

// ─── bindTime ────────────────────────────────────────────────────────────────

describe('bindTime', () => {
  const bs = makeBellSchedule();

  const collect = () => {
    const warnings: string[] = [];
    return { warnings, onWarning: (w: string) => warnings.push(w) };
  };

  it('binds to the base date with default offset', () => {
    const { warnings, onWarning } = collect();
    const b = bs.bindTime(pd('2025-10-06'), parseTime('start_of_period'), onWarning);
    assert.deepStrictEqual(b, { date: '2025-10-06', anchor: 'start_of_period', offset: '+00:00' });
    assert.deepStrictEqual(warnings, []);
  });

  it('preserves the parsed offset', () => {
    const { onWarning } = collect();
    const b = bs.bindTime(pd('2025-10-06'), parseTime('end_of_period -00:05 +1 day'), onWarning);
    assert.deepStrictEqual(b, { date: '2025-10-07', anchor: 'end_of_period', offset: '-00:05' });
  });

  it('warns when a weekday spec lands a school anchor on a holiday', () => {
    const { warnings, onWarning } = collect();
    const b = bs.bindTime(pd('2025-10-06'), parseTime('start_of_day monday'), onWarning);
    assert.strictEqual(b.date, '2025-10-13');
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /not a school day/);
  });

  it('warns when +1 week lands a school anchor on a holiday', () => {
    const { warnings, onWarning } = collect();
    bs.bindTime(pd('2025-10-06'), parseTime('start_of_day +1 week'), onWarning);
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /not a school day/);
  });

  it('does not warn about midnight on a holiday', () => {
    const { warnings, onWarning } = collect();
    bs.bindTime(pd('2025-10-06'), parseTime('midnight +1 week'), onWarning);
    assert.deepStrictEqual(warnings, []);
  });

  it('does not warn when start-of-week snaps within its week', () => {
    const { warnings, onWarning } = collect();
    const b = bs.bindTime(pd('2025-10-06'), parseTime('start_of_day next week'), onWarning);
    assert.strictEqual(b.date, '2025-10-14');
    assert.deepStrictEqual(warnings, []);
  });

  it('warns when start-of-week advances past an empty week', () => {
    const { warnings, onWarning } = collect();
    const b = bs.bindTime(pd('2026-02-09'), parseTime('start_of_day next week'), onWarning);
    assert.strictEqual(b.date, '2026-02-23');
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /advanced/);
  });

  it('rejects malformed offsets at bind time', () => {
    assert.throws(
      () => bs.bindTime(pd('2025-10-06'), { anchor: 'midnight', offset: '0:5' }, () => {}),
      /0:5/,
    );
  });
});

// ─── timeWarnings ────────────────────────────────────────────────────────────

describe('timeWarnings', () => {
  const bs = makeBellSchedule();

  it('never warns about midnight', () => {
    assert.deepStrictEqual(bs.timeWarnings(bound('2025-10-13', 'midnight')), []);
  });

  it('warns about school anchors on non-school days', () => {
    for (const anchor of ['start_of_period', 'end_of_period', 'start_of_day', 'end_of_day'] as const) {
      const ws = bs.timeWarnings(bound('2025-10-13', anchor));
      assert.strictEqual(ws.length, 1);
      assert.match(ws[0], /not a school day/);
    }
  });

  it('warns about period anchors on a day with no numbered periods', () => {
    const ws = bs.timeWarnings(bound('2026-01-09', 'start_of_period'));
    assert.strictEqual(ws.length, 1);
    assert.match(ws[0], /no numbered periods/);
  });

  it('does not warn about day anchors on a day with no numbered periods', () => {
    assert.deepStrictEqual(bs.timeWarnings(bound('2026-01-09', 'start_of_day')), []);
  });

  it('returns empty for sensible specs', () => {
    assert.deepStrictEqual(bs.timeWarnings(bound('2025-10-14', 'start_of_period')), []);
  });

  it('accepts unsigned offsets', () => {
    assert.deepStrictEqual(bs.timeWarnings(bound('2025-10-14', 'start_of_period', '00:00')), []);
  });
});

// ─── resolveTime ─────────────────────────────────────────────────────────────

describe('resolveTime', () => {
  const bs = makeBellSchedule();

  it('resolves midnight on any date, school day or not', () => {
    const z = bs.resolveTime(bound('2025-10-13', 'midnight'));
    assert.ok(z);
    assert.ok(z.toInstant().equals(at('2025-10-13', 0, 0)));
  });

  it('resolves start and end of day to the day’s period boundaries', () => {
    const start = bs.resolveTime(bound('2025-09-02', 'start_of_day'));
    const end = bs.resolveTime(bound('2025-09-02', 'end_of_day'));
    assert.ok(start && start.toInstant().equals(at('2025-09-02', 8, 30)));
    assert.ok(end && end.toInstant().equals(at('2025-09-02', 12, 12)));
  });

  it('returns null for day anchors on non-school days', () => {
    assert.strictEqual(bs.resolveTime(bound('2025-10-13', 'start_of_day')), null);
    assert.strictEqual(bs.resolveTime(bound('2025-10-11', 'end_of_day')), null);
  });

  it('resolves period anchors with the supplied period', () => {
    const start = bs.resolveTime(bound('2025-09-02', 'start_of_period'), 2);
    const end = bs.resolveTime(bound('2025-09-02', 'end_of_period'), 2);
    assert.ok(start && start.toInstant().equals(at('2025-09-02', 9, 36)));
    assert.ok(end && end.toInstant().equals(at('2025-09-02', 10, 36)));
  });

  it('applies the offset', () => {
    const z = bs.resolveTime(bound('2025-09-02', 'end_of_period', '-00:05'), 1);
    assert.ok(z && z.toInstant().equals(at('2025-09-02', 9, 25)));
  });

  it('accepts unsigned offsets', () => {
    const z = bs.resolveTime(bound('2025-09-02', 'start_of_period', '00:00'), 1);
    assert.ok(z && z.toInstant().equals(at('2025-09-02', 8, 30)));
  });

  it('returns null when the period is omitted for a period anchor', () => {
    assert.strictEqual(bs.resolveTime(bound('2025-09-02', 'start_of_period')), null);
  });

  it('returns null when the date has no such period', () => {
    // 2025-10-31 runs the SHORT schedule: periods 1–2 only
    assert.strictEqual(bs.resolveTime(bound('2025-10-31', 'start_of_period'), 3), null);
    const p1 = bs.resolveTime(bound('2025-10-31', 'start_of_period'), 1);
    assert.ok(p1 && p1.toInstant().equals(at('2025-10-31', 8, 30)));
  });

  it('applies offsets with timezone-aware arithmetic across DST', () => {
    // Fall-back is 2025-11-02 at 2:00. Midnight +4h elapsed = 3:00 PST,
    // not the 4:00 that plain clock arithmetic would give.
    const z = bs.resolveTime(bound('2025-11-02', 'midnight', '+04:00'));
    assert.ok(z);
    assert.strictEqual(z.hour, 3);
    assert.strictEqual(z.offset, '-08:00');
  });

  it('rejects malformed offsets', () => {
    assert.throws(() => bs.resolveTime(bound('2025-09-02', 'midnight', 'bogus')), /bogus/);
  });
});

// ─── periodOnDate ────────────────────────────────────────────────────────────

describe('periodOnDate', () => {
  const bs = makeBellSchedule();

  it('finds numbered periods by the default matcher', () => {
    const p = bs.periodOnDate(pd('2025-09-02'), 2);
    assert.ok(p);
    assert.strictEqual(p.name, 'Period 2');
    assert.ok(p.start.equals(at('2025-09-02', 9, 36)));
  });

  it("matches 'Period 1 Final' as period 1", () => {
    const p = bs.periodOnDate(pd('2026-06-01'), 1);
    assert.ok(p);
    assert.strictEqual(p.name, 'Period 1 Final');
  });

  it('returns null for a period that does not meet, or non-school days', () => {
    assert.strictEqual(bs.periodOnDate(pd('2025-10-31'), 3), null);
    assert.strictEqual(bs.periodOnDate(pd('2025-10-13'), 1), null);
  });

  it('uses a custom periodNumber matcher when supplied', () => {
    const custom = makeBellSchedule({
      periodNumber: (p: { name: string }) => (p.name === 'Lunch' ? 0 : null),
    });
    const p = custom.periodOnDate(pd('2025-09-02'), 0);
    assert.ok(p);
    assert.strictEqual(p.name, 'Lunch');
    assert.strictEqual(custom.periodOnDate(pd('2025-09-02'), 1), null);
  });
});

// ─── currentOrNextPeriodNumber ───────────────────────────────────────────────

describe('currentOrNextPeriodNumber', () => {
  const bs = makeBellSchedule();

  it('returns the containing period’s number', () => {
    assert.strictEqual(bs.currentOrNextPeriodNumber(at('2025-09-03', 10, 0)), 2);
  });

  it('skips non-numbered periods to the next numbered one', () => {
    // During Lunch
    assert.strictEqual(bs.currentOrNextPeriodNumber(at('2025-09-03', 10, 50)), 3);
  });

  it('returns the first period before school', () => {
    assert.strictEqual(bs.currentOrNextPeriodNumber(at('2025-09-03', 7, 0)), 1);
  });

  it('returns null after the last period', () => {
    assert.strictEqual(bs.currentOrNextPeriodNumber(at('2025-09-03', 13, 0)), null);
  });

  it('returns null on non-school days', () => {
    assert.strictEqual(bs.currentOrNextPeriodNumber(at('2025-10-13', 10, 0)), null);
  });
});

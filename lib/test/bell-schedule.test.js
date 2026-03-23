import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BellSchedule } from '../src/bell-schedule.js';

const CALENDAR_DATA = {
  year: '2025-2026',
  timezone: 'America/Los_Angeles',
  firstDay: '2025-08-13',
  lastDay: '2026-06-04',
  schedules: {
    default: {
      NORMAL: [
        { name: 'Period 1', start: '8:30', end: '9:28' },
        { name: 'Period 2', start: '9:34', end: '10:37' },
      ],
      LATE_START: [
        { name: 'Period 1', start: '10:00', end: '10:43' },
        { name: 'Period 2', start: '10:49', end: '11:37' },
      ],
    },
  },
  holidays: ['2025-09-01', '2025-11-27', '2025-11-28'],
  teacherWorkDays: [],
  breakNames: {},
};

const pd = (str) => Temporal.PlainDate.from(str);

const makeBellSchedule = (opts = {}) =>
  new BellSchedule([CALENDAR_DATA], { role: 'student', includeTags: {}, ...opts });

// ─── nextSchoolDay ────────────────────────────────────────────────────────────

describe('nextSchoolDay', () => {
  it('skips weekend days', () => {
    const bs = makeBellSchedule();
    // 2025-08-15 is Friday → next school day is Monday 2025-08-18
    assert.ok(pd('2025-08-18').equals(bs.nextSchoolDay(pd('2025-08-15'))));
  });

  it('skips holidays', () => {
    const bs = makeBellSchedule();
    // 2025-08-29 is Friday, 2025-09-01 is Labor Day holiday → next is 2025-09-02
    assert.ok(pd('2025-09-02').equals(bs.nextSchoolDay(pd('2025-08-29'))));
  });

  it('skips consecutive holidays and weekends', () => {
    const bs = makeBellSchedule();
    // 2025-11-26 is Wednesday, 11/27 and 11/28 are holidays, 11/29-30 weekend → next is 12/01
    assert.ok(pd('2025-12-01').equals(bs.nextSchoolDay(pd('2025-11-26'))));
  });

  it('returns next weekday from a Saturday', () => {
    const bs = makeBellSchedule();
    // 2025-08-16 is Saturday → Monday 2025-08-18
    assert.ok(pd('2025-08-18').equals(bs.nextSchoolDay(pd('2025-08-16'))));
  });
});

// ─── previousSchoolDay ────────────────────────────────────────────────────────

describe('previousSchoolDay', () => {
  it('skips weekend days', () => {
    const bs = makeBellSchedule();
    // 2025-08-18 is Monday → previous school day is Friday 2025-08-15
    assert.ok(pd('2025-08-15').equals(bs.previousSchoolDay(pd('2025-08-18'))));
  });

  it('skips holidays', () => {
    const bs = makeBellSchedule();
    // 2025-09-02 is Tuesday, 2025-09-01 is Labor Day → previous is 2025-08-29
    assert.ok(pd('2025-08-29').equals(bs.previousSchoolDay(pd('2025-09-02'))));
  });

  it('skips consecutive holidays and weekends', () => {
    const bs = makeBellSchedule();
    // 2025-12-01 is Monday, 11/29-30 weekend, 11/27-28 holidays → previous is 11/26
    assert.ok(pd('2025-11-26').equals(bs.previousSchoolDay(pd('2025-12-01'))));
  });
});

// ─── scheduleFor ──────────────────────────────────────────────────────────────

describe('scheduleFor', () => {
  it('returns periods for a normal school day', () => {
    const bs = makeBellSchedule();
    // 2025-08-13 is Wednesday (first day of school)
    const periods = bs.scheduleFor(pd('2025-08-13'));
    assert.strictEqual(periods.length, 2);
    assert.strictEqual(periods[0].name, 'Period 1');
    assert.strictEqual(periods[1].name, 'Period 2');
  });

  it('returns late start schedule for Monday', () => {
    const bs = makeBellSchedule();
    // 2025-08-18 is Monday
    const periods = bs.scheduleFor(pd('2025-08-18'));
    assert.strictEqual(periods.length, 2);
    assert.strictEqual(periods[0].name, 'Period 1');
    // Late start Period 1 starts at 10:00
    const startTime = periods[0].start.toZonedDateTimeISO('America/Los_Angeles');
    assert.strictEqual(startTime.hour, 10);
    assert.strictEqual(startTime.minute, 0);
  });

  it('returns empty array for a holiday', () => {
    const bs = makeBellSchedule();
    assert.deepStrictEqual(bs.scheduleFor(pd('2025-09-01')), []);
  });

  it('returns empty array for a weekend', () => {
    const bs = makeBellSchedule();
    assert.deepStrictEqual(bs.scheduleFor(pd('2025-08-16')), []);
  });

  it('returns empty array for a date outside calendar range', () => {
    const bs = makeBellSchedule();
    assert.deepStrictEqual(bs.scheduleFor(pd('2024-01-01')), []);
  });

  it('each period has name, start, end, tags', () => {
    const bs = makeBellSchedule();
    const periods = bs.scheduleFor(pd('2025-08-13'));
    for (const p of periods) {
      assert.ok('name' in p);
      assert.ok('start' in p);
      assert.ok('end' in p);
      assert.ok('tags' in p);
    }
  });
});

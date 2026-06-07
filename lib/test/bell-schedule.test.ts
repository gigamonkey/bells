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
    NORMAL: [
      { name: 'Period 1', start: '8:30', end: '9:28' },
      { name: 'Period 2', start: '9:34', end: '10:37' },
    ],
    LATE_START: [
      { name: 'Period 1', start: '10:00', end: '10:43' },
      { name: 'Period 2', start: '10:49', end: '11:37' },
    ],
  },
  weekdaySchedules: { monday: 'LATE_START' },
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

// ─── schoolDaysBetween ───────────────────────────────────────────────────────

describe('schoolDaysBetween', () => {
  it('counts school days inclusive of both endpoints', () => {
    const bs = makeBellSchedule();
    // Mon 2025-08-18 to Fri 2025-08-22: Mon, Tue, Wed, Thu, Fri = 5
    assert.strictEqual(bs.schoolDaysBetween(pd('2025-08-18'), pd('2025-08-22')), 5);
  });

  it('returns 1 for a single school day', () => {
    const bs = makeBellSchedule();
    assert.strictEqual(bs.schoolDaysBetween(pd('2025-08-13'), pd('2025-08-13')), 1);
  });

  it('returns 0 for a single non-school day', () => {
    const bs = makeBellSchedule();
    // 2025-08-16 is Saturday
    assert.strictEqual(bs.schoolDaysBetween(pd('2025-08-16'), pd('2025-08-16')), 0);
  });

  it('counts adjacent school days as 2', () => {
    const bs = makeBellSchedule();
    // Wed 2025-08-13 and Thu 2025-08-14
    assert.strictEqual(bs.schoolDaysBetween(pd('2025-08-13'), pd('2025-08-14')), 2);
  });

  it('excludes holidays', () => {
    const bs = makeBellSchedule();
    // Fri 2025-08-29 to Wed 2025-09-03: Fri, (Sat, Sun skip), Mon 09/01 holiday, Tue, Wed = 3
    assert.strictEqual(bs.schoolDaysBetween(pd('2025-08-29'), pd('2025-09-03')), 3);
  });

  it('excludes weekends', () => {
    const bs = makeBellSchedule();
    // Fri 2025-08-15 to Mon 2025-08-18: Fri + Mon = 2
    assert.strictEqual(bs.schoolDaysBetween(pd('2025-08-15'), pd('2025-08-18')), 2);
  });

  it('counts a full week correctly', () => {
    const bs = makeBellSchedule();
    // Mon 2025-08-18 to Mon 2025-08-25: Mon-Fri + Mon = 6 school days
    assert.strictEqual(bs.schoolDaysBetween(pd('2025-08-18'), pd('2025-08-25')), 6);
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

// ─── nonClassDays ─────────────────────────────────────────────────────────────

describe('nonClassDays', () => {
  const NON_CLASS_DATA = {
    ...CALENDAR_DATA,
    dates: {
      '2026-06-01': 'NORMAL',
      '2026-06-04': 'NORMAL',
    },
    nonClassDays: {
      '2026-06-01': 'exam',
      '2026-06-04': 'bonus',
    },
  };

  const make = () =>
    new BellSchedule([NON_CLASS_DATA], { role: 'student', includeTags: {} });

  it('nonClassLabel returns label for a listed date', () => {
    assert.strictEqual(make().nonClassLabel(pd('2026-06-01')), 'exam');
    assert.strictEqual(make().nonClassLabel(pd('2026-06-04')), 'bonus');
  });

  it('nonClassLabel returns null for an unlisted date', () => {
    assert.strictEqual(make().nonClassLabel(pd('2025-08-19')), null);
  });

  it('nonClassDaysLeft returns entries from the active calendar', () => {
    const instant = Temporal.PlainDateTime.from('2026-05-15T08:00:00')
      .toZonedDateTime('America/Los_Angeles')
      .toInstant();
    const list = make().nonClassDaysLeft(instant);
    assert.strictEqual(list.length, 2);
  });

  it('nonClassDaysLeft returns [] outside any calendar', () => {
    const instant = Temporal.PlainDateTime.from('2030-01-01T08:00:00')
      .toZonedDateTime('America/Los_Angeles')
      .toInstant();
    assert.deepStrictEqual(make().nonClassDaysLeft(instant), []);
  });
});

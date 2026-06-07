import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Calendar, Schedule, Period, Interval, normalizeIncludeTags } from '../src/calendar.js';
import { resolveScheduleTimes } from '../src/datetime.js';

// ─── Shared fixture ───────────────────────────────────────────────────────────

const CALENDAR_DATA = {
  year: '2025-2026',
  timezone: 'America/Los_Angeles',
  firstDay: '2025-08-13',
  firstDayTeachers: '2025-08-11',
  lastDay: '2026-06-04',
  schedules: {
    NORMAL: [
      { name: 'Period 0',   start: '7:26',  end: '8:24',  tags: ['optional', 'zero'] },
      { name: 'Period 1',   start: '8:30',  end: '9:28' },
      { name: 'Period 2',   start: '9:34',  end: '10:37' },
      { name: 'Period 3',   start: '10:43', end: '11:41' },
      { name: 'Lunch',      start: '11:42', end: '12:22' },
      { name: 'Period 4',   start: '12:27', end: '13:25' },
      { name: 'Period 5',   start: '13:31', end: '14:29' },
      { name: 'Period 6',   start: '14:35', end: '15:33' },
      { name: 'Period 7',   start: '15:39', end: '16:37', tags: ['optional', 'seventh'] },
      { name: 'Period Ext', start: '15:39', end: '17:09', tags: ['optional', 'ext'] },
    ],
    LATE_START: [
      { name: 'Staff meeting', start: '8:03', end: '9:33', teachers: true },
      { name: 'Period 1',   start: '10:00', end: '10:43' },
      { name: 'Period 2',   start: '10:49', end: '11:37' },
      { name: 'Period 3',   start: '11:43', end: '12:26' },
      { name: 'Lunch',      start: '12:26', end: '13:06' },
      { name: 'Period 4',   start: '13:12', end: '13:55' },
      { name: 'Period 5',   start: '14:01', end: '14:44' },
      { name: 'Period 6',   start: '14:50', end: '15:33' },
    ],
  },
  weekdaySchedules: { monday: 'LATE_START' },
  holidays: ['2025-09-01', '2025-11-27'],
  teacherWorkDays: [],
  breakNames: {
    '2025-11-26': 'Thanksgiving Break',
  },
};

// Helper: Temporal.Instant from a local datetime string in America/Los_Angeles
const laInstant = (isoLocal) =>
  Temporal.PlainDateTime.from(isoLocal)
    .toZonedDateTime('America/Los_Angeles')
    .toInstant();

// Helper: Temporal.PlainDate
const pd = (str) => Temporal.PlainDate.from(str);

// Default (student, no optional periods) calendar
const makeCalendar = (opts = {}) =>
  new Calendar(CALENDAR_DATA, { role: 'student', includeTags: {}, ...opts });

// ─── normalizeIncludeTags ─────────────────────────────────────────────────────

describe('normalizeIncludeTags', () => {
  it('flat array → map with same array for days 1–5', () => {
    const tags = ['zero', 'seventh'];
    const result = normalizeIncludeTags(tags);
    assert.deepStrictEqual(result[1], tags);
    assert.deepStrictEqual(result[2], tags);
    assert.deepStrictEqual(result[3], tags);
    assert.deepStrictEqual(result[4], tags);
    assert.deepStrictEqual(result[5], tags);
  });

  it('flat array → no entries for days 6 and 7', () => {
    const result = normalizeIncludeTags(['zero']);
    assert.strictEqual(result[6], undefined);
    assert.strictEqual(result[7], undefined);
  });

  it('map input → returned as-is', () => {
    const map = { 1: ['zero'], 3: ['seventh'] };
    const result = normalizeIncludeTags(map);
    assert.deepStrictEqual(result, map);
  });

  it('undefined → empty object', () => {
    assert.deepStrictEqual(normalizeIncludeTags(undefined), {});
  });

  it('null → empty object', () => {
    assert.deepStrictEqual(normalizeIncludeTags(null), {});
  });
});

// ─── Calendar: basic queries ──────────────────────────────────────────────────

describe('Calendar', () => {
  describe('isSchoolDay', () => {
    it('a Wednesday in term → true', () => {
      // 2025-08-13 is a Wednesday (firstDay)
      const cal = makeCalendar();
      assert.strictEqual(cal.isSchoolDay(pd('2025-08-13')), true);
    });

    it('a Saturday → false', () => {
      const cal = makeCalendar();
      assert.strictEqual(cal.isSchoolDay(pd('2025-08-16')), false);
    });

    it('a Sunday → false', () => {
      const cal = makeCalendar();
      assert.strictEqual(cal.isSchoolDay(pd('2025-08-17')), false);
    });

    it('a holiday (Labor Day 2025-09-01) → false', () => {
      const cal = makeCalendar();
      assert.strictEqual(cal.isSchoolDay(pd('2025-09-01')), false);
    });
  });

  describe('isHoliday', () => {
    it('a listed holiday → true', () => {
      const cal = makeCalendar();
      assert.strictEqual(cal.isHoliday(pd('2025-09-01')), true);
    });

    it('a non-holiday weekday → false', () => {
      const cal = makeCalendar();
      assert.strictEqual(cal.isHoliday(pd('2025-08-13')), false);
    });

    it('a teacher work day for role=teacher → false (they work that day)', () => {
      const dataWithWorkDay = {
        ...CALENDAR_DATA,
        holidays: ['2025-09-01'],
        teacherWorkDays: ['2025-09-01'],
      };
      const cal = new Calendar(dataWithWorkDay, { role: 'teacher', includeTags: {} });
      assert.strictEqual(cal.isHoliday(pd('2025-09-01')), false);
    });

    it('a teacher work day for role=student → still a holiday', () => {
      const dataWithWorkDay = {
        ...CALENDAR_DATA,
        holidays: ['2025-09-01'],
        teacherWorkDays: ['2025-09-01'],
      };
      const cal = new Calendar(dataWithWorkDay, { role: 'student', includeTags: {} });
      assert.strictEqual(cal.isHoliday(pd('2025-09-01')), true);
    });
  });

  describe('schedule(date)', () => {
    it('Monday → LATE_START schedule (first period is Period 1 at 10:00)', () => {
      const cal = makeCalendar();
      // 2025-08-18 is a Monday
      const sched = cal.schedule(pd('2025-08-18'));
      const first = sched.firstPeriod();
      assert.strictEqual(first.name, 'Period 1');
      assert.strictEqual(first.start.hour, 10);
      assert.strictEqual(first.start.minute, 0);
    });

    it('Tuesday → NORMAL schedule (first period is Period 1 at 8:30)', () => {
      const cal = makeCalendar();
      // 2025-08-19 is a Tuesday
      const sched = cal.schedule(pd('2025-08-19'));
      const first = sched.firstPeriod();
      assert.strictEqual(first.name, 'Period 1');
      assert.strictEqual(first.start.hour, 8);
      assert.strictEqual(first.start.minute, 30);
    });

    it('specific date override (inline array) uses that schedule', () => {
      const overrideData = {
        ...CALENDAR_DATA,
        dates: {
          '2025-08-19': [
            { name: 'Assembly', start: '9:00', end: '10:00' },
          ],
        },
      };
      const cal = new Calendar(overrideData, { role: 'student', includeTags: {} });
      const sched = cal.schedule(pd('2025-08-19'));
      const first = sched.firstPeriod();
      assert.strictEqual(first.name, 'Assembly');
    });

    it('specific date override (named schedule) uses that named schedule', () => {
      const overrideData = {
        ...CALENDAR_DATA,
        schedules: {
          ...CALENDAR_DATA.schedules,
          ASSEMBLY: [{ name: 'Assembly', start: '9:00', end: '10:00' }],
        },
        dates: { '2025-08-19': 'ASSEMBLY' },
      };
      const cal = new Calendar(overrideData, { role: 'student', includeTags: {} });
      const sched = cal.schedule(pd('2025-08-19'));
      assert.strictEqual(sched.firstPeriod().name, 'Assembly');
    });

    it('without weekdaySchedules, Monday falls back to NORMAL', () => {
      const data = { ...CALENDAR_DATA, weekdaySchedules: {} };
      const cal = new Calendar(data, { role: 'student', includeTags: {} });
      const sched = cal.schedule(pd('2025-08-18')); // Monday
      const first = sched.firstPeriod();
      assert.strictEqual(first.start.hour, 8);
      assert.strictEqual(first.start.minute, 30);
    });

    it('custom weekdaySchedules mapping for Wednesday', () => {
      const data = {
        ...CALENDAR_DATA,
        schedules: {
          ...CALENDAR_DATA.schedules,
          ASSEMBLY: [{ name: 'Assembly', start: '9:00', end: '10:00' }],
        },
        weekdaySchedules: { wednesday: 'ASSEMBLY' },
      };
      const cal = new Calendar(data, { role: 'student', includeTags: {} });
      const sched = cal.schedule(pd('2025-08-20')); // Wednesday
      assert.strictEqual(sched.firstPeriod().name, 'Assembly');
    });
  });

  describe('startOfYear / endOfYear', () => {
    it('startOfYear returns an Instant', () => {
      const cal = makeCalendar();
      assert.ok(cal.startOfYear() instanceof Temporal.Instant);
    });

    it('startOfYear is on firstDay at 8:30 LA time (Period 1 start, no Period 0 included)', () => {
      const cal = makeCalendar();
      const soy = cal.startOfYear();
      const zdt = soy.toZonedDateTimeISO('America/Los_Angeles');
      assert.strictEqual(zdt.toPlainDate().toString(), '2025-08-13');
      assert.strictEqual(zdt.hour, 8);
      assert.strictEqual(zdt.minute, 30);
    });

    it('endOfYear returns an Instant', () => {
      const cal = makeCalendar();
      assert.ok(cal.endOfYear() instanceof Temporal.Instant);
    });

    it('endOfYear is on lastDay (2026-06-04) at 15:33 LA time (Period 6 end, no Period 7/Ext included)', () => {
      const cal = makeCalendar();
      const eoy = cal.endOfYear();
      const zdt = eoy.toZonedDateTimeISO('America/Los_Angeles');
      assert.strictEqual(zdt.toPlainDate().toString(), '2026-06-04');
      // 2026-06-04 is a Thursday → NORMAL schedule, last non-optional period is Period 6 ending 15:33
      assert.strictEqual(zdt.hour, 15);
      assert.strictEqual(zdt.minute, 33);
    });

    it('teacher role: startOfYear is on firstDayTeachers', () => {
      const cal = new Calendar(CALENDAR_DATA, { role: 'teacher', includeTags: {} });
      const soy = cal.startOfYear();
      const zdt = soy.toZonedDateTimeISO('America/Los_Angeles');
      // 2025-08-11 is a Monday → LATE_START; Staff meeting (teachers only) starts 8:03
      assert.strictEqual(zdt.toPlainDate().toString(), '2025-08-11');
      assert.strictEqual(zdt.hour, 8);
      assert.strictEqual(zdt.minute, 3);
    });
  });
});

// ─── Schedule.hasPeriod ───────────────────────────────────────────────────────

describe('Schedule.hasPeriod', () => {
  // Build a Schedule directly for a Tuesday (normal day), student role
  const makeSched = (calOpts = {}, date = pd('2025-08-19')) => {
    const cal = new Calendar(CALENDAR_DATA, { role: 'student', includeTags: {}, ...calOpts });
    return cal.schedule(date);
  };

  it('period with no tags → always included', () => {
    const sched = makeSched();
    const p = new Period('Period 1', Temporal.PlainTime.from('08:30'), Temporal.PlainTime.from('09:28'), [], false);
    assert.strictEqual(sched.hasPeriod(p), true);
  });

  it('period with [optional, zero] and includeTags has "zero" for that day → included', () => {
    // Tuesday is dayOfWeek=2
    const sched = makeSched({ includeTags: { 2: ['zero'] } });
    const p = new Period('Period 0', Temporal.PlainTime.from('07:26'), Temporal.PlainTime.from('08:24'), ['optional', 'zero'], false);
    assert.strictEqual(sched.hasPeriod(p), true);
  });

  it('period with [optional, zero] and includeTags does NOT have "zero" → excluded', () => {
    const sched = makeSched({ includeTags: {} });
    const p = new Period('Period 0', Temporal.PlainTime.from('07:26'), Temporal.PlainTime.from('08:24'), ['optional', 'zero'], false);
    assert.strictEqual(sched.hasPeriod(p), false);
  });

  it('period with [optional] only → always excluded', () => {
    const sched = makeSched({ includeTags: { 2: ['zero', 'seventh', 'ext', 'optional'] } });
    const p = new Period('Lunch-extra', Temporal.PlainTime.from('12:00'), Temporal.PlainTime.from('12:30'), ['optional'], false);
    assert.strictEqual(sched.hasPeriod(p), false);
  });

  it('period with teachers=true and role=teacher → included', () => {
    const sched = makeSched({ role: 'teacher' });
    const p = new Period('Staff meeting', Temporal.PlainTime.from('08:03'), Temporal.PlainTime.from('09:33'), [], true);
    assert.strictEqual(sched.hasPeriod(p), true);
  });

  it('period with teachers=true and role=student → excluded', () => {
    const sched = makeSched({ role: 'student' });
    const p = new Period('Staff meeting', Temporal.PlainTime.from('08:03'), Temporal.PlainTime.from('09:33'), [], true);
    assert.strictEqual(sched.hasPeriod(p), false);
  });
});

// ─── Schedule.actualPeriods ───────────────────────────────────────────────────

describe('Schedule.actualPeriods', () => {
  it('student with no includeTags: Period 0, 7, Ext excluded', () => {
    const cal = makeCalendar();
    // 2025-08-19 is a Tuesday → NORMAL
    const sched = cal.schedule(pd('2025-08-19'));
    const names = sched.actualPeriods().map((p) => p.name);
    assert.ok(!names.includes('Period 0'), 'Period 0 should be excluded');
    assert.ok(!names.includes('Period 7'), 'Period 7 should be excluded');
    assert.ok(!names.includes('Period Ext'), 'Period Ext should be excluded');
  });

  it('student with no includeTags: mandatory periods are included', () => {
    const cal = makeCalendar();
    const sched = cal.schedule(pd('2025-08-19'));
    const names = sched.actualPeriods().map((p) => p.name);
    assert.ok(names.includes('Period 1'));
    assert.ok(names.includes('Period 2'));
    assert.ok(names.includes('Period 3'));
    assert.ok(names.includes('Lunch'));
    assert.ok(names.includes('Period 4'));
    assert.ok(names.includes('Period 5'));
    assert.ok(names.includes('Period 6'));
  });

  it('student with includeTags { 2: ["zero"] }: Period 0 is included in actualPeriods on Tuesday', () => {
    const cal = makeCalendar({ includeTags: { 2: ['zero'] } });
    const sched = cal.schedule(pd('2025-08-19'));
    const names = sched.actualPeriods().map((p) => p.name);
    assert.ok(names.includes('Period 0'), 'Period 0 should be in actualPeriods when "zero" is in includeTags');
  });

  it('student with includeTags { 2: ["seventh"] }: Period 7 passes hasPeriod, Period Ext does not', () => {
    const cal = makeCalendar({ includeTags: { 2: ['seventh'] } });
    const sched = cal.schedule(pd('2025-08-19'));
    const p7 = sched.rawPeriods.find((p) => p.name === 'Period 7');
    const pExt = sched.rawPeriods.find((p) => p.name === 'Period Ext');
    assert.ok(sched.hasPeriod(p7), 'Period 7 should pass hasPeriod when "seventh" is in includeTags');
    assert.ok(!sched.hasPeriod(pExt), 'Period Ext should not pass hasPeriod without "ext" in includeTags');
  });

  it('first period is Period 1 when no optional periods included', () => {
    const cal = makeCalendar();
    const sched = cal.schedule(pd('2025-08-19'));
    assert.strictEqual(sched.firstPeriod().name, 'Period 1');
  });

  it('last period is Period 6 when no optional periods included', () => {
    const cal = makeCalendar();
    const sched = cal.schedule(pd('2025-08-19'));
    assert.strictEqual(sched.lastPeriod().name, 'Period 6');
  });
});

// ─── Schedule.currentInterval ─────────────────────────────────────────────────

describe('Schedule.currentInterval', () => {
  // 2025-08-19 is a Tuesday (NORMAL schedule)
  const TUE = '2025-08-19';

  it('during Period 1 (08:45) → type=period, name=Period 1, duringSchool=true', () => {
    const cal = makeCalendar();
    const interval = cal.currentInterval(laInstant(`${TUE}T08:45:00`));
    assert.strictEqual(interval.type, 'period');
    assert.strictEqual(interval.name, 'Period 1');
    assert.strictEqual(interval.duringSchool, true);
  });

  it('during Period 3 (11:00) → type=period, name=Period 3', () => {
    const cal = makeCalendar();
    const interval = cal.currentInterval(laInstant(`${TUE}T11:00:00`));
    assert.strictEqual(interval.type, 'period');
    assert.strictEqual(interval.name, 'Period 3');
  });

  it('during Lunch (11:50) → type=period, name=Lunch', () => {
    const cal = makeCalendar();
    const interval = cal.currentInterval(laInstant(`${TUE}T11:50:00`));
    assert.strictEqual(interval.type, 'period');
    assert.strictEqual(interval.name, 'Lunch');
  });

  it('during passing between Period 1 and Period 2 (09:30) → type=passing', () => {
    const cal = makeCalendar();
    // P1 ends 9:28, P2 starts 9:34 → passing at 9:30
    const interval = cal.currentInterval(laInstant(`${TUE}T09:30:00`));
    assert.strictEqual(interval.type, 'passing');
    assert.match(interval.name, /Passing to Period 2/);
  });

  it('before school (07:00) → type=before-school', () => {
    const cal = makeCalendar();
    const interval = cal.currentInterval(laInstant(`${TUE}T07:00:00`));
    assert.strictEqual(interval.type, 'before-school');
    assert.strictEqual(interval.name, 'Before school');
    assert.strictEqual(interval.duringSchool, false);
  });

  it('after school (16:00) → type=after-school', () => {
    const cal = makeCalendar();
    const interval = cal.currentInterval(laInstant(`${TUE}T16:00:00`));
    assert.strictEqual(interval.type, 'after-school');
    assert.strictEqual(interval.name, 'After school');
    assert.strictEqual(interval.duringSchool, false);
  });

  it('on a weekend (Saturday 2025-08-16) → type=break, name includes Weekend', () => {
    const cal = makeCalendar();
    const interval = cal.currentInterval(laInstant('2025-08-16T12:00:00'));
    assert.strictEqual(interval.type, 'break');
    assert.match(interval.name, /Weekend/);
  });

  it('on a Monday (late start) during Period 1 (10:20) → type=period, name=Period 1', () => {
    const cal = makeCalendar();
    // 2025-08-18 is a Monday, Period 1 starts 10:00
    const interval = cal.currentInterval(laInstant('2025-08-18T10:20:00'));
    assert.strictEqual(interval.type, 'period');
    assert.strictEqual(interval.name, 'Period 1');
  });
});

// ─── Interval.left / Interval.done ───────────────────────────────────────────

describe('Interval.left and Interval.done', () => {
  it('left(now) returns duration from now to end', () => {
    const start = laInstant('2025-08-19T08:30:00');
    const end   = laInstant('2025-08-19T09:28:00');
    const now   = laInstant('2025-08-19T09:00:00');
    const iv = new Interval('Period 1', start, end, true, 'period', []);
    const left = iv.left(now);
    // 9:28 - 9:00 = 28 minutes
    assert.strictEqual(left.total('minutes'), 28);
  });

  it('done(now) returns duration from start to now', () => {
    const start = laInstant('2025-08-19T08:30:00');
    const end   = laInstant('2025-08-19T09:28:00');
    const now   = laInstant('2025-08-19T09:00:00');
    const iv = new Interval('Period 1', start, end, true, 'period', []);
    const done = iv.done(now);
    // 9:00 - 8:30 = 30 minutes
    assert.strictEqual(done.total('minutes'), 30);
  });

  it('left + done = total duration', () => {
    const start = laInstant('2025-08-19T08:30:00');
    const end   = laInstant('2025-08-19T09:28:00');
    const now   = laInstant('2025-08-19T09:00:00');
    const iv = new Interval('Period 1', start, end, true, 'period', []);
    const total = start.until(end).total('minutes');
    assert.strictEqual(iv.left(now).total('minutes') + iv.done(now).total('minutes'), total);
  });
});

// ─── Calendar.nonClassDays ────────────────────────────────────────────────────

describe('Calendar.nonClassDays', () => {
  const NON_CLASS_DATA = {
    ...CALENDAR_DATA,
    dates: {
      '2026-06-01': 'NORMAL',
      '2026-06-02': 'NORMAL',
      '2026-06-03': 'NORMAL',
      '2026-06-04': 'NORMAL',
    },
    nonClassDays: {
      '2026-06-01': 'exam',
      '2026-06-02': 'exam',
      '2026-06-03': 'exam',
      '2026-06-04': 'bonus',
    },
  };

  const makeCal = () => new Calendar(NON_CLASS_DATA, { role: 'student', includeTags: {} });

  describe('nonClassLabel', () => {
    it('returns label for a listed non-class day', () => {
      assert.strictEqual(makeCal().nonClassLabel(pd('2026-06-01')), 'exam');
      assert.strictEqual(makeCal().nonClassLabel(pd('2026-06-04')), 'bonus');
    });

    it('returns null for a regular school day', () => {
      assert.strictEqual(makeCal().nonClassLabel(pd('2025-08-19')), null);
    });

    it('returns null when nonClassDays is missing entirely', () => {
      const cal = new Calendar(CALENDAR_DATA, { role: 'student', includeTags: {} });
      assert.strictEqual(cal.nonClassLabel(pd('2026-06-01')), null);
    });
  });

  describe('nonClassDaysLeft', () => {
    it('before any non-class day → all four entries in date order', () => {
      // 2026-05-15 is well before the exams
      const list = makeCal().nonClassDaysLeft(laInstant('2026-05-15T08:00:00'));
      assert.strictEqual(list.length, 4);
      assert.deepStrictEqual(list.map((x) => x.date.toString()), [
        '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
      ]);
      assert.deepStrictEqual(list.map((x) => x.label), ['exam', 'exam', 'exam', 'bonus']);
    });

    it('on a non-class day before its end → still includes that day', () => {
      // 2026-06-02 morning, before end of school day
      const list = makeCal().nonClassDaysLeft(laInstant('2026-06-02T08:00:00'));
      assert.deepStrictEqual(list.map((x) => x.date.toString()), [
        '2026-06-02', '2026-06-03', '2026-06-04',
      ]);
    });

    it('on a non-class day after end of school → excludes that day', () => {
      // NORMAL schedule ends 15:33 on 2026-06-02 → after 17:00 it's done
      const list = makeCal().nonClassDaysLeft(laInstant('2026-06-02T17:00:00'));
      assert.deepStrictEqual(list.map((x) => x.date.toString()), [
        '2026-06-03', '2026-06-04',
      ]);
    });

    it('after the last non-class day → empty', () => {
      const list = makeCal().nonClassDaysLeft(laInstant('2026-06-04T18:00:00'));
      assert.deepStrictEqual(list, []);
    });

    it('returns empty when nonClassDays not defined', () => {
      const cal = new Calendar(CALENDAR_DATA, { role: 'student', includeTags: {} });
      const list = cal.nonClassDaysLeft(laInstant('2026-05-15T08:00:00'));
      assert.deepStrictEqual(list, []);
    });
  });
});

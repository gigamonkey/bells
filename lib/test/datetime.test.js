import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePlainTime,
  resolveScheduleTimes,
  daysBetween,
  includesWeekend,
} from '../src/datetime.js';

// Helper: make a PlainTime from H:M
const pt = (hour, minute) => Temporal.PlainTime.from({ hour, minute });

// Helper: instant at a given ISO datetime string in America/Los_Angeles
const instant = (isoLocal) =>
  Temporal.PlainDateTime.from(isoLocal)
    .toZonedDateTime('America/Los_Angeles')
    .toInstant();

describe('parsePlainTime', () => {
  describe('hour >= 13 is always unambiguous', () => {
    it('parses 13:25 with null previous → 13:25, not ambiguous', () => {
      const { time, ambiguous } = parsePlainTime('13:25', null);
      assert.strictEqual(time.hour, 13);
      assert.strictEqual(time.minute, 25);
      assert.strictEqual(ambiguous, false);
    });

    it('parses 15:33 with null previous → 15:33, not ambiguous', () => {
      const { time, ambiguous } = parsePlainTime('15:33', null);
      assert.strictEqual(time.hour, 15);
      assert.strictEqual(time.minute, 33);
      assert.strictEqual(ambiguous, false);
    });
  });

  describe('first time in schedule (previous = null)', () => {
    it('parses 8:30 → 08:30, not ambiguous', () => {
      const { time, ambiguous } = parsePlainTime('8:30', null);
      assert.strictEqual(time.hour, 8);
      assert.strictEqual(time.minute, 30);
      assert.strictEqual(ambiguous, false);
    });

    it('parses 7:26 → 07:26, not ambiguous', () => {
      const { time, ambiguous } = parsePlainTime('7:26', null);
      assert.strictEqual(time.hour, 7);
      assert.strictEqual(time.minute, 26);
      assert.strictEqual(ambiguous, false);
    });
  });

  describe('AM inference (both interpretations work — picks minimum)', () => {
    it('9:34 after 8:30 → 09:34 (both 9:34 and 21:34 qualify; 9:34 is closer)', () => {
      const prev = pt(8, 30);
      const { time, ambiguous } = parsePlainTime('9:34', prev);
      assert.strictEqual(time.hour, 9);
      assert.strictEqual(time.minute, 34);
      assert.strictEqual(ambiguous, false);
    });

    it('8:24 after 7:26 → 08:24 (both 8:24 and 20:24 qualify; 8:24 is closer)', () => {
      const prev = pt(7, 26);
      const { time, ambiguous } = parsePlainTime('8:24', prev);
      assert.strictEqual(time.hour, 8);
      assert.strictEqual(time.minute, 24);
      assert.strictEqual(ambiguous, false);
    });
  });

  describe('h = 12: noon vs midnight', () => {
    it('12:30 after 11:40 → noon 12:30 (midnight 0:30 also qualifies but noon is closer)', () => {
      const prev = pt(11, 40);
      const { time, ambiguous } = parsePlainTime('12:30', prev);
      assert.strictEqual(time.hour, 12);
      assert.strictEqual(time.minute, 30);
      assert.strictEqual(ambiguous, false);
    });

    it('12:00 after 00:00 → midnight 0:00 (both qualify; midnight is smaller)', () => {
      const prev = pt(0, 0);
      const { time, ambiguous } = parsePlainTime('12:00', prev);
      assert.strictEqual(time.hour, 0);
      assert.strictEqual(time.minute, 0);
      assert.strictEqual(ambiguous, false);
    });
  });

  describe('unambiguous PM inference', () => {
    it('1:25 after 12:27 → 13:25, not ambiguous (only PM is after previous)', () => {
      const prev = pt(12, 27);
      const { time, ambiguous } = parsePlainTime('1:25', prev);
      assert.strictEqual(time.hour, 13);
      assert.strictEqual(time.minute, 25);
      assert.strictEqual(ambiguous, false);
    });

    it('2:29 after 1:31 (already resolved as 13:31) → 14:29, not ambiguous', () => {
      const prev = pt(13, 31);
      const { time, ambiguous } = parsePlainTime('2:29', prev);
      assert.strictEqual(time.hour, 14);
      assert.strictEqual(time.minute, 29);
      assert.strictEqual(ambiguous, false);
    });

    it('4:37 after 15:39 → 16:37, not ambiguous', () => {
      const prev = pt(15, 39);
      const { time, ambiguous } = parsePlainTime('4:37', prev);
      assert.strictEqual(time.hour, 16);
      assert.strictEqual(time.minute, 37);
      assert.strictEqual(ambiguous, false);
    });
  });

  describe('both interpretations work — picks minimum, not ambiguous', () => {
    it('6:30 after 5:00 → 06:30 (minimum of 06:30 and 18:30), not ambiguous', () => {
      const prev = pt(5, 0);
      const { time, ambiguous } = parsePlainTime('6:30', prev);
      assert.strictEqual(time.hour, 6);
      assert.strictEqual(time.minute, 30);
      assert.strictEqual(ambiguous, false);
    });
  });

  describe('ambiguous: neither interpretation works', () => {
    it('7:00 after 20:00 → ambiguous (neither 07:00 nor 19:00 is after 20:00)', () => {
      const prev = pt(20, 0);
      const { ambiguous } = parsePlainTime('7:00', prev);
      assert.strictEqual(ambiguous, true);
    });
  });
});

describe('resolveScheduleTimes', () => {
  const NORMAL = [
    { name: 'Period 0',   start: '7:26',  end: '8:24',  tags: ['optional', 'zero'] },
    { name: 'Period 1',   start: '8:30',  end: '9:28' },
    { name: 'Period 2',   start: '9:34',  end: '10:37' },
    { name: 'Period 3',   start: '10:43', end: '11:41' },
    { name: 'Lunch',      start: '11:41', end: '12:21' },
    { name: 'Period 4',   start: '12:27', end: '1:25' },
    { name: 'Period 5',   start: '1:31',  end: '2:29' },
    { name: 'Period 6',   start: '2:35',  end: '3:33' },
    { name: 'Period 7',   start: '3:39',  end: '4:37',  tags: ['optional', 'seventh'] },
    { name: 'Period Ext', start: '3:39',  end: '5:09',  tags: ['optional', 'ext'] },
  ];

  it('returns the same number of periods', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    assert.strictEqual(resolved.length, NORMAL.length);
  });

  it('returns Temporal.PlainTime values for start and end', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    for (const p of resolved) {
      assert.ok(p.start instanceof Temporal.PlainTime, `${p.name} start should be PlainTime`);
      assert.ok(p.end instanceof Temporal.PlainTime, `${p.name} end should be PlainTime`);
    }
  });

  it('resolves Period 1 start to 08:30', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    const p1 = resolved.find((p) => p.name === 'Period 1');
    assert.strictEqual(p1.start.hour, 8);
    assert.strictEqual(p1.start.minute, 30);
  });

  it('resolves Period 4 start "12:27" to 12:27 (unambiguous AM)', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    const p4 = resolved.find((p) => p.name === 'Period 4');
    assert.strictEqual(p4.start.hour, 12);
    assert.strictEqual(p4.start.minute, 27);
  });

  it('resolves Period 4 end "1:25" to 13:25 (PM inference)', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    const p4 = resolved.find((p) => p.name === 'Period 4');
    assert.strictEqual(p4.end.hour, 13);
    assert.strictEqual(p4.end.minute, 25);
  });

  it('resolves Period 5 start "1:31" to 13:31', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    const p5 = resolved.find((p) => p.name === 'Period 5');
    assert.strictEqual(p5.start.hour, 13);
    assert.strictEqual(p5.start.minute, 31);
  });

  it('resolves Period 6 end "3:33" to 15:33', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    const p6 = resolved.find((p) => p.name === 'Period 6');
    assert.strictEqual(p6.end.hour, 15);
    assert.strictEqual(p6.end.minute, 33);
  });

  it('resolves Period 7 end "4:37" to 16:37', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    const p7 = resolved.find((p) => p.name === 'Period 7');
    assert.strictEqual(p7.end.hour, 16);
    assert.strictEqual(p7.end.minute, 37);
  });

  it('preserves extra fields like tags', () => {
    const resolved = resolveScheduleTimes(NORMAL);
    const p0 = resolved.find((p) => p.name === 'Period 0');
    assert.deepStrictEqual(p0.tags, ['optional', 'zero']);
  });
});

describe('daysBetween', () => {
  it('same day → 0', () => {
    const a = instant('2025-08-13T12:00:00');
    const b = instant('2025-08-13T15:00:00');
    assert.strictEqual(daysBetween(a, b), 0);
  });

  it('one day apart → 1', () => {
    const a = instant('2025-08-13T12:00:00');
    const b = instant('2025-08-14T12:00:00');
    assert.strictEqual(daysBetween(a, b), 1);
  });

  it('five days apart → 5', () => {
    const a = instant('2025-08-13T12:00:00');
    const b = instant('2025-08-18T12:00:00');
    assert.strictEqual(daysBetween(a, b), 5);
  });

  it('across a DST spring-forward boundary (Mar 9 → Mar 10 2025 in LA) → 1', () => {
    // DST in America/Los_Angeles: spring forward on 2025-03-09
    const a = Temporal.PlainDate.from('2025-03-09')
      .toPlainDateTime({ hour: 12 })
      .toZonedDateTime('America/Los_Angeles')
      .toInstant();
    const b = Temporal.PlainDate.from('2025-03-10')
      .toPlainDateTime({ hour: 12 })
      .toZonedDateTime('America/Los_Angeles')
      .toInstant();
    assert.strictEqual(daysBetween(a, b), 1);
  });

  it('negative direction: b before a → negative days', () => {
    const a = instant('2025-08-15T12:00:00');
    const b = instant('2025-08-13T12:00:00');
    assert.strictEqual(daysBetween(a, b), -2);
  });
});

describe('includesWeekend', () => {
  const tz = 'America/Los_Angeles';

  it('Mon–Fri span (no weekend days) → false', () => {
    // 2025-08-18 Mon to 2025-08-22 Fri
    const start = instant('2025-08-18T16:00:00');
    const end = instant('2025-08-22T08:30:00');
    assert.strictEqual(includesWeekend(start, end, tz), false);
  });

  it('span including Saturday → true', () => {
    // Fri 2025-08-22 to Mon 2025-08-25 includes Sat + Sun
    const start = instant('2025-08-22T15:33:00');
    const end = instant('2025-08-25T08:30:00');
    assert.strictEqual(includesWeekend(start, end, tz), true);
  });

  it('span including Sunday → true', () => {
    // Sun 2025-08-24 noon to Mon 2025-08-25 morning
    const start = Temporal.PlainDate.from('2025-08-24')
      .toPlainDateTime({ hour: 12 })
      .toZonedDateTime(tz)
      .toInstant();
    const end = Temporal.PlainDate.from('2025-08-25')
      .toPlainDateTime({ hour: 8, minute: 30 })
      .toZonedDateTime(tz)
      .toInstant();
    assert.strictEqual(includesWeekend(start, end, tz), true);
  });

  it('start and end on same weekday (no weekend in between) → false', () => {
    // Wed to Wed same day
    const start = instant('2025-08-20T16:00:00');
    const end = instant('2025-08-20T17:00:00');
    assert.strictEqual(includesWeekend(start, end, tz), false);
  });
});

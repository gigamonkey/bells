import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCalendarData } from '../src/validate.js';

// ─── Shared valid fixture ─────────────────────────────────────────────────────

// Fixture uses unambiguous 24-hour times throughout to avoid triggering
// the ambiguity validator on the valid-data tests.
const VALID_DATA = [{
  year: '2025-2026',
  timezone: 'America/Los_Angeles',
  firstDay: '2025-08-13',
  firstDayTeachers: '2025-08-11',
  lastDay: '2026-06-04',
  schedules: {
    default: {
      NORMAL: [
        { name: 'Period 0',   start: '13:00', end: '13:30', tags: ['optional', 'zero'] },
        { name: 'Period 1',   start: '13:35', end: '14:05' },
        { name: 'Period 2',   start: '14:10', end: '14:40' },
        { name: 'Period 3',   start: '14:45', end: '15:15' },
        { name: 'Lunch',      start: '15:20', end: '15:50' },
        { name: 'Period 4',   start: '15:55', end: '16:25' },
        { name: 'Period 5',   start: '16:30', end: '17:00' },
        { name: 'Period 6',   start: '17:05', end: '17:35' },
        { name: 'Period 7',   start: '17:40', end: '18:10', tags: ['optional', 'seventh'] },
        { name: 'Period Ext', start: '17:40', end: '18:30', tags: ['optional', 'ext'] },
      ],
      LATE_START: [
        { name: 'Staff meeting', start: '13:00', end: '14:00', teachers: true },
        { name: 'Period 1',      start: '14:10', end: '14:50' },
        { name: 'Period 2',      start: '14:55', end: '15:35' },
        { name: 'Period 3',      start: '15:40', end: '16:20' },
        { name: 'Lunch',         start: '16:25', end: '16:55' },
        { name: 'Period 4',      start: '17:00', end: '17:40' },
        { name: 'Period 5',      start: '17:45', end: '18:25' },
        { name: 'Period 6',      start: '18:30', end: '19:10' },
      ],
    },
  },
  holidays: ['2025-09-01', '2025-11-27'],
  teacherWorkDays: [],
  breakNames: {
    '2025-11-26': 'Thanksgiving Break',
  },
}];

// Deep-clone and patch a field for negative tests
const withPatch = (patches) => {
  const clone = JSON.parse(JSON.stringify(VALID_DATA));
  patches(clone[0]);
  return clone;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateCalendarData', () => {
  describe('valid data', () => {
    it('returns valid=true and no errors for the fixture', () => {
      const result = validateCalendarData(VALID_DATA);
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('also accepts a single object (not wrapped in array)', () => {
      const result = validateCalendarData(VALID_DATA[0]);
      assert.strictEqual(result.valid, true);
    });
  });

  describe('missing required fields', () => {
    for (const field of ['year', 'timezone', 'firstDay', 'lastDay', 'schedules']) {
      it(`missing "${field}" → error mentioning "${field}"`, () => {
        const data = withPatch((d) => { delete d[field]; });
        const result = validateCalendarData(data);
        assert.strictEqual(result.valid, false);
        assert.ok(
          result.errors.some((e) => e.includes(field)),
          `Expected an error mentioning "${field}", got: ${JSON.stringify(result.errors)}`
        );
      });
    }

    it('missing schedules.default.NORMAL → error', () => {
      const data = withPatch((d) => { delete d.schedules.default.NORMAL; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('NORMAL')));
    });

    it('missing schedules.default.LATE_START → error', () => {
      const data = withPatch((d) => { delete d.schedules.default.LATE_START; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('LATE_START')));
    });
  });

  describe('invalid timezone', () => {
    it('bogus timezone string → error', () => {
      const data = withPatch((d) => { d.timezone = 'Not/ATimezone'; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.toLowerCase().includes('timezone')));
    });
  });

  describe('firstDayTeachers after firstDay', () => {
    it('firstDayTeachers later than firstDay → error', () => {
      const data = withPatch((d) => { d.firstDayTeachers = '2025-08-20'; }); // after firstDay 2025-08-13
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('firstDayTeachers')));
    });

    it('firstDayTeachers same as firstDay → valid', () => {
      const data = withPatch((d) => { d.firstDayTeachers = '2025-08-13'; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, true);
    });

    it('firstDayTeachers before firstDay → valid', () => {
      const data = withPatch((d) => { d.firstDayTeachers = '2025-08-11'; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, true);
    });
  });

  describe('date range checks', () => {
    it('holiday date before firstDayTeachers → error', () => {
      const data = withPatch((d) => { d.holidays = ['2025-08-01']; }); // before firstDayTeachers 2025-08-11
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('holiday') && e.includes('2025-08-01')));
    });

    it('holiday date after lastDay → error', () => {
      const data = withPatch((d) => { d.holidays = ['2027-01-01']; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('holiday') && e.includes('2027-01-01')));
    });

    it('holiday date within range → valid', () => {
      const data = withPatch((d) => { d.holidays = ['2025-09-01']; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, true);
    });

    it('schedule key date outside year range → error', () => {
      const data = withPatch((d) => {
        d.schedules['2024-01-01'] = [{ name: 'Test', start: '8:00', end: '9:00' }];
      });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('2024-01-01')));
    });

    it('schedule key date within range → valid', () => {
      const data = withPatch((d) => {
        d.schedules['2025-09-15'] = [{ name: 'Assembly', start: '8:30', end: '15:33' }];
      });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, true);
    });

    it('breakNames key outside range → error', () => {
      const data = withPatch((d) => { d.breakNames = { '2024-12-25': 'Winter Break' }; });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('2024-12-25')));
    });
  });

  describe('period time validation', () => {
    it('ambiguous time string in a schedule → error mentioning "ambiguous"', () => {
      // Insert a period whose start is ambiguous: previous ends at 5:00,
      // new period starts at '6:30' — both 06:30 and 18:30 are after 05:00.
      const data = withPatch((d) => {
        d.schedules.default.NORMAL = [
          { name: 'Early',   start: '5:00',  end: '5:30' },
          { name: 'Trouble', start: '6:30',  end: '7:00' }, // ambiguous: AM and PM both after 5:30
        ];
      });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('ambiguous')));
    });

    it('period where start >= end → error', () => {
      const data = withPatch((d) => {
        d.schedules.default.NORMAL = [
          { name: 'Bad period', start: '14:00', end: '13:00' },
        ];
      });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Bad period') && e.includes('not before')));
    });

    it('period where start equals end → error', () => {
      const data = withPatch((d) => {
        d.schedules.default.NORMAL = [
          { name: 'Zero duration', start: '14:00', end: '14:00' },
        ];
      });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Zero duration')));
    });
  });

  describe('overlapping non-optional periods', () => {
    it('two non-optional periods that overlap → error', () => {
      const data = withPatch((d) => {
        d.schedules.default.NORMAL = [
          { name: 'Period A', start: '13:00', end: '14:30' },
          { name: 'Period B', start: '14:00', end: '15:00' }, // overlaps with A (14:00–14:30)
        ];
      });
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.includes('overlap')),
        `Expected overlap error, got: ${JSON.stringify(result.errors)}`
      );
    });

    it('optional and non-optional periods at the same time do not trigger overlap', () => {
      // Period 7 and Period Ext both start at 17:40 in the fixture but both are optional
      const result = validateCalendarData(VALID_DATA);
      assert.strictEqual(result.valid, true);
    });

    it('non-overlapping periods → no overlap error', () => {
      const data = withPatch((d) => {
        d.schedules.default.NORMAL = [
          { name: 'Period A', start: '13:00', end: '14:00' },
          { name: 'Period B', start: '14:00', end: '15:00' }, // adjacent, not overlapping
        ];
      });
      const result = validateCalendarData(data);
      // Adjacent periods (end == start) should not count as overlapping
      const overlapErrors = result.errors.filter((e) => e.includes('overlap'));
      assert.strictEqual(overlapErrors.length, 0);
    });
  });

  describe('edge cases', () => {
    it('null data → invalid', () => {
      const result = validateCalendarData(null);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('empty array → invalid', () => {
      const result = validateCalendarData([]);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('multiple year objects: error in second year is reported', () => {
      const data = [
        VALID_DATA[0],
        { ...VALID_DATA[0], year: '2026-2027', timezone: 'Bad/Zone' },
      ];
      const result = validateCalendarData(data);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('timezone') || e.includes('Bad/Zone')));
    });
  });
});

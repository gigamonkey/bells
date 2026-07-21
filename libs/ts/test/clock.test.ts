import './setup.js';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BellSchedule } from '../src/bell-schedule.js';
import { setDebugTime, setDebugOffset, clearDebugTime, getDebugOffset } from '../src/clock.js';

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
  },
  weekdaySchedules: {},
  holidays: [],
  teacherWorkDays: [],
  breakNames: {},
};

const bells = () => new BellSchedule([CALENDAR_DATA], { role: 'student', includeTags: {} });

// A moment inside Period 1 on Tuesday 2025-08-19 (a normal school day).
const duringPeriod1 = Temporal.ZonedDateTime.from({
  year: 2025,
  month: 8,
  day: 19,
  hour: 8,
  minute: 45,
  timeZone: 'America/Los_Angeles',
}).toInstant();

describe('debug clock', () => {
  afterEach(clearDebugTime);

  it('defaults to the real clock (no offset)', () => {
    assert.equal(getDebugOffset(), null);
  });

  it('setDebugTime makes time-defaulting methods resolve as if now were that instant', () => {
    assert.equal(bells().currentInterval(duringPeriod1)?.name, 'Period 1'); // sanity: explicit arg
    setDebugTime(duringPeriod1);
    assert.equal(bells().currentInterval()?.name, 'Period 1'); // no arg → uses debug time
    assert.equal(bells().periodAt()?.name, 'Period 1');
  });

  it('clearDebugTime restores the real clock', () => {
    setDebugTime(duringPeriod1);
    assert.notEqual(getDebugOffset(), null);
    clearDebugTime();
    assert.equal(getDebugOffset(), null);
  });

  it('setDebugOffset and setDebugTime agree', () => {
    setDebugTime(duringPeriod1);
    const viaTime = bells().currentInterval()?.name;
    const offset = getDebugOffset();
    clearDebugTime();
    assert.ok(offset);
    setDebugOffset(offset);
    assert.equal(bells().currentInterval()?.name, viaTime);
  });

  it('an explicitly-passed instant overrides the debug offset', () => {
    // Pretend it is a summer day with no school...
    const summer = Temporal.ZonedDateTime.from({
      year: 2025,
      month: 7,
      day: 15,
      hour: 12,
      timeZone: 'America/Los_Angeles',
    }).toInstant();
    setDebugTime(summer);
    assert.equal(bells().currentInterval(), null); // debug time → summer, no period
    // ...but an explicit instant still wins.
    assert.equal(bells().currentInterval(duringPeriod1)?.name, 'Period 1');
  });
});

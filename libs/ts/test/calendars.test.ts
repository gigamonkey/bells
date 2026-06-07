import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Calendars } from '../src/calendars.js';

const YEAR = {
  year: '2025-2026',
  id: 'loader-test',
  name: 'Loader Test',
  timezone: 'America/Los_Angeles',
  firstDay: '2025-08-13',
  lastDay: '2026-06-04',
  schedules: { NORMAL: [{ name: 'Period 1', start: '8:30', end: '9:28' }] },
};

const writeCalendars = (payload) => {
  const dir = mkdtempSync(join(tmpdir(), 'bells-'));
  writeFileSync(join(dir, '2025-2026.json'), JSON.stringify(payload));
  return { calendars: new Calendars(dir + '/'), dir };
};

describe('Calendars.forYear', () => {
  it('loads from an array file', async () => {
    const { calendars } = writeCalendars([YEAR]);
    const bs = await calendars.forYear('2025-2026');
    assert.strictEqual(bs.timezone, 'America/Los_Angeles');
    assert.strictEqual(bs.isSchoolDay(Temporal.PlainDate.from('2025-08-13')), true); // Wednesday
    assert.strictEqual(bs.isSchoolDay(Temporal.PlainDate.from('2025-08-16')), false); // Saturday
  });

  it('loads from a single-object file (normalized to an array)', async () => {
    const { calendars } = writeCalendars(YEAR);
    const bs = await calendars.forYear('2025-2026');
    assert.strictEqual(bs.timezone, 'America/Los_Angeles');
  });

  it('caches a loaded year', async () => {
    const { calendars, dir } = writeCalendars([YEAR]);
    await calendars.forYear('2025-2026');
    rmSync(join(dir, '2025-2026.json')); // cached load must still succeed
    const bs = await calendars.forYear('2025-2026');
    assert.strictEqual(bs.timezone, 'America/Los_Angeles');
  });
});

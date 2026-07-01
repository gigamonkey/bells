import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';
import {
  routineForPeriod,
  resolveChunks,
  activeChunk,
  nextChunk,
  toEditorRows,
  compileRows,
  fixedSeconds,
  formatSeconds,
} from '../timer-routines.js';

const instant = (s) => Temporal.Instant.from(s);

// A period occurrence: 9:00–10:30 (UTC stands in for the local zone; only the
// instants matter to the model).
const period = (startISO, minutes) => {
  const start = instant(startISO);
  return { start, end: start.add({ minutes }) };
};

// The plan's worked example: fixed 10m front, 15m second, elastic middle,
// fixed 10m back.
const routine = {
  id: 'r1',
  name: 'Block lesson',
  scopeNames: ['Period 1', 'Period 3'],
  chunks: [
    { id: 'a', label: 'Do Now', start: { base: 'start', offset: 0 }, end: { base: 'start', offset: 600 } },
    { id: 'b', label: 'Mini-lesson', start: { base: 'start', offset: 600 }, end: { base: 'start', offset: 1500 } },
    { id: 'c', label: 'Group work', start: { base: 'start', offset: 1500 }, end: { base: 'end', offset: 600 } },
    { id: 'd', label: 'Exit ticket', start: { base: 'end', offset: 600 }, end: { base: 'end', offset: 0 } },
  ],
};

test('start-anchored chunks pin to the front, end-anchored to the back', () => {
  const p = period('2026-01-05T09:00:00Z', 90);
  const resolved = resolveChunks(routine, p);
  assert.equal(resolved[0].start.toString(), '2026-01-05T09:00:00Z');
  assert.equal(resolved[0].end.toString(), '2026-01-05T09:10:00Z');
  assert.equal(resolved[3].start.toString(), '2026-01-05T10:20:00Z');
  assert.equal(resolved[3].end.toString(), '2026-01-05T10:30:00Z');
});

test('elastic middle stretches on a long period and shrinks on a short one', () => {
  const long = resolveChunks(routine, period('2026-01-05T09:00:00Z', 90));
  const group = long.find((c) => c.id === 'c');
  assert.equal(group.start.toString(), '2026-01-05T09:25:00Z');
  assert.equal(group.end.toString(), '2026-01-05T10:20:00Z'); // 55 minutes

  const short = resolveChunks(routine, period('2026-01-05T09:00:00Z', 55));
  const groupShort = short.find((c) => c.id === 'c');
  assert.equal(groupShort.start.toString(), '2026-01-05T09:25:00Z');
  assert.equal(groupShort.end.toString(), '2026-01-05T09:45:00Z'); // 20 minutes
});

test('crossed boundaries collapse to zero length instead of going negative', () => {
  // 30-minute period; fixed front (25m) + back (10m) exceed it.
  const resolved = resolveChunks(routine, period('2026-01-05T09:00:00Z', 30));
  const group = resolved.find((c) => c.id === 'c');
  assert.equal(Temporal.Instant.compare(group.end, group.start), 0);
  // A zero-length chunk is never active.
  assert.notEqual(activeChunk(resolved, group.start)?.id, 'c');
});

test('boundaries clamp into the period', () => {
  // 5-minute period: even the first fixed chunk overflows.
  const resolved = resolveChunks(routine, period('2026-01-05T09:00:00Z', 5));
  const p = period('2026-01-05T09:00:00Z', 5);
  for (const c of resolved) {
    assert.ok(Temporal.Instant.compare(c.start, p.start) >= 0);
    assert.ok(Temporal.Instant.compare(c.end, p.end) <= 0);
  }
});

test('activeChunk: start inclusive, end exclusive', () => {
  const resolved = resolveChunks(routine, period('2026-01-05T09:00:00Z', 90));
  assert.equal(activeChunk(resolved, instant('2026-01-05T09:00:00Z')).id, 'a');
  assert.equal(activeChunk(resolved, instant('2026-01-05T09:09:59Z')).id, 'a');
  assert.equal(activeChunk(resolved, instant('2026-01-05T09:10:00Z')).id, 'b');
  assert.equal(activeChunk(resolved, instant('2026-01-05T10:29:59Z')).id, 'd');
  assert.equal(activeChunk(resolved, instant('2026-01-05T10:30:00Z')), null);
});

test('gaps between chunks: no active chunk, nextChunk finds the following one', () => {
  const gappy = {
    ...routine,
    chunks: [
      { id: 'a', label: 'Do Now', start: { base: 'start', offset: 0 }, end: { base: 'start', offset: 600 } },
      { id: 'd', label: 'Exit', start: { base: 'end', offset: 600 }, end: { base: 'end', offset: 0 } },
    ],
  };
  const resolved = resolveChunks(gappy, period('2026-01-05T09:00:00Z', 90));
  const midway = instant('2026-01-05T09:30:00Z');
  assert.equal(activeChunk(resolved, midway), null);
  assert.equal(nextChunk(resolved, midway).id, 'd');
});

test('routineForPeriod matches by scope name and skips disabled routines', () => {
  const disabled = { ...routine, id: 'r0', enabled: false };
  assert.equal(routineForPeriod([disabled, routine], 'Period 3').id, 'r1');
  assert.equal(routineForPeriod([routine], 'Period 2'), null);
});

test('compileRows produces the chained two-anchor form', () => {
  const rows = [
    { id: 'a', label: 'Do Now', mode: 'start', seconds: 600 },
    { id: 'b', label: 'Mini-lesson', mode: 'start', seconds: 900 },
    { id: 'c', label: 'Group work', mode: 'elastic', seconds: 0 },
    { id: 'd', label: 'Exit ticket', mode: 'end', seconds: 600 },
  ];
  const { chunks, error } = compileRows(rows);
  assert.equal(error, undefined);
  assert.deepEqual(
    chunks.map((c) => [c.start.base, c.start.offset, c.end.base, c.end.offset]),
    [
      ['start', 0, 'start', 600],
      ['start', 600, 'start', 1500],
      ['start', 1500, 'end', 600],
      ['end', 600, 'end', 0],
    ],
  );
});

test('compileRows/toEditorRows round-trip', () => {
  const rows = toEditorRows(routine.chunks);
  assert.deepEqual(
    rows.map((r) => [r.mode, r.seconds]),
    [
      ['start', 600],
      ['start', 900],
      ['elastic', 0],
      ['end', 600],
    ],
  );
  const { chunks } = compileRows(rows);
  assert.deepEqual(
    chunks.map((c) => [c.start.base, c.start.offset, c.end.base, c.end.offset]),
    routine.chunks.map((c) => [c.start.base, c.start.offset, c.end.base, c.end.offset]),
  );
});

test('compileRows rejects bad ordering and non-positive lengths', () => {
  assert.ok(
    compileRows([
      { id: 'd', label: 'Exit', mode: 'end', seconds: 600 },
      { id: 'a', label: 'Do Now', mode: 'start', seconds: 600 },
    ]).error,
  );
  assert.ok(
    compileRows([
      { id: 'c1', label: 'A', mode: 'elastic', seconds: 0 },
      { id: 'c2', label: 'B', mode: 'elastic', seconds: 0 },
    ]).error,
  );
  assert.ok(compileRows([{ id: 'a', label: 'Do Now', mode: 'start', seconds: 0 }]).error);
});

test('fixedSeconds and formatSeconds', () => {
  const rows = toEditorRows(routine.chunks);
  assert.equal(fixedSeconds(rows), 2100);
  assert.equal(formatSeconds(600), '10m');
  assert.equal(formatSeconds(90), '1m 30s');
  assert.equal(formatSeconds(45), '45s');
});

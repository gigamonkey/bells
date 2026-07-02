import { Temporal } from '@js-temporal/polyfill';

/*
 * Pure model for class-timer routines. A routine is an ordered list of labeled
 * chunks scoped to periods by name; each chunk has two boundaries, each
 * anchored to the period start or end:
 *
 *   { id, name, scopeNames: ["Period 1"], chime: true, enabled: true,
 *     chunks: [{ id, label, color,
 *                start: { base: "start"|"end", offset: seconds },
 *                end:   { base: "start"|"end", offset: seconds } }] }
 *
 * `offset` counts forward from the period start (base "start") or backward
 * from the period end (base "end"). A chunk anchored "start" on one side and
 * "end" on the other is elastic: it stretches or shrinks with the period.
 *
 * No DOM access here; localStorage is only touched by load/save.
 */

const STORAGE_KEY = 'timerRoutines';

const loadRoutines = () => {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const saveRoutines = (routines) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
};

/*
 * The first enabled routine scoped to the named period wins.
 */
const routineForPeriod = (routines, periodName) =>
  routines.find((r) => r.enabled !== false && (r.scopeNames || []).includes(periodName)) ?? null;

const resolveAnchor = (anchor, period) =>
  anchor.base === 'start'
    ? period.start.add({ seconds: anchor.offset })
    : period.end.subtract({ seconds: anchor.offset });

const clampInstant = (instant, start, end) => {
  if (Temporal.Instant.compare(instant, start) < 0) return start;
  if (Temporal.Instant.compare(instant, end) > 0) return end;
  return instant;
};

/*
 * Resolve a routine's chunks against one concrete period occurrence (anything
 * with start/end Instants). Boundaries are clamped into the period; a chunk
 * whose boundaries cross after clamping collapses to zero length (and thus is
 * never active). Returns new chunk objects sorted by resolved start.
 */
const resolveChunks = (routine, period) => {
  const resolved = routine.chunks.map((chunk) => {
    const start = clampInstant(resolveAnchor(chunk.start, period), period.start, period.end);
    let end = clampInstant(resolveAnchor(chunk.end, period), period.start, period.end);
    if (Temporal.Instant.compare(end, start) < 0) end = start;
    return { ...chunk, start, end };
  });
  resolved.sort((a, b) => Temporal.Instant.compare(a.start, b.start));
  return resolved;
};

/*
 * The chunk containing `instant` (start inclusive, end exclusive), or null.
 */
const activeChunk = (resolvedChunks, instant) =>
  resolvedChunks.find(
    (c) => Temporal.Instant.compare(c.start, instant) <= 0 && Temporal.Instant.compare(instant, c.end) < 0,
  ) ?? null;

/*
 * The first chunk starting after `instant`, or null.
 */
const nextChunk = (resolvedChunks, instant) =>
  resolvedChunks.find((c) => Temporal.Instant.compare(c.start, instant) > 0) ?? null;

/*
 * Editor form. The stored form above is fully explicit; the editor works in a
 * friendlier row form where segments chain: rows anchored 'start' tile forward
 * from the period start, rows anchored 'end' tile backward from the period
 * end, and at most one 'elastic' row in between absorbs whatever is left.
 *
 *   { id, label, color, mode: 'start'|'elastic'|'end', seconds }
 */

const chunkMode = (chunk) => {
  if (chunk.start.base === 'start' && chunk.end.base === 'start') return 'start';
  if (chunk.start.base === 'end' && chunk.end.base === 'end') return 'end';
  return 'elastic';
};

const chunkSeconds = (chunk) => {
  const mode = chunkMode(chunk);
  if (mode === 'start') return chunk.end.offset - chunk.start.offset;
  if (mode === 'end') return chunk.start.offset - chunk.end.offset;
  return 0;
};

const toEditorRows = (chunks) =>
  chunks.map((c) => ({
    id: c.id,
    label: c.label,
    color: c.color,
    mode: chunkMode(c),
    seconds: chunkSeconds(c),
  }));

/*
 * Compile ordered editor rows to stored chunks. Rows must be zero or more
 * 'start' rows, then at most one 'elastic' row, then zero or more 'end' rows.
 * Returns { chunks } on success or { error } with a message.
 */
const compileRows = (rows) => {
  let phase = 0; // 0 = in start rows, 1 = elastic seen, 2 = in end rows
  for (const row of rows) {
    if (row.mode === 'start' && phase > 0) {
      return { error: '"From start" segments must come before the elastic and "from end" segments.' };
    }
    if (row.mode === 'elastic') {
      if (phase > 0) return { error: 'Only one elastic segment is allowed, before any "from end" segments.' };
      phase = 1;
    }
    if (row.mode === 'end') phase = 2;
    if (row.mode !== 'elastic' && !(row.seconds > 0)) {
      return { error: `Segment "${row.label || '(unlabeled)'}" needs a positive length.` };
    }
  }

  const base = ({ id, label, color }) => ({ id, label, color });
  const chunks = [];

  let accStart = 0;
  for (const row of rows) {
    if (row.mode !== 'start') break;
    chunks.push({
      ...base(row),
      start: { base: 'start', offset: accStart },
      end: { base: 'start', offset: accStart + row.seconds },
    });
    accStart += row.seconds;
  }

  let accEnd = 0;
  const endChunks = [];
  for (const row of [...rows].reverse()) {
    if (row.mode !== 'end') break;
    endChunks.unshift({
      ...base(row),
      start: { base: 'end', offset: accEnd + row.seconds },
      end: { base: 'end', offset: accEnd },
    });
    accEnd += row.seconds;
  }

  const elastic = rows.find((row) => row.mode === 'elastic');
  if (elastic) {
    chunks.push({
      ...base(elastic),
      start: { base: 'start', offset: accStart },
      end: { base: 'end', offset: accEnd },
    });
  }
  chunks.push(...endChunks);
  return { chunks };
};

/*
 * Parse the hand-authored JSON form of a routine (documented in ROUTINES.md)
 * into editor fields. The segment list maps onto editor rows: "minutes"
 * segments anchor to the period start unless "from" is "end", and a segment
 * with "elastic": true absorbs whatever the fixed segments leave over.
 * Returns { name, scopeNames, chime, rows } on success or { error } with a
 * message; rows come back without ids (the editor assigns them).
 */
const parseRoutineJson = (text) => {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: `Not valid JSON: ${e.message}` };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'Expected a JSON object like {"name": …, "segments": […]}.' };
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    return { error: 'The routine needs a "name" (a non-empty string).' };
  }
  const periods = data.periods ?? [];
  if (!Array.isArray(periods) || periods.some((p) => typeof p !== 'string')) {
    return { error: '"periods" must be an array of period names.' };
  }
  if (data.chime !== undefined && typeof data.chime !== 'boolean') {
    return { error: '"chime" must be true or false.' };
  }
  if (!Array.isArray(data.segments) || data.segments.length === 0) {
    return { error: 'The routine needs a non-empty "segments" array.' };
  }

  const rows = [];
  for (const [i, s] of data.segments.entries()) {
    const where = `Segment ${i + 1}`;
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      return { error: `${where} must be an object.` };
    }
    if (typeof s.label !== 'string' || !s.label.trim()) {
      return { error: `${where} needs a "label".` };
    }
    if (s.color !== undefined && !/^#[0-9a-f]{6}$/i.test(s.color)) {
      return { error: `${where}: "color" must be a six-digit hex color like "#4000ff".` };
    }
    let mode = 'elastic';
    let seconds = 0;
    if (s.elastic !== true) {
      if (s.from !== undefined && s.from !== 'start' && s.from !== 'end') {
        return { error: `${where}: "from" must be "start" or "end".` };
      }
      if (typeof s.minutes !== 'number' || !(s.minutes > 0)) {
        return { error: `${where} needs "minutes" (a positive number) or "elastic": true.` };
      }
      mode = s.from === 'end' ? 'end' : 'start';
      seconds = Math.round(s.minutes * 60);
    }
    rows.push({ label: s.label.trim(), color: s.color, mode, seconds });
  }

  const { error } = compileRows(rows);
  if (error) return { error };
  return { name: data.name.trim(), scopeNames: [...new Set(periods)], chime: data.chime !== false, rows };
};

/*
 * Total seconds of the fixed (non-elastic) segments — what the period must be
 * at least as long as for the plan to fit.
 */
const fixedSeconds = (rows) => rows.reduce((acc, row) => acc + (row.mode === 'elastic' ? 0 : row.seconds), 0);

const formatSeconds = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m && s) return `${m}m ${s}s`;
  if (m) return `${m}m`;
  return `${s}s`;
};

const describeRoutine = (routine) => {
  const parts = routine.chunks.map((c) =>
    chunkMode(c) === 'elastic' ? `${c.label} ~` : `${c.label} ${formatSeconds(chunkSeconds(c))}`,
  );
  const scope = (routine.scopeNames || []).join(', ') || '(no periods selected)';
  return `${parts.join(' · ')} — ${scope}`;
};

export {
  loadRoutines,
  saveRoutines,
  routineForPeriod,
  resolveChunks,
  activeChunk,
  nextChunk,
  chunkMode,
  chunkSeconds,
  toEditorRows,
  compileRows,
  parseRoutineJson,
  fixedSeconds,
  formatSeconds,
  describeRoutine,
};

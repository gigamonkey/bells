/**
 * Bells REST API server — wraps @peterseibel/bells for HTTP access.
 *
 * Endpoints:
 *   GET /api/current            — current interval (period, passing, break, etc.)
 *   GET /api/schedule           — periods for the current (or next) school day
 *   GET /api/schedule/for       — periods for a specific date
 *   GET /api/schedule/next      — next school day and its periods
 *   GET /api/schedule/previous  — previous school day and its periods
 *   GET /api/status             — full status: interval + day bounds + year counters
 *
 * Query parameters (all endpoints):
 *   calendar=<id>           school calendar id (e.g. bhs, king-6); default: bhs
 *   role=student|teacher    default: student
 *   includeTags=zero,seventh,ext   optional periods to include (comma-separated)
 *   time=<ISO 8601 instant> instant to query (e.g. 2026-01-15T10:30:00-08:00); defaults to now
 *   date=<YYYY-MM-DD>       date to query at the current time of day; shorthand for time=
 *
 * Environment:
 *   PORT            default: 3000
 *   CALENDARS_PATH  directory of yearly calendar JSON files (any file layout;
 *                   every *.json in it is loaded and non-calendar files are
 *                   ignored). Default: <script dir>/calendars/ if present,
 *                   else the installed @peterseibel/bhs-calendars package,
 *                   else ../bhs-calendars/ relative to this file for dev.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import { Temporal } from 'temporal-polyfill';

if (!globalThis.Temporal) {
  globalThis.Temporal = Temporal;
}

const { BellSchedule } = await import('@peterseibel/bells');

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DEFAULT_CALENDAR_ID = 'bhs';

const defaultCalendarsPath = () => {
  const local = join(__dirname, 'calendars');
  if (existsSync(local)) return local;
  const pkg = join(__dirname, 'node_modules', '@peterseibel', 'bhs-calendars');
  if (existsSync(pkg)) return pkg;
  return join(__dirname, '..', 'bhs-calendars');
};

const CALENDARS_PATH = process.env.CALENDARS_PATH ?? defaultCalendarsPath();

/**
 * Load every yearly calendar object from *.json files in the directory.
 * Files may hold a single year object or an array of them; anything without
 * the calendar shape (e.g. a stray package.json) is skipped.
 */
const loadCalendars = async (dir) => {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const parsed = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))),
  );
  return parsed.flat().filter((y) => y && y.id && y.year && y.firstDay);
};

/** Group yearly calendars by school id, years sorted chronologically. */
const buildRegistry = (years) => {
  const map = new Map();
  for (const y of years) {
    const entry = map.get(y.id) ?? [];
    entry.push(y);
    map.set(y.id, entry);
  }
  for (const entry of map.values()) {
    entry.sort((a, b) => (a.firstDay < b.firstDay ? -1 : a.firstDay > b.firstDay ? 1 : 0));
  }
  return map;
};

const registry = buildRegistry(await loadCalendars(CALENDARS_PATH));
if (!registry.size) {
  console.error(`No calendars found in ${CALENDARS_PATH}`);
  process.exit(1);
}

const parseOptions = (query) => {
  const role = query.role || 'student';
  const raw = query.includeTags;
  const includeTags = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return { role, includeTags };
};

// BellSchedules are immutable per (calendar, options), so memoize them.
const scheduleCache = new Map();

/**
 * BellSchedule for the request's calendar/role/includeTags, or null (with a
 * 400 already sent) if the calendar id is unknown.
 */
const scheduleOr400 = (req, res) => {
  const id = req.query.calendar || DEFAULT_CALENDAR_ID;
  const years = registry.get(id);
  if (!years) {
    res.status(400).json({ error: `Unknown calendar '${id}'`, calendars: [...registry.keys()] });
    return null;
  }
  const { role, includeTags } = parseOptions(req.query);
  const key = `${id}|${role}|${includeTags.join(',')}`;
  let schedule = scheduleCache.get(key);
  if (!schedule) {
    schedule = new BellSchedule(years, { role, includeTags });
    scheduleCache.set(key, schedule);
  }
  return schedule;
};

const TZ = 'America/Los_Angeles';

const parseInstant = (query) => {
  if (query.time) return Temporal.Instant.from(query.time);
  if (query.date) {
    const now = Temporal.Now.zonedDateTimeISO(TZ);
    return Temporal.PlainDate.from(query.date)
      .toPlainDateTime(now.toPlainTime())
      .toZonedDateTime(TZ)
      .toInstant();
  }
  return Temporal.Now.instant();
};

const parseDate = (query) => {
  if (query.date) return Temporal.PlainDate.from(query.date);
  if (query.time) return Temporal.Instant.from(query.time).toZonedDateTimeISO(TZ).toPlainDate();
  return Temporal.Now.plainDateISO(TZ);
};

const durationToSeconds = (duration) => Math.round(duration.total({ unit: 'seconds' }));

const serializeInterval = (interval, now) => {
  if (!interval) return null;
  return {
    name: interval.name,
    type: interval.type,
    start: interval.start.toString(),
    end: interval.end.toString(),
    secondsLeft: durationToSeconds(interval.left(now)),
    secondsDone: durationToSeconds(interval.done(now)),
    duringSchool: interval.duringSchool,
    tags: interval.tags,
  };
};

const handleCurrent = (req, res) => {
  const schedule = scheduleOr400(req, res);
  if (!schedule) return;
  const instant = parseInstant(req.query);
  res.json({ interval: serializeInterval(schedule.currentInterval(instant), instant) });
};

const handleSchedule = (req, res) => {
  const schedule = scheduleOr400(req, res);
  if (!schedule) return;
  const instant = parseInstant(req.query);
  const periods = schedule.periodsForDate(instant);
  res.json({ periods: serializePeriods(periods) });
};

const handleStatus = (req, res) => {
  const schedule = scheduleOr400(req, res);
  if (!schedule) return;
  const instant = parseInstant(req.query);
  const dayBounds = schedule.currentDayBounds(instant);
  res.json({
    interval: serializeInterval(schedule.currentInterval(instant), instant),
    dayBounds: dayBounds
      ? { start: dayBounds.start.toString(), end: dayBounds.end.toString() }
      : null,
    schoolDaysLeft: schedule.schoolDaysLeft(instant),
    calendarDaysLeft: schedule.calendarDaysLeft(instant),
    schoolTimeLeftSeconds: durationToSeconds(schedule.schoolTimeLeft(instant)),
    schoolTimeDoneSeconds: durationToSeconds(schedule.schoolTimeDone(instant)),
    totalSchoolTimeSeconds: durationToSeconds(schedule.totalSchoolTime(instant)),
  });
};

const serializePeriods = (periods) =>
  periods.map((p) => ({
    name: p.name,
    start: p.start.toString(),
    end: p.end.toString(),
    tags: p.tags,
  }));

const handleScheduleFor = (req, res) => {
  const schedule = scheduleOr400(req, res);
  if (!schedule) return;
  const date = parseDate(req.query);
  res.json({
    date: date.toString(),
    isSchoolDay: schedule.isSchoolDay(date),
    periods: serializePeriods(schedule.scheduleFor(date)),
  });
};

const handleNextSchoolDay = (req, res) => {
  const schedule = scheduleOr400(req, res);
  if (!schedule) return;
  const date = parseDate(req.query);
  const next = schedule.nextSchoolDay(date);
  res.json({
    date: next.toString(),
    periods: serializePeriods(schedule.scheduleFor(next)),
  });
};

const handlePreviousSchoolDay = (req, res) => {
  const schedule = scheduleOr400(req, res);
  if (!schedule) return;
  const date = parseDate(req.query);
  const prev = schedule.previousSchoolDay(date);
  res.json({
    date: prev.toString(),
    periods: serializePeriods(schedule.scheduleFor(prev)),
  });
};

const app = express();
app.use(cors());

app.get('/api/current', handleCurrent);
app.get('/api/schedule', handleSchedule);
app.get('/api/schedule/for', handleScheduleFor);
app.get('/api/schedule/next', handleNextSchoolDay);
app.get('/api/schedule/previous', handlePreviousSchoolDay);
app.get('/api/status', handleStatus);

app.listen(PORT, () => {
  console.log(`Bells API server on http://localhost:${PORT}`);
  console.log(`Calendars: ${CALENDARS_PATH} (${[...registry.keys()].sort().join(', ')})`);
});

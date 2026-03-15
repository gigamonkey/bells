/**
 * Bells REST API server — wraps @peterseibel/bells for HTTP access.
 *
 * Endpoints:
 *   GET /api/current  — current interval (period, passing, break, etc.)
 *   GET /api/schedule — periods for the current (or next) school day
 *   GET /api/status   — full status: interval + day bounds + year counters
 *
 * Query parameters (all endpoints):
 *   role=student|teacher    default: student
 *   includeTags=zero,seventh,ext   optional periods to include (comma-separated)
 *   time=<ISO 8601 instant> instant to query (e.g. 2026-01-15T10:30:00-08:00); defaults to now
 *   date=<YYYY-MM-DD>       date to query at the current time of day; shorthand for time=
 *
 * Environment:
 *   PORT            default: 3000
 *   CALENDARS_PATH  path to calendars/ directory, default: <script dir>/calendars/
 *                   (falls back to ../calendars/ relative to this file for dev)
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { Temporal } from '@js-temporal/polyfill';
import { Calendars } from '@peterseibel/bells/calendars';

globalThis.Temporal = Temporal;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const defaultCalendarsPath = () => {
  const local = join(__dirname, 'calendars');
  if (existsSync(local)) return local + '/';
  return join(__dirname, '..', 'calendars') + '/';
};

const CALENDARS_PATH = process.env.CALENDARS_PATH ?? defaultCalendarsPath();

const calendars = new Calendars(CALENDARS_PATH);

const parseOptions = (query) => {
  const role = query.role || 'student';
  const raw = query.includeTags;
  const includeTags = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return { role, includeTags };
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

const handleCurrent = async (req, res) => {
  const options = parseOptions(req.query);
  const instant = parseInstant(req.query);
  const schedule = await calendars.current(options);
  res.json({ interval: serializeInterval(schedule.currentInterval(instant), instant) });
};

const handleSchedule = async (req, res) => {
  const options = parseOptions(req.query);
  const instant = parseInstant(req.query);
  const schedule = await calendars.current(options);
  const periods = schedule.periodsForDate(instant);
  res.json({
    periods: periods.map((p) => ({
      name: p.name,
      start: p.start.toString(),
      end: p.end.toString(),
      tags: p.tags,
    })),
  });
};

const handleStatus = async (req, res) => {
  const options = parseOptions(req.query);
  const instant = parseInstant(req.query);
  const schedule = await calendars.current(options);
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

const app = express();
app.use(cors());

app.get('/api/current', handleCurrent);
app.get('/api/schedule', handleSchedule);
app.get('/api/status', handleStatus);

app.listen(PORT, () => {
  console.log(`Bells API server on http://localhost:${PORT}`);
  console.log(`Calendars: ${CALENDARS_PATH}`);
});

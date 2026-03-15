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
 *   time=<ISO 8601 instant> override "now" for testing (e.g. 2026-01-15T10:30:00-08:00)
 *
 * Environment:
 *   PORT            default: 3000
 *   CALENDARS_PATH  path to calendars/ directory, default: <script dir>/calendars/
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Temporal } from '@js-temporal/polyfill';
import { Calendars } from '@peterseibel/bells/calendars';

globalThis.Temporal = Temporal;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CALENDARS_PATH = process.env.CALENDARS_PATH ?? join(__dirname, 'calendars') + '/';

const calendars = new Calendars(CALENDARS_PATH);

function parseOptions(searchParams) {
  const role = searchParams.get('role') || 'student';
  const raw = searchParams.get('includeTags');
  const includeTags = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return { role, includeTags };
}

function parseInstant(searchParams) {
  const raw = searchParams.get('time');
  return raw ? Temporal.Instant.from(raw) : Temporal.Now.instant();
}

function durationToSeconds(duration) {
  return Math.round(duration.total({ unit: 'seconds' }));
}

function serializeInterval(interval, now) {
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
}

async function handleCurrent(url) {
  const options = parseOptions(url.searchParams);
  const instant = parseInstant(url.searchParams);
  const schedule = await calendars.current(options);
  return { interval: serializeInterval(schedule.currentInterval(instant), instant) };
}

async function handleSchedule(url) {
  const options = parseOptions(url.searchParams);
  const instant = parseInstant(url.searchParams);
  const schedule = await calendars.current(options);
  const periods = schedule.periodsForDate(instant);
  return {
    periods: periods.map((p) => ({
      name: p.name,
      start: p.start.toString(),
      end: p.end.toString(),
      tags: p.tags,
    })),
  };
}

async function handleStatus(url) {
  const options = parseOptions(url.searchParams);
  const instant = parseInstant(url.searchParams);
  const schedule = await calendars.current(options);
  const dayBounds = schedule.currentDayBounds(instant);
  return {
    interval: serializeInterval(schedule.currentInterval(instant), instant),
    dayBounds: dayBounds
      ? { start: dayBounds.start.toString(), end: dayBounds.end.toString() }
      : null,
    schoolDaysLeft: schedule.schoolDaysLeft(instant),
    calendarDaysLeft: schedule.calendarDaysLeft(instant),
    schoolTimeLeftSeconds: durationToSeconds(schedule.schoolTimeLeft(instant)),
    schoolTimeDoneSeconds: durationToSeconds(schedule.schoolTimeDone(instant)),
    totalSchoolTimeSeconds: durationToSeconds(schedule.totalSchoolTime(instant)),
  };
}

const routes = {
  '/api/current': handleCurrent,
  '/api/schedule': handleSchedule,
  '/api/status': handleStatus,
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const handler = routes[url.pathname];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', endpoints: Object.keys(routes) }));
    return;
  }

  try {
    const result = await handler(url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error(`${req.method} ${req.url}:`, err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Bells API server on http://localhost:${PORT}`);
  console.log(`Calendars: ${CALENDARS_PATH}`);
});

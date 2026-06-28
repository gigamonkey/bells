/**
 * Shared machinery for the cross-implementation golden tests: loads the
 * case files from libs/golden/, dispatches queries against a BellSchedule,
 * and serializes results to the canonical JSON form described in
 * libs/golden/README.md.
 *
 * Anything imported here assumes the Temporal global is already installed
 * (test files import ../setup.js first; the generator script does the same).
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatTime, parseTime, type BoundTime, type DaySpec } from '../../src/abstract-time.js';
import { BellSchedule } from '../../src/bell-schedule.js';
import type { Interval } from '../../src/calendar.js';
import type {
  BellScheduleOptions,
  NonClassDay,
  ScheduledPeriod,
  SchoolWeek,
  YearData,
} from '../../src/types.js';

export const GOLDEN_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../golden'
);

export interface GoldenQuery {
  id: string;
  method: string;
  // Mostly string scalars (ISO instants/dates), but the abstract-time methods
  // carry structured args (a `day` DaySpec, a `bound` BoundTime, a numeric
  // `period`/`n`).
  args: Record<string, any>;
}

export interface GoldenCase {
  description: string;
  calendars: string[];
  options: BellScheduleOptions;
  queries: GoldenQuery[];
}

export interface LoadedCase {
  name: string;
  def: GoldenCase;
}

export const loadCases = async (): Promise<LoadedCase[]> => {
  const dir = path.join(GOLDEN_DIR, 'cases');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (f) => ({
      name: f.replace(/\.json$/, ''),
      def: JSON.parse(await readFile(path.join(dir, f), 'utf8')) as GoldenCase,
    }))
  );
};

export const loadCalendarData = async (files: string[]): Promise<YearData[]> => {
  const data: YearData[] = [];
  for (const f of files) {
    const parsed = JSON.parse(await readFile(path.join(GOLDEN_DIR, 'calendars', f), 'utf8'));
    data.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return data;
};

export const makeBellSchedule = async (def: GoldenCase): Promise<BellSchedule> =>
  new BellSchedule(await loadCalendarData(def.calendars), def.options);

export const loadExpected = async (name: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path.join(GOLDEN_DIR, 'expected', `${name}.json`), 'utf8'));

// ─── Canonical serialization ──────────────────────────────────────────────────

const instant = (i: Temporal.Instant): string => i.toString({ smallestUnit: 'second' });

const plainDate = (d: Temporal.PlainDate): string => d.toString();

const duration = (d: Temporal.Duration): number => Math.round(d.total({ unit: 'seconds' }));

const interval = (i: Interval | null): unknown =>
  i === null
    ? null
    : {
        name: i.name,
        type: i.type,
        start: instant(i.start),
        end: instant(i.end),
        duringSchool: i.duringSchool,
        tags: i.tags,
      };

const bounds = (b: { start: Temporal.Instant | null; end: Temporal.Instant | null } | null) =>
  b === null ? null : { start: b.start && instant(b.start), end: b.end && instant(b.end) };

const period = (p: ScheduledPeriod | null): unknown =>
  p === null ? null : { name: p.name, start: instant(p.start), end: instant(p.end), tags: p.tags };

const periods = (ps: ScheduledPeriod[]): unknown => ps.map((p) => period(p));

const zoned = (z: Temporal.ZonedDateTime | null): unknown =>
  z === null ? null : instant(z.toInstant());

const nonClassDays = (ds: NonClassDay[]): unknown =>
  ds.map((d) => ({ date: plainDate(d.date), label: d.label }));

const isPlainDate = (v: unknown): v is Temporal.PlainDate => v instanceof Temporal.PlainDate;

const schoolWeek = (w: SchoolWeek | null): unknown =>
  w === null
    ? null
    : {
        number: w.number,
        monday: plainDate(w.monday),
        firstSchoolDay: plainDate(w.firstSchoolDay),
        lastSchoolDay: plainDate(w.lastSchoolDay),
        schoolDayCount: w.schoolDayCount,
      };

const schoolWeeks = (ws: SchoolWeek[]): unknown => ws.map((w) => schoolWeek(w));

// A resolved/active annotation: a plain object whose PlainDate values become
// date strings and whose nested `schoolWeek` is serialized; everything else
// (id, week, source, label, kind, arbitrary payload) passes through.
const annotation = (a: Record<string, unknown>): unknown => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if (k === 'schoolWeek') out[k] = schoolWeek(v as SchoolWeek | null);
    else if (isPlainDate(v)) out[k] = plainDate(v);
    else out[k] = v;
  }
  return out;
};

const annotations = (arr: Array<Record<string, unknown>>): unknown => arr.map((a) => annotation(a));

// ─── Query dispatch ───────────────────────────────────────────────────────────

const I = (s: string): Temporal.Instant => Temporal.Instant.from(s);
const D = (s: string): Temporal.PlainDate => Temporal.PlainDate.from(s);

type Args = Record<string, string>;

const DISPATCH: Record<string, (b: BellSchedule, a: Args) => unknown> = {
  timezone: (b) => b.timezone,
  currentInterval: (b, a) => interval(b.currentInterval(I(a.instant))),
  periodAt: (b, a) => interval(b.periodAt(I(a.instant))),
  isSchoolDay: (b, a) => b.isSchoolDay(D(a.date)),
  currentDayBounds: (b, a) => bounds(b.currentDayBounds(I(a.instant))),
  nextSchoolDayStart: (b, a) => instant(b.nextSchoolDayStart(I(a.instant))),
  previousSchoolDayEnd: (b, a) => instant(b.previousSchoolDayEnd(I(a.instant))),
  schoolTimeLeft: (b, a) => duration(b.schoolTimeLeft(I(a.instant))),
  schoolTimeDone: (b, a) => duration(b.schoolTimeDone(I(a.instant))),
  totalSchoolTime: (b, a) => duration(b.totalSchoolTime(I(a.instant))),
  schoolTimeBetween: (b, a) => duration(b.schoolTimeBetween(I(a.start), I(a.end))),
  schoolDaysBetween: (b, a) => b.schoolDaysBetween(D(a.start), D(a.end)),
  schoolDaysLeft: (b, a) => b.schoolDaysLeft(I(a.instant)),
  calendarDaysLeft: (b, a) => b.calendarDaysLeft(I(a.instant)),
  nextYearStart: (b, a) => instant(b.nextYearStart(I(a.instant))),
  currentYearStart: (b, a) => {
    const r = b.currentYearStart(I(a.instant));
    return r && instant(r);
  },
  currentYearEnd: (b, a) => {
    const r = b.currentYearEnd(I(a.instant));
    return r && instant(r);
  },
  summerBounds: (b, a) => bounds(b.summerBounds(I(a.instant))),
  nextSchoolDay: (b, a) => plainDate(b.nextSchoolDay(D(a.date))),
  previousSchoolDay: (b, a) => plainDate(b.previousSchoolDay(D(a.date))),
  scheduleNameFor: (b, a) => b.scheduleNameFor(D(a.date)),
  scheduleFor: (b, a) => periods(b.scheduleFor(D(a.date))),
  periodsForDate: (b, a) => periods(b.periodsForDate(I(a.instant))),
  nonClassDaysLeft: (b, a) => nonClassDays(b.nonClassDaysLeft(I(a.instant))),
  nonClassLabel: (b, a) => b.nonClassLabel(D(a.date)),

  // School weeks & annotations.
  schoolWeeks: (b) => schoolWeeks(b.schoolWeeks()),
  schoolWeek: (b, a) => schoolWeek(b.schoolWeek(a.n as unknown as number)),
  weekForDate: (b, a) => schoolWeek(b.weekForDate(D(a.date))),
  rangeAnnotations: (b) => annotations(b.rangeAnnotations() as Array<Record<string, unknown>>),
  weekAnnotations: (b) => annotations(b.weekAnnotations() as Array<Record<string, unknown>>),
  dateAnnotations: (b) => annotations(b.dateAnnotations() as Array<Record<string, unknown>>),
  annotationsOn: (b, a) => annotations(b.annotationsOn(D(a.date)) as Array<Record<string, unknown>>),
  annotationsForWeek: (b, a) =>
    annotations(b.annotationsForWeek(a.n as unknown as number) as Array<Record<string, unknown>>),

  // Abstract-time API.
  resolveDay: (b, a) => plainDate(b.resolveDay(D(a.base), a.day as DaySpec | undefined)),
  addSchoolDays: (b, a) => plainDate(b.addSchoolDays(D(a.date), a.n)),
  resolveTime: (b, a) => zoned(b.resolveTime(a.bound as BoundTime, a.period)),
  periodOnDate: (b, a) => period(b.periodOnDate(D(a.date), a.n)),
  currentOrNextPeriodNumber: (b, a) => b.currentOrNextPeriodNumber(I(a.instant)),
  timeWarnings: (b, a) => b.timeWarnings(a.bound as BoundTime).length,
  canonicalizeTime: (_b, a) => formatTime(parseTime(a.spec)),
};

export const runQuery = (bells: BellSchedule, q: GoldenQuery): unknown => {
  const fn = DISPATCH[q.method];
  if (!fn) throw new Error(`Golden query method not in protocol: ${q.method}`);
  return fn(bells, q.args);
};

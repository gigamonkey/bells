/**
 * Shared data and option types for the bells library.
 */

/** One period as it appears in raw calendar JSON (times are strings). */
export interface PeriodData {
  name: string;
  start: string;
  end: string;
  tags?: string[];
  teachers?: boolean;
}

/** A date override: either a named schedule or an inline list of periods. */
export type DateEntry = string | PeriodData[];

/** One academic year of calendar data. */
export interface YearData {
  year: string;
  /** Calendar identifier shared by every year of the same calendar. */
  id?: string;
  /** Human-readable calendar name. */
  name?: string;
  timezone: string;
  firstDay: string;
  firstDayTeachers?: string;
  lastDay: string;
  schedules: Record<string, PeriodData[]>;
  weekdaySchedules?: Record<string, string>;
  dates?: Record<string, DateEntry>;
  holidays?: string[];
  teacherWorkDays?: string[];
  breakNames?: Record<string, string>;
  nonClassDays?: Record<string, string>;
  annotations?: Annotations;
}

/**
 * A free-form annotation payload. `label` and `kind` are conventional fields;
 * any other keys are opaque and passed through untouched.
 */
export interface Annotation {
  label?: string;
  kind?: string;
  [key: string]: unknown;
}

/** A range annotation: an inclusive `start`/`end` span plus free-form payload. */
export interface RangeAnnotation extends Annotation {
  start: string;
  end: string;
}

/**
 * Optional generic annotations attached to a calendar year. Three typed
 * buckets keyed by, respectively, an arbitrary id, a school-week number, and a
 * `YYYY-MM-DD` date. Purely additive: a calendar without `annotations` behaves
 * exactly as before.
 */
export interface Annotations {
  ranges?: Record<string, RangeAnnotation>;
  weeks?: Record<string, Annotation>;
  dates?: Record<string, Annotation>;
}

/**
 * A canonical school week: a Monday-anchored ISO week containing at least one
 * school day. School weeks are numbered 1..n in chronological order; full-week
 * breaks get no number and are skipped, so the numbering is dense.
 */
export interface SchoolWeek {
  number: number;
  monday: Temporal.PlainDate;
  firstSchoolDay: Temporal.PlainDate;
  lastSchoolDay: Temporal.PlainDate;
  schoolDayCount: number;
}

/** A `ranges` annotation with its `start`/`end` resolved to PlainDates. */
export interface ResolvedRangeAnnotation extends Annotation {
  id: string;
  start: Temporal.PlainDate;
  end: Temporal.PlainDate;
}

/** A `weeks` annotation with its key resolved to a school week (or null). */
export interface ResolvedWeekAnnotation extends Annotation {
  week: number;
  schoolWeek: SchoolWeek | null;
}

/** A `dates` annotation with its key resolved to a PlainDate. */
export interface ResolvedDateAnnotation extends Annotation {
  date: Temporal.PlainDate;
}

/** Which bucket an annotation came from, in a unified-helper result. */
export type AnnotationSource = 'range' | 'week' | 'date';

/** A resolved annotation tagged with the bucket it came from. */
export type ActiveAnnotation =
  | (ResolvedRangeAnnotation & { source: 'range' })
  | (ResolvedWeekAnnotation & { source: 'week' })
  | (ResolvedDateAnnotation & { source: 'date' });

/** A period with its time strings resolved to Temporal.PlainTime. */
export interface ResolvedPeriod {
  name: string;
  start: Temporal.PlainTime;
  end: Temporal.PlainTime;
  tags?: string[];
  teachers?: boolean;
}

export type Role = 'student' | 'teacher';

/**
 * Which optional period tags to include.
 * A flat array applies the same tags Mon–Fri. An object maps ISO day-of-week
 * numbers (1=Mon…7=Sun) to tag arrays.
 */
export type IncludeTags = string[] | Record<number, string[]>;

export interface BellScheduleOptions {
  /** 'student' (default) or 'teacher'. */
  role?: Role;
  includeTags?: IncludeTags;
  /**
   * Extract a period number from a period, or null for non-numbered
   * intervals (e.g. "Lunch"). Default: match /^Period (\d+)\b/ in the name.
   */
  periodNumber?: (period: { name: string }) => number | null;
}

export type IntervalType =
  | 'period'
  | 'passing'
  | 'before-school'
  | 'after-school'
  | 'break';

/** A period projected onto a concrete date, with instant boundaries. */
export interface ScheduledPeriod {
  name: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
  tags: string[];
}

/** A dated non-class day with its label. */
export interface NonClassDay {
  date: Temporal.PlainDate;
  label: string;
}

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
}

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

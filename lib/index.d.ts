/**
 * TypeScript declarations for the bells library.
 */

import type { Temporal } from '@js-temporal/polyfill';

export interface BellScheduleOptions {
  /** 'student' (default) or 'teacher' */
  role?: 'student' | 'teacher';
  /**
   * Which optional period tags to include.
   * A flat array applies the same tags Mon–Fri.
   * An object maps ISO day-of-week numbers (1=Mon…7=Sun) to tag arrays.
   */
  includeTags?: string[] | { [dayOfWeek: number]: string[] };
}

export interface Interval {
  name: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
  type: 'period' | 'passing' | 'before-school' | 'after-school' | 'break';
  duringSchool: boolean;
  /** Tags from the period's data (empty for non-period intervals). */
  tags: string[];
  /** Time remaining in this interval. */
  left(now?: Temporal.Instant): Temporal.Duration;
  /** Time elapsed in this interval. */
  done(now?: Temporal.Instant): Temporal.Duration;
}

export interface Period extends Interval {
  type: 'period';
}

export declare class BellSchedule {
  constructor(calendarDataArray: object[], options?: BellScheduleOptions);

  /** The interval (period, passing, break, etc.) covering the given instant. */
  currentInterval(instant?: Temporal.Instant): Interval | null;

  /** The named period at the given instant, or null if not in a period. */
  periodAt(instant?: Temporal.Instant): Period | null;

  /** Is the given date a school day? */
  isSchoolDay(date?: Temporal.PlainDate): boolean;

  /** Start and end of the current school day, or null if not a school day. */
  currentDayBounds(instant?: Temporal.Instant): { start: Temporal.Instant; end: Temporal.Instant } | null;

  /** Start of the next school day. */
  nextSchoolDayStart(instant?: Temporal.Instant): Temporal.Instant;

  /** End of the previous school day. */
  previousSchoolDayEnd(instant?: Temporal.Instant): Temporal.Instant;

  /** Total school time remaining in the current year. */
  schoolTimeLeft(instant?: Temporal.Instant): Temporal.Duration;

  /** Total school time elapsed since the start of the current year. */
  schoolTimeDone(instant?: Temporal.Instant): Temporal.Duration;

  /** Total school time in the current year. */
  totalSchoolTime(instant?: Temporal.Instant): Temporal.Duration;

  /** Start of the next academic year. Throws if no next year data is loaded. */
  nextYearStart(instant?: Temporal.Instant): Temporal.Instant;

  /** Total school time between two instants (only counts school-in-session time). */
  schoolTimeBetween(start: Temporal.Instant, end: Temporal.Instant): Temporal.Duration;

  /** Number of school days remaining (including today if still in progress). */
  schoolDaysLeft(instant?: Temporal.Instant): number;

  /** Number of calendar days until the end of the school year. */
  calendarDaysLeft(instant?: Temporal.Instant): number;

  /** Start/end of summer, or null if the instant is within a school year. */
  summerBounds(instant?: Temporal.Instant): { start: Temporal.Instant | null; end: Temporal.Instant | null } | null;

  /**
   * Returns the active periods for the current or next school day.
   * Each period has its start/end as Temporal.Instant values.
   */
  periodsForDate(instant?: Temporal.Instant): Array<{ name: string; start: Temporal.Instant; end: Temporal.Instant; tags: string[] }>;
}


import type { BellSchedule, BellScheduleOptions } from './index.d.ts';

export declare class Calendars {
  /**
   * @param basePath - Directory path (e.g. './calendars/') or URL base.
   *                   Files are named `{year}.json` under this path.
   */
  constructor(basePath: string);

  /** Load a BellSchedule for a specific academic year (e.g. '2025-2026'). */
  forYear(year: string, options?: BellScheduleOptions): Promise<BellSchedule>;

  /**
   * Load a BellSchedule appropriate for the current date.
   * During summer, loads both the most recently ended year and the upcoming
   * year so summer/next-year queries work correctly.
   */
  current(options?: BellScheduleOptions): Promise<BellSchedule>;
}

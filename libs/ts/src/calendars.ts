/**
 * Calendars — per-year file loader.
 * Loads year JSON files from a directory path or base URL.
 */

import { BellSchedule } from './bell-schedule.js';
import type { BellScheduleOptions, YearData } from './types.js';

class Calendars {
  #basePath: string;
  #cache: Map<string, YearData[]>;

  /**
   * @param basePath - Directory path (e.g. './calendars/') or URL base.
   */
  constructor(basePath: string) {
    this.#basePath = basePath;
    this.#cache = new Map(); // year string → parsed data
  }

  /** Load data for a specific academic year (e.g. '2025-2026'). */
  async #load(year: string): Promise<YearData[]> {
    const cached = this.#cache.get(year);
    if (cached) {
      return cached;
    }

    const filePath = `${this.#basePath}${year}.json`;
    let data: unknown;

    if (this.#basePath.startsWith('http://') || this.#basePath.startsWith('https://')) {
      const res = await fetch(filePath);
      if (!res.ok) throw new Error(`Failed to fetch ${filePath}: ${res.status} ${res.statusText}`);
      data = await res.json();
    } else {
      const { readFile } = await import('node:fs/promises');
      const text = await readFile(filePath, 'utf8');
      data = JSON.parse(text);
    }

    // Normalize to array.
    const arr = (Array.isArray(data) ? data : [data]) as YearData[];
    this.#cache.set(year, arr);
    return arr;
  }

  /** Get a BellSchedule for a specific academic year (e.g. '2025-2026'). */
  async forYear(year: string, options: BellScheduleOptions = {}): Promise<BellSchedule> {
    const arr = await this.#load(year);
    return new BellSchedule(arr, options);
  }

  /**
   * Get a BellSchedule appropriate for the current instant.
   * During summer, loads both the most recent ended year and the next upcoming
   * year so summer-bounds and next-year-start queries work correctly.
   *
   * "Today" defaults to the system-local date; pass `timeZone` to anchor the
   * academic-year rollover to a specific zone (e.g. the school's) when running
   * elsewhere — e.g. a server in UTC.
   */
  async current(options: BellScheduleOptions = {}, timeZone?: string): Promise<BellSchedule> {
    const today = Temporal.Now.plainDateISO(timeZone);
    const year = this.#academicYearFor(today);

    const primaryArr = await this.#load(year);
    const firstDay = primaryArr[0].firstDayTeachers || primaryArr[0].firstDay;
    const lastDay = primaryArr[0].lastDay;
    const inYear = today.toString() >= firstDay && today.toString() <= lastDay;

    if (inYear) {
      return new BellSchedule(primaryArr, options);
    }

    // Summer — load adjacent year.
    const allData = [...primaryArr];

    if (today.toString() > lastDay) {
      // After this year's end — load the next academic year.
      const nextYearLabel = this.#nextAcademicYear(year);
      try {
        const nextArr = await this.#load(nextYearLabel);
        allData.push(...nextArr);
      } catch {
        // Next year data not available; that's fine.
      }
    } else {
      // Before this year's start — load the previous academic year.
      const prevYearLabel = this.#prevAcademicYear(year);
      try {
        const prevArr = await this.#load(prevYearLabel);
        allData.unshift(...prevArr);
      } catch {
        // Previous year data not available; that's fine.
      }
    }

    return new BellSchedule(allData, options);
  }

  /**
   * Determine the academic year label for a given date.
   * Academic year starts in August.
   */
  #academicYearFor(date: Temporal.PlainDate): string {
    const { month, year } = date;
    if (month >= 8) {
      return `${year}-${year + 1}`;
    } else {
      return `${year - 1}-${year}`;
    }
  }

  #nextAcademicYear(year: string): string {
    const [start] = year.split('-').map(Number);
    return `${start + 1}-${start + 2}`;
  }

  #prevAcademicYear(year: string): string {
    const [start] = year.split('-').map(Number);
    return `${start - 1}-${start}`;
  }
}

export { Calendars };

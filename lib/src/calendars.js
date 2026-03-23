/**
 * Calendars — per-year file loader.
 * Loads year JSON files from a directory path or base URL.
 */

import { BellSchedule } from './bell-schedule.js';

class Calendars {
  #basePath;
  #cache;

  /**
   * @param {string} basePath - Directory path (e.g. './calendars/') or URL base.
   */
  constructor(basePath) {
    this.#basePath = basePath;
    this.#cache = new Map(); // year string → parsed data
  }

  /**
   * Load data for a specific academic year.
   * @param {string} year - e.g. '2025-2026'
   * @returns {Promise<object[]>}
   */
  async #load(year) {
    if (this.#cache.has(year)) {
      return this.#cache.get(year);
    }

    const filePath = `${this.#basePath}${year}.json`;
    let data;

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
    const arr = Array.isArray(data) ? data : [data];
    this.#cache.set(year, arr);
    return arr;
  }

  /**
   * Get a BellSchedule for a specific academic year.
   * @param {string} year - e.g. '2025-2026'
   * @param {object} [options]
   * @returns {Promise<BellSchedule>}
   */
  async forYear(year, options = {}) {
    const arr = await this.#load(year);
    return new BellSchedule(arr, options);
  }

  /**
   * Get a BellSchedule appropriate for the current instant.
   * During summer, loads both the most recent ended year and the next upcoming
   * year so summer-bounds and next-year-start queries work correctly.
   * @param {object} [options]
   * @returns {Promise<BellSchedule>}
   */
  async current(options = {}) {
    const today = Temporal.Now.plainDateISO();
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
   * @param {Temporal.PlainDate} date
   * @returns {string} e.g. '2025-2026'
   */
  #academicYearFor(date) {
    const { month, year } = date;
    if (month >= 8) {
      return `${year}-${year + 1}`;
    } else {
      return `${year - 1}-${year}`;
    }
  }

  /**
   * @param {string} year - e.g. '2025-2026'
   * @returns {string} - e.g. '2026-2027'
   */
  #nextAcademicYear(year) {
    const [start] = year.split('-').map(Number);
    return `${start + 1}-${start + 2}`;
  }

  /**
   * @param {string} year - e.g. '2025-2026'
   * @returns {string} - e.g. '2024-2025'
   */
  #prevAcademicYear(year) {
    const [start] = year.split('-').map(Number);
    return `${start - 1}-${start}`;
  }
}

export { Calendars };

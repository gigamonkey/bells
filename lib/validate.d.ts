/**
 * TypeScript declarations for bells/validate.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an array (or single object) of calendar year data.
 * Returns { valid, errors }.
 */
export declare function validateCalendarData(data: object | object[]): ValidationResult;

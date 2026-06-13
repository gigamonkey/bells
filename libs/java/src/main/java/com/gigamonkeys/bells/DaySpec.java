package com.gigamonkeys.bells;

/**
 * Which day an abstract time refers to, possibly relative to a base date supplied at bind time.
 *
 * <p>A sealed set of variants, mirroring the TypeScript {@code DaySpec} union:
 *
 * <ul>
 *   <li>{@link AbsoluteDate} — an absolute ISO date
 *   <li>{@link SchoolDays} — n school days from the base
 *   <li>{@link Weeks} — n calendar weeks from the base
 *   <li>{@link Weekday} — the next given weekday (ISO 1=Mon … 7=Sun) strictly after the base
 *   <li>{@link Week} — the first/last school day of the week n weeks from the base date's week
 * </ul>
 */
public sealed interface DaySpec {

  /** An absolute ISO date ({@code "YYYY-MM-DD"}). */
  record AbsoluteDate(String date) implements DaySpec {}

  /** {@code n} school days from the base date (n may be negative; 0 = the base). */
  record SchoolDays(int n) implements DaySpec {}

  /** {@code n} calendar weeks from the base date, taken literally. */
  record Weeks(int n) implements DaySpec {}

  /** The next {@code weekday} (ISO 1=Mon … 7=Sun) strictly after the base. */
  record Weekday(int weekday) implements DaySpec {}

  /**
   * The first ({@code edge="start"}) or last ({@code edge="end"}) school day of the week {@code n}
   * weeks from the base date's week (n = 0: this week, n = 1: next week).
   */
  record Week(String edge, int n) implements DaySpec {}
}

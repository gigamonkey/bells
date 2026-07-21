package com.gigamonkeys.bells;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Pure date/time utilities for the bells library, built on {@code java.time}.
 *
 * <p>This is the Java analogue of the JavaScript library's {@code datetime.js}, which
 * was built on the Temporal API. The Temporal type mapping used throughout the port is:
 * {@code Temporal.Instant} → {@link Instant}, {@code Temporal.PlainDate} → {@link LocalDate},
 * {@code Temporal.PlainTime} → {@link LocalTime}, {@code Temporal.PlainDateTime} →
 * {@link LocalDateTime}, {@code Temporal.Duration} → {@link Duration}.
 */
public final class DateTimes {

  private DateTimes() {}

  /**
   * The library's notion of "now". By default this is the real system clock. For
   * debugging, consumers can set a simulated current time (or a raw offset) via
   * {@link #setDebugTime}, {@link #setDebugOffset} and {@link #clearDebugTime};
   * the offset is a fixed delta added to the live clock, so time keeps ticking
   * forward from the simulated moment rather than freezing.
   *
   * <p>The offset is process-global: it affects every time-defaulting method in
   * the library. That makes it a debugging affordance, not something to rely on
   * in a concurrent multi-tenant server.
   */
  private static volatile Duration debugOffset = null;

  /** The current instant, offset-adjusted (counterpart of {@code Temporal.Now.instant()}). */
  static Instant now() {
    Instant real = Instant.now();
    Duration offset = debugOffset;
    return offset == null ? real : real.plus(offset);
  }

  /** The current local date in {@code zone}, offset-adjusted. */
  static LocalDate today(ZoneId zone) {
    return now().atZone(zone).toLocalDate();
  }

  /** The current local date in the system-default zone, offset-adjusted. */
  static LocalDate today() {
    return today(ZoneId.systemDefault());
  }

  /**
   * Debug: pretend "now" is {@code instant}. Time keeps ticking forward from there.
   * Equivalent to setting the offset to {@code instant - realNow}.
   *
   * @param instant the simulated current instant
   */
  public static void setDebugTime(Instant instant) {
    debugOffset = Duration.between(Instant.now(), instant);
  }

  /**
   * Debug: set the offset added to the real clock directly.
   *
   * @param offset the delta to add to the real clock
   */
  public static void setDebugOffset(Duration offset) {
    debugOffset = offset;
  }

  /** Debug: drop any simulated time and go back to the real clock. */
  public static void clearDebugTime() {
    debugOffset = null;
  }

  /**
   * The current debug offset, or {@code null} if using the real clock.
   *
   * @return the offset added to the real clock, or {@code null}
   */
  public static Duration getDebugOffset() {
    return debugOffset;
  }

  /** Result of parsing a possibly-ambiguous time string. */
  public record ParsedTime(LocalTime time, boolean ambiguous) {}

  /**
   * Parse a {@code "YYYY-MM-DD"} string to a {@link LocalDate}.
   *
   * @param str date string
   * @return the parsed date
   */
  public static LocalDate parsePlainDate(String str) {
    return LocalDate.parse(str);
  }

  /**
   * Strictly parse a {@code "H:M"}/{@code "HH:MM"} time string into {@code [hour, minute]}.
   * Rejects anything that isn't exactly two 1–2 digit numeric components in range (no seconds,
   * no am/pm suffix, no missing parts).
   *
   * @throws IllegalArgumentException if {@code str} is not a valid time string
   */
  private static int[] parseHourMinute(String str) {
    String[] parts = str.split(":");
    if (parts.length == 2 && parts[0].matches("[0-9]{1,2}") && parts[1].matches("[0-9]{1,2}")) {
      int h = Integer.parseInt(parts[0]);
      int m = Integer.parseInt(parts[1]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return new int[] {h, m};
      }
    }
    throw new IllegalArgumentException("Invalid time string: \"" + str + "\"");
  }

  /**
   * Parse a time string to a {@link LocalTime}.
   *
   * <p>Time strings may omit 24-hour notation for PM times. E.g. {@code "1:25"} means
   * 13:25. For h = 1–11, both AM (h) and PM (h+12) are candidates; for h = 12,
   * candidates are noon (12) and midnight (0); for h = 0 or &gt;= 13, only one
   * interpretation exists. The candidate that is &gt;= previous and closest to
   * previous is chosen.
   *
   * <p>Examples:
   * <pre>
   *   "8:24" after 7:26   → 8:24  (both 8:24 and 20:24 qualify; 8:24 is closer)
   *   "1:25" after 12:27  → 13:25 (1:25 is before 12:27; only PM qualifies)
   *   "12:30" after 11:40 → 12:30 (noon and midnight qualify; noon is closer)
   *   "11:41" after 11:41 → 11:41 (equal counts as valid; AM is the minimum)
   * </pre>
   *
   * <p>Returns {@code ambiguous=true} only when no candidate is &gt;= previous (a data error).
   *
   * @param str e.g. {@code "8:30"}, {@code "1:25"}, {@code "13:25"}
   * @param previous the previously resolved time, or {@code null}
   * @return the resolved time and whether it was ambiguous
   */
  public static ParsedTime parsePlainTime(String str, LocalTime previous) {
    int[] hm = parseHourMinute(str);
    int h = hm[0];
    int m = hm[1];

    // h = 0 or >= 13 have exactly one interpretation — return directly.
    if (h == 0 || h >= 13) {
      return new ParsedTime(LocalTime.of(h, m), false);
    }

    // h = 1–11: candidates are AM (h) and PM (h+12).
    // h = 12: candidates are noon (12) and midnight (0) — 12-hour clock ambiguity.
    LocalTime[] candidates = (h == 12)
        ? new LocalTime[] {LocalTime.of(12, m), LocalTime.of(0, m)}
        : new LocalTime[] {LocalTime.of(h, m), LocalTime.of(h + 12, m)};

    if (previous == null) {
      // No previous — return AM (first candidate).
      return new ParsedTime(candidates[0], false);
    }

    int prevMins = previous.getHour() * 60 + previous.getMinute();
    LocalTime best = null;
    int bestMins = Integer.MAX_VALUE;
    for (LocalTime t : candidates) {
      int mins = t.getHour() * 60 + t.getMinute();
      if (mins >= prevMins && mins < bestMins) {
        best = t;
        bestMins = mins;
      }
    }

    if (best != null) {
      return new ParsedTime(best, false);
    }

    // No candidate is >= previous — genuine data error; fall back to AM.
    return new ParsedTime(candidates[0], true);
  }

  /**
   * Resolve all time strings in a raw period list into concrete {@link Period} objects.
   *
   * @param periods raw period data with string start/end times
   * @return resolved periods with {@link LocalTime} start/end
   */
  public static List<Period> resolveScheduleTimes(List<PeriodData> periods) {
    LocalTime lastTime = null;
    List<Period> result = new ArrayList<>(periods.size());

    for (PeriodData p : periods) {
      boolean optional = p.tags().contains("optional");
      LocalTime start = parsePlainTime(p.start(), lastTime).time();
      LocalTime end = parsePlainTime(p.end(), start).time();
      // Don't advance lastTime for optional periods — they may run concurrently
      // with the previous period (e.g. Period 7 and Period Ext both at 15:39).
      if (!optional) {
        lastTime = end;
      }
      result.add(new Period(p.name(), start, end, p.tags(), p.teachers()));
    }

    return result;
  }

  /**
   * Number of calendar days between two instants. Both are projected onto UTC dates
   * to avoid DST edge cases (matching the JS implementation).
   *
   * @param a first instant
   * @param b second instant
   * @return whole days from {@code a} to {@code b} (negative if {@code b} precedes {@code a})
   */
  public static int daysBetween(Instant a, Instant b) {
    LocalDate dateA = a.atZone(ZoneOffset.UTC).toLocalDate();
    LocalDate dateB = b.atZone(ZoneOffset.UTC).toLocalDate();
    return (int) ChronoUnit.DAYS.between(dateA, dateB);
  }

  /**
   * Return a {@link LocalDateTime} at noon on the given date.
   *
   * @param date the date
   * @return noon on that date
   */
  public static LocalDateTime noon(LocalDate date) {
    return date.atTime(12, 0, 0);
  }

  /**
   * Does the span from {@code start} to {@code end} (exclusive) include a Saturday or Sunday?
   *
   * @param start start instant
   * @param end end instant
   * @param timezone the zone in which to evaluate weekday membership
   * @return whether the span crosses a weekend day
   */
  public static boolean includesWeekend(Instant start, Instant end, ZoneId timezone) {
    LocalDate d = start.atZone(timezone).toLocalDate();
    LocalDate endDate = end.atZone(timezone).toLocalDate();

    while (d.isBefore(endDate)) {
      int dow = d.getDayOfWeek().getValue(); // 1=Mon, 7=Sun
      if (dow == 6 || dow == 7) {
        return true;
      }
      d = d.plusDays(1);
    }
    return false;
  }
}

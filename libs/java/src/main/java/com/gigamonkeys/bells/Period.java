package com.gigamonkeys.bells;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

/**
 * A single resolved period within a {@link Schedule}: a name, concrete start/end wall-clock
 * times, tags, and a {@code teachers} flag. Periods are linked into a list via {@link #next}.
 */
public final class Period {

  private final String name;
  private final LocalTime start;
  private final LocalTime end;
  private final List<String> tags;
  private final boolean teachers;
  private Period next;

  /**
   * @param name the period's display name
   * @param start the wall-clock start time
   * @param end the wall-clock end time
   * @param tags the period's tags (never {@code null} treated as empty)
   * @param teachers whether this is a teacher-only period
   */
  public Period(String name, LocalTime start, LocalTime end, List<String> tags, boolean teachers) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.tags = tags == null ? List.of() : tags;
    this.teachers = teachers;
  }

  public String name() {
    return name;
  }

  public LocalTime start() {
    return start;
  }

  public LocalTime end() {
    return end;
  }

  public List<String> tags() {
    return tags;
  }

  public boolean teachers() {
    return teachers;
  }

  /**
   * @return the next active period in the schedule, or {@code null} if this is the last
   */
  public Period next() {
    return next;
  }

  void setNext(Period next) {
    this.next = next;
  }

  /**
   * @param date the date this period falls on
   * @param timezone the schedule's timezone
   * @return the instant this period starts
   */
  public Instant startInstant(LocalDate date, ZoneId timezone) {
    return date.atTime(start).atZone(timezone).toInstant();
  }

  /**
   * @param date the date this period falls on
   * @param timezone the schedule's timezone
   * @return the instant this period ends
   */
  public Instant endInstant(LocalDate date, ZoneId timezone) {
    return date.atTime(end).atZone(timezone).toInstant();
  }

  // Periods are half-open intervals [start, end): a period owns its start
  // instant but not its end (the end belongs to the following passing period,
  // break, or after-school span). This keeps every boundary instant in exactly
  // one interval rather than briefly falling into none.

  /**
   * @return whether this period starts strictly after {@code instant}
   */
  boolean isAfter(Instant instant, LocalDate date, ZoneId timezone) {
    return startInstant(date, timezone).isAfter(instant);
  }

  /**
   * @return whether this period ends at or before {@code instant}
   */
  boolean isBefore(Instant instant, LocalDate date, ZoneId timezone) {
    return !endInstant(date, timezone).isAfter(instant);
  }

  /**
   * @return whether {@code instant} falls in this period's half-open range [start, end)
   */
  boolean contains(Instant instant, LocalDate date, ZoneId timezone) {
    Instant s = startInstant(date, timezone);
    Instant e = endInstant(date, timezone);
    return !s.isAfter(instant) && instant.isBefore(e);
  }

  /**
   * Convert this period to an {@link Interval} on a given date.
   *
   * @param date the date
   * @param timezone the schedule's timezone
   * @return the corresponding interval
   */
  public Interval toInterval(LocalDate date, ZoneId timezone) {
    return new Interval(
        name,
        startInstant(date, timezone),
        endInstant(date, timezone),
        true,
        IntervalType.PERIOD,
        tags);
  }
}

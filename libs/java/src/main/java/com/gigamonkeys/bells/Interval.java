package com.gigamonkeys.bells;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * A contiguous span of time with a name and a type: a class period, passing time,
 * before/after school, or a multi-day break.
 */
public final class Interval {

  private final String name;
  private final Instant start;
  private final Instant end;
  private final boolean duringSchool;
  private final IntervalType type;
  private final List<String> tags;

  /**
   * @param name the interval's display name
   * @param start when the interval starts
   * @param end when the interval ends
   * @param duringSchool whether this interval is class time
   * @param type the interval's type
   * @param tags tags from the period's data (empty for non-period intervals)
   */
  public Interval(
      String name,
      Instant start,
      Instant end,
      boolean duringSchool,
      IntervalType type,
      List<String> tags) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.duringSchool = duringSchool;
    this.type = type;
    this.tags = tags == null ? List.of() : List.copyOf(tags);
  }

  public String name() {
    return name;
  }

  public Instant start() {
    return start;
  }

  public Instant end() {
    return end;
  }

  public boolean duringSchool() {
    return duringSchool;
  }

  public IntervalType type() {
    return type;
  }

  public List<String> tags() {
    return tags;
  }

  /**
   * Time remaining in this interval as of now.
   *
   * @return duration from now until {@link #end()}
   */
  public Duration left() {
    return left(DateTimes.now());
  }

  /**
   * Time remaining in this interval.
   *
   * @param now the reference instant
   * @return duration from {@code now} until {@link #end()}
   */
  public Duration left(Instant now) {
    return Duration.between(now, end);
  }

  /**
   * Time elapsed in this interval as of now.
   *
   * @return duration from {@link #start()} until now
   */
  public Duration done() {
    return done(DateTimes.now());
  }

  /**
   * Time elapsed in this interval.
   *
   * @param now the reference instant
   * @return duration from {@link #start()} until {@code now}
   */
  public Duration done(Instant now) {
    return Duration.between(start, now);
  }
}

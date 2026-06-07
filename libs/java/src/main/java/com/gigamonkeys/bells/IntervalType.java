package com.gigamonkeys.bells;

/**
 * The kind of {@link Interval} covering a moment in time.
 */
public enum IntervalType {
  /** A named class period. */
  PERIOD("period"),
  /** Passing time between two periods. */
  PASSING("passing"),
  /** Time before the first period of a school day. */
  BEFORE_SCHOOL("before-school"),
  /** Time after the last period of a school day. */
  AFTER_SCHOOL("after-school"),
  /** A multi-day break, weekend, or vacation. */
  BREAK("break");

  private final String label;

  IntervalType(String label) {
    this.label = label;
  }

  /**
   * @return the kebab-case label used in the JavaScript library (e.g. {@code "before-school"})
   */
  public String label() {
    return label;
  }

  @Override
  public String toString() {
    return label;
  }
}

package com.gigamonkeys.bells;

/**
 * A schedule-defined point in a day, used by the abstract-time API.
 *
 * <p>The {@link #toString()} of each constant is its wire label (e.g. {@code "start_of_period"}),
 * which is what appears in the string syntax and in warning messages.
 */
public enum TimeAnchor {
  /** The start of a numbered period (needs a period number to resolve). */
  START_OF_PERIOD("start_of_period"),
  /** The end of a numbered period (needs a period number to resolve). */
  END_OF_PERIOD("end_of_period"),
  /** The start of the first period of the day. */
  START_OF_DAY("start_of_day"),
  /** The end of the last period of the day. */
  END_OF_DAY("end_of_day"),
  /** Local midnight; well-defined on any date, school day or not. */
  MIDNIGHT("midnight");

  private final String label;

  TimeAnchor(String label) {
    this.label = label;
  }

  /**
   * @return the wire label (e.g. {@code "start_of_period"})
   */
  public String label() {
    return label;
  }

  /**
   * @param label a wire label
   * @return the matching anchor
   * @throws IllegalArgumentException if no anchor has that label
   */
  public static TimeAnchor fromLabel(String label) {
    for (TimeAnchor a : values()) {
      if (a.label.equals(label)) {
        return a;
      }
    }
    throw new IllegalArgumentException("Unknown anchor \"" + label + "\"");
  }

  @Override
  public String toString() {
    return label;
  }
}

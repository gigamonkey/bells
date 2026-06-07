package com.gigamonkeys.bells;

import java.util.List;

/**
 * A {@code dates["YYYY-MM-DD"]} override value, which is either a reference to a named
 * schedule or an inline list of periods. Exactly one of the two fields is non-null.
 *
 * @param scheduleName the referenced schedule name, or {@code null} if inline
 * @param periods an inline period list, or {@code null} if a named reference
 */
public record DateEntry(String scheduleName, List<PeriodData> periods) {

  /**
   * Create an entry that references a named schedule.
   *
   * @param name the schedule name
   * @return the entry
   */
  public static DateEntry named(String name) {
    return new DateEntry(name, null);
  }

  /**
   * Create an entry holding an inline period list.
   *
   * @param periods the inline periods
   * @return the entry
   */
  public static DateEntry inline(List<PeriodData> periods) {
    return new DateEntry(null, List.copyOf(periods));
  }

  /**
   * @return whether this entry references a named schedule
   */
  public boolean isName() {
    return scheduleName != null;
  }
}

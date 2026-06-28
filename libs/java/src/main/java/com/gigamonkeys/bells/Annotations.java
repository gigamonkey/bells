package com.gigamonkeys.bells;

import java.util.Map;

/**
 * Optional generic annotations attached to a calendar year. Three typed buckets keyed by,
 * respectively, an arbitrary id, a school-week number (string), and a {@code YYYY-MM-DD} date.
 * Purely additive: a calendar without annotations behaves exactly as before.
 *
 * @param ranges id → range annotation
 * @param weeks school-week-number string → annotation
 * @param dates {@code YYYY-MM-DD} → annotation
 */
public record Annotations(
    Map<String, RangeAnnotation> ranges,
    Map<String, Annotation> weeks,
    Map<String, Annotation> dates) {

  /** Canonicalize null buckets to empty maps. */
  public Annotations {
    ranges = ranges == null ? Map.of() : ranges;
    weeks = weeks == null ? Map.of() : weeks;
    dates = dates == null ? Map.of() : dates;
  }

  /**
   * @return an empty annotations structure
   */
  public static Annotations empty() {
    return new Annotations(Map.of(), Map.of(), Map.of());
  }
}

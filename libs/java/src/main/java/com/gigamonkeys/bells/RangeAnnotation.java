package com.gigamonkeys.bells;

import java.util.Map;

/**
 * A {@code ranges} annotation: an inclusive {@code start}/{@code end} span (each
 * {@code YYYY-MM-DD}) plus free-form payload. {@code label} and {@code kind} are conventional
 * fields in {@code rest}; any other keys are opaque payload.
 *
 * @param start the inclusive start date string
 * @param end the inclusive end date string
 * @param rest the remaining payload (everything except {@code start}/{@code end})
 */
public record RangeAnnotation(String start, String end, Map<String, Object> rest) {

  /** Canonicalize a null payload to an empty map. */
  public RangeAnnotation {
    rest = rest == null ? Map.of() : rest;
  }

  /**
   * @return the conventional {@code label}, or {@code null} if absent or not a string
   */
  public String label() {
    Object v = rest.get("label");
    return v instanceof String s ? s : null;
  }

  /**
   * @return the conventional {@code kind}, or {@code null} if absent or not a string
   */
  public String kind() {
    Object v = rest.get("kind");
    return v instanceof String s ? s : null;
  }
}

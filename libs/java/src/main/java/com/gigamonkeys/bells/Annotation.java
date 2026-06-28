package com.gigamonkeys.bells;

import java.util.Map;

/**
 * A free-form annotation payload (the value of a {@code weeks} or {@code dates} entry).
 * {@code label} and {@code kind} are conventional fields; any other keys are opaque payload
 * passed through untouched. A Java record can't be open-ended, so the arbitrary payload maps
 * to a {@code Map<String, Object>}.
 *
 * @param payload the full payload map (including {@code label}/{@code kind} if present)
 */
public record Annotation(Map<String, Object> payload) {

  /** Canonicalize a null payload to an empty map. */
  public Annotation {
    payload = payload == null ? Map.of() : payload;
  }

  /**
   * @return the conventional {@code label}, or {@code null} if absent or not a string
   */
  public String label() {
    Object v = payload.get("label");
    return v instanceof String s ? s : null;
  }

  /**
   * @return the conventional {@code kind}, or {@code null} if absent or not a string
   */
  public String kind() {
    Object v = payload.get("kind");
    return v instanceof String s ? s : null;
  }
}

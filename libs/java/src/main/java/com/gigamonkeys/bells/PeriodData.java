package com.gigamonkeys.bells;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Raw, unresolved period data as it appears in calendar JSON: a name, string start/end
 * times, optional tags, and an optional {@code teachers} flag.
 *
 * @param name the period's display name
 * @param start the start time string (e.g. {@code "8:30"}, {@code "1:25"})
 * @param end the end time string
 * @param tags the period's tags (never {@code null}; empty if absent)
 * @param teachers whether this is a teacher-only period
 */
public record PeriodData(String name, String start, String end, List<String> tags, boolean teachers) {

  /** Canonicalize so {@code tags} is never null. */
  public PeriodData {
    tags = tags == null ? List.of() : List.copyOf(tags);
  }

  /**
   * Build a {@link PeriodData} from a JSON object node.
   *
   * @param node a JSON object describing a period
   * @return the parsed period data
   */
  public static PeriodData fromJson(JsonNode node) {
    String name = textOrNull(node, "name");
    String start = textOrNull(node, "start");
    String end = textOrNull(node, "end");

    List<String> tags = new ArrayList<>();
    JsonNode tagsNode = node.get("tags");
    if (tagsNode != null && tagsNode.isArray()) {
      for (JsonNode t : tagsNode) {
        tags.add(t.asText());
      }
    }

    boolean teachers = node.has("teachers") && node.get("teachers").asBoolean(false);

    return new PeriodData(name, start, end, Collections.unmodifiableList(tags), teachers);
  }

  private static String textOrNull(JsonNode node, String field) {
    JsonNode v = node.get(field);
    return (v == null || v.isNull()) ? null : v.asText();
  }
}

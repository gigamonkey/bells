package com.gigamonkeys.bells;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Configuration for a {@link BellSchedule}: the viewer's role and which optional period
 * tags to include on each weekday.
 *
 * <p>{@code includeTags} maps an ISO day-of-week number (1=Mon … 7=Sun) to the list of
 * optional tags to include that day. A flat list applies the same tags Monday–Friday.
 */
public final class Options {

  /** The default role used when none is specified. */
  public static final String STUDENT = "student";

  /** The teacher role. */
  public static final String TEACHER = "teacher";

  private final String role;
  private final Map<Integer, List<String>> includeTags;

  /**
   * @param role {@code "student"} (default) or {@code "teacher"}; {@code null} → student
   * @param includeTags normalized per-weekday tag map (never {@code null})
   */
  public Options(String role, Map<Integer, List<String>> includeTags) {
    this.role = (role == null) ? STUDENT : role;
    this.includeTags = includeTags == null ? Map.of() : includeTags;
  }

  /**
   * @return default options: student role, no optional periods
   */
  public static Options defaults() {
    return new Options(STUDENT, Map.of());
  }

  /**
   * Build options from a role and a per-weekday tag map.
   *
   * @param role the role
   * @param includeTags a per-weekday tag map (1=Mon … 7=Sun)
   * @return the options
   */
  public static Options of(String role, Map<Integer, List<String>> includeTags) {
    return new Options(role, includeTags);
  }

  /**
   * Build options from a role and a flat tag list applied Monday–Friday.
   *
   * @param role the role
   * @param includeTags tags to include each weekday
   * @return the options
   */
  public static Options ofFlat(String role, List<String> includeTags) {
    return new Options(role, normalizeIncludeTags(includeTags));
  }

  /**
   * @return the role ({@code "student"} or {@code "teacher"})
   */
  public String role() {
    return role;
  }

  /**
   * @return the normalized per-weekday tag map
   */
  public Map<Integer, List<String>> includeTags() {
    return includeTags;
  }

  /**
   * Normalize a flat tag list into a per-weekday map: the same list for days 1–5
   * (Monday–Friday), nothing for days 6 and 7.
   *
   * @param flat tags to apply each weekday, or {@code null}
   * @return a per-weekday map
   */
  public static Map<Integer, List<String>> normalizeIncludeTags(List<String> flat) {
    Map<Integer, List<String>> map = new HashMap<>();
    if (flat != null) {
      for (int day = 1; day <= 5; day++) {
        map.put(day, flat);
      }
    }
    return map;
  }

  /**
   * Normalize an already-keyed tag map, returning an empty map for {@code null}.
   *
   * @param map a per-weekday tag map, or {@code null}
   * @return the map, or an empty map
   */
  public static Map<Integer, List<String>> normalizeIncludeTags(Map<Integer, List<String>> map) {
    return map == null ? new HashMap<>() : map;
  }
}

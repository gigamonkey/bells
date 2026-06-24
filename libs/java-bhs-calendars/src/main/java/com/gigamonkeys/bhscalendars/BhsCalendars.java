package com.gigamonkeys.bhscalendars;

import com.gigamonkeys.bells.CalendarData;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Bundled BHS-area school bell-schedule calendar data.
 *
 * <p>Java counterpart of the npm {@code @peterseibel/bhs-calendars} package: ships the
 * per-year calendar JSON for Berkeley High and nearby middle schools as classpath
 * resources and exposes it parsed into {@link CalendarData}.
 *
 * <p>Group by {@link CalendarData#id()} (or use {@link #byId()}) to assemble the year
 * sequence for a single school; a {@link com.gigamonkeys.bells.BellSchedule} consumes one
 * such group.
 */
public final class BhsCalendars {

  private static final String BASE = "/bhs-calendars/";

  private BhsCalendars() {}

  /**
   * All bundled yearly calendar objects as a flat list (parallels the npm default export).
   * Each entry is one school-year.
   *
   * @return every bundled year's parsed calendar data
   */
  public static List<CalendarData> loadAll() {
    List<CalendarData> out = new ArrayList<>();
    for (String name : resourceNames()) {
      out.addAll(CalendarData.parse(readResource(BASE + name)));
    }
    return out;
  }

  /**
   * {@link #loadAll()} grouped by {@link CalendarData#id()}, each group's years sorted
   * chronologically by {@code firstDay}.
   *
   * @return school id (e.g. {@code "bhs"}, {@code "king-6"}) to that school's years
   */
  public static Map<String, List<CalendarData>> byId() {
    Map<String, List<CalendarData>> groups = new LinkedHashMap<>();
    for (CalendarData year : loadAll()) {
      groups.computeIfAbsent(year.id(), k -> new ArrayList<>()).add(year);
    }
    for (List<CalendarData> years : groups.values()) {
      years.sort(Comparator.comparing(CalendarData::firstDay));
    }
    return groups;
  }

  /** Read the bundled {@code index.txt} listing the data file names, one per line. */
  private static List<String> resourceNames() {
    List<String> names = new ArrayList<>();
    try (InputStream in = BhsCalendars.class.getResourceAsStream(BASE + "index.txt")) {
      if (in == null) {
        throw new IllegalStateException("Missing bundled resource " + BASE + "index.txt");
      }
      BufferedReader reader =
          new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
      String line;
      while ((line = reader.readLine()) != null) {
        String trimmed = line.trim();
        if (!trimmed.isEmpty()) {
          names.add(trimmed);
        }
      }
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return names;
  }

  private static String readResource(String path) {
    try (InputStream in = BhsCalendars.class.getResourceAsStream(path)) {
      if (in == null) {
        throw new IllegalStateException("Missing bundled resource " + path);
      }
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

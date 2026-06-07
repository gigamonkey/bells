package com.gigamonkeys.bells;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-year calendar file loader. Loads {@code {year}.json} files (e.g.
 * {@code 2025-2026.json}) from a directory path or a base URL and builds {@link BellSchedule}
 * instances from them.
 */
public final class Calendars {

  private final String basePath;
  private final Map<String, List<CalendarData>> cache = new HashMap<>();
  private final HttpClient httpClient = HttpClient.newHttpClient();

  /**
   * @param basePath a directory path (e.g. {@code "./calendars/"}) or URL base
   *     (e.g. {@code "https://example.com/calendars/"})
   */
  public Calendars(String basePath) {
    this.basePath = basePath;
  }

  private List<CalendarData> load(String year) {
    List<CalendarData> cached = cache.get(year);
    if (cached != null) {
      return cached;
    }

    String location = basePath + year + ".json";
    String text;

    if (basePath.startsWith("http://") || basePath.startsWith("https://")) {
      try {
        HttpRequest request = HttpRequest.newBuilder(URI.create(location)).GET().build();
        HttpResponse<String> response =
            httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
          throw new IOException("Failed to fetch " + location + ": HTTP " + response.statusCode());
        }
        text = response.body();
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new RuntimeException("Interrupted while fetching " + location, e);
      }
    } else {
      try {
        text = Files.readString(Path.of(location), StandardCharsets.UTF_8);
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
    }

    List<CalendarData> data = CalendarData.parse(text);
    cache.put(year, data);
    return data;
  }

  /**
   * Build a {@link BellSchedule} for a specific academic year, with default options.
   *
   * @param year e.g. {@code "2025-2026"}
   * @return the bell schedule
   */
  public BellSchedule forYear(String year) {
    return forYear(year, Options.defaults());
  }

  /**
   * Build a {@link BellSchedule} for a specific academic year.
   *
   * @param year e.g. {@code "2025-2026"}
   * @param options the viewer options
   * @return the bell schedule
   */
  public BellSchedule forYear(String year, Options options) {
    return new BellSchedule(load(year), options);
  }

  /**
   * Build a {@link BellSchedule} appropriate for the current instant, using the system-default
   * timezone to evaluate "today".
   *
   * @param options the viewer options
   * @return the bell schedule
   */
  public BellSchedule current(Options options) {
    return current(ZoneId.systemDefault(), options);
  }

  /**
   * Build a {@link BellSchedule} appropriate for the current instant. During summer, also
   * loads the adjacent year so summer-bounds and next-year-start queries work correctly.
   *
   * @param zone the timezone in which to evaluate "today"
   * @param options the viewer options
   * @return the bell schedule
   */
  public BellSchedule current(ZoneId zone, Options options) {
    LocalDate today = LocalDate.now(zone);
    String year = academicYearFor(today);

    List<CalendarData> primary = load(year);
    CalendarData first = primary.get(0);
    // Treat an empty firstDayTeachers as absent (matches the JS `|| firstDay`).
    String firstDay =
        (first.firstDayTeachers() == null || first.firstDayTeachers().isEmpty())
            ? first.firstDay()
            : first.firstDayTeachers();
    String lastDay = first.lastDay();
    String todayStr = today.toString();
    boolean inYear = todayStr.compareTo(firstDay) >= 0 && todayStr.compareTo(lastDay) <= 0;

    if (inYear) {
      return new BellSchedule(primary, options);
    }

    // Summer — load the adjacent year.
    List<CalendarData> allData = new java.util.ArrayList<>(primary);

    if (todayStr.compareTo(lastDay) > 0) {
      // After this year's end — load the next academic year.
      try {
        allData.addAll(load(nextAcademicYear(year)));
      } catch (RuntimeException ignored) {
        // Next year data not available; that's fine.
      }
    } else {
      // Before this year's start — load the previous academic year.
      try {
        allData.addAll(0, load(prevAcademicYear(year)));
      } catch (RuntimeException ignored) {
        // Previous year data not available; that's fine.
      }
    }

    return new BellSchedule(allData, options);
  }

  /**
   * Determine the academic-year label for a date. The academic year starts in August.
   *
   * @param date a date
   * @return e.g. {@code "2025-2026"}
   */
  static String academicYearFor(LocalDate date) {
    int month = date.getMonthValue();
    int year = date.getYear();
    if (month >= 8) {
      return year + "-" + (year + 1);
    } else {
      return (year - 1) + "-" + year;
    }
  }

  static String nextAcademicYear(String year) {
    int start = Integer.parseInt(year.split("-")[0]);
    return (start + 1) + "-" + (start + 2);
  }

  static String prevAcademicYear(String year) {
    int start = Integer.parseInt(year.split("-")[0]);
    return (start - 1) + "-" + start;
  }
}

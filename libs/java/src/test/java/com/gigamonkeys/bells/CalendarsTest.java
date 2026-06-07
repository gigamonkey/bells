package com.gigamonkeys.bells;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CalendarsTest {

  private static final String YEAR =
      """
      {
        "year": "2025-2026",
        "id": "loader-test",
        "name": "Loader Test",
        "timezone": "America/Los_Angeles",
        "firstDay": "2025-08-13",
        "lastDay": "2026-06-04",
        "schedules": { "NORMAL": [ { "name": "Period 1", "start": "8:30", "end": "9:28" } ] }
      }
      """;

  private static Calendars write(Path dir, String json) throws IOException {
    Files.writeString(dir.resolve("2025-2026.json"), json);
    return new Calendars(dir.toString() + "/");
  }

  @Test
  void forYearLoadsArrayFile(@TempDir Path dir) throws IOException {
    Calendars cals = write(dir, "[" + YEAR + "]");
    BellSchedule bs = cals.forYear("2025-2026", Options.defaults());
    assertEquals("America/Los_Angeles", bs.timezone());
    assertTrue(bs.isSchoolDay(LocalDate.parse("2025-08-13"))); // Wednesday
    assertFalse(bs.isSchoolDay(LocalDate.parse("2025-08-16"))); // Saturday
  }

  @Test
  void forYearLoadsSingleObjectFile(@TempDir Path dir) throws IOException {
    // A file holding a single year object (not an array) is normalized.
    // Also exercises the default-options forYear(String) overload.
    Calendars cals = write(dir, YEAR);
    BellSchedule bs = cals.forYear("2025-2026");
    assertEquals("America/Los_Angeles", bs.timezone());
  }

  @Test
  void cachesLoadedYear(@TempDir Path dir) throws IOException {
    Calendars cals = write(dir, "[" + YEAR + "]");
    cals.forYear("2025-2026", Options.defaults());
    Files.delete(dir.resolve("2025-2026.json")); // cached load must still succeed
    assertEquals("America/Los_Angeles", cals.forYear("2025-2026", Options.defaults()).timezone());
  }
}

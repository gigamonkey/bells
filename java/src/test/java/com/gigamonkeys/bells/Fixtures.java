package com.gigamonkeys.bells;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/** Shared test fixtures and helpers. */
final class Fixtures {

  static final ZoneId LA = ZoneId.of("America/Los_Angeles");

  private Fixtures() {}

  /** Calendar data with a NORMAL and LATE_START schedule, mirroring calendar.test.js. */
  static final String CALENDAR_DATA =
      """
      {
        "year": "2025-2026",
        "timezone": "America/Los_Angeles",
        "firstDay": "2025-08-13",
        "firstDayTeachers": "2025-08-11",
        "lastDay": "2026-06-04",
        "schedules": {
          "NORMAL": [
            { "name": "Period 0",   "start": "7:26",  "end": "8:24",  "tags": ["optional", "zero"] },
            { "name": "Period 1",   "start": "8:30",  "end": "9:28" },
            { "name": "Period 2",   "start": "9:34",  "end": "10:37" },
            { "name": "Period 3",   "start": "10:43", "end": "11:41" },
            { "name": "Lunch",      "start": "11:42", "end": "12:22" },
            { "name": "Period 4",   "start": "12:27", "end": "13:25" },
            { "name": "Period 5",   "start": "13:31", "end": "14:29" },
            { "name": "Period 6",   "start": "14:35", "end": "15:33" },
            { "name": "Period 7",   "start": "15:39", "end": "16:37", "tags": ["optional", "seventh"] },
            { "name": "Period Ext", "start": "15:39", "end": "17:09", "tags": ["optional", "ext"] }
          ],
          "LATE_START": [
            { "name": "Staff meeting", "start": "8:03",  "end": "9:33", "teachers": true },
            { "name": "Period 1",      "start": "10:00", "end": "10:43" },
            { "name": "Period 2",      "start": "10:49", "end": "11:37" },
            { "name": "Period 3",      "start": "11:43", "end": "12:26" },
            { "name": "Lunch",         "start": "12:26", "end": "13:06" },
            { "name": "Period 4",      "start": "13:12", "end": "13:55" },
            { "name": "Period 5",      "start": "14:01", "end": "14:44" },
            { "name": "Period 6",      "start": "14:50", "end": "15:33" }
          ]
        },
        "weekdaySchedules": { "monday": "LATE_START" },
        "holidays": ["2025-09-01", "2025-11-27"],
        "teacherWorkDays": [],
        "breakNames": { "2025-11-26": "Thanksgiving Break" }
      }
      """;

  /** Simpler two-period fixture mirroring bell-schedule.test.js. */
  static final String SIMPLE_DATA =
      """
      {
        "year": "2025-2026",
        "timezone": "America/Los_Angeles",
        "firstDay": "2025-08-13",
        "lastDay": "2026-06-04",
        "schedules": {
          "NORMAL": [
            { "name": "Period 1", "start": "8:30", "end": "9:28" },
            { "name": "Period 2", "start": "9:34", "end": "10:37" }
          ],
          "LATE_START": [
            { "name": "Period 1", "start": "10:00", "end": "10:43" },
            { "name": "Period 2", "start": "10:49", "end": "11:37" }
          ]
        },
        "weekdaySchedules": { "monday": "LATE_START" },
        "holidays": ["2025-09-01", "2025-11-27", "2025-11-28"],
        "teacherWorkDays": [],
        "breakNames": {}
      }
      """;

  static LocalDate pd(String s) {
    return LocalDate.parse(s);
  }

  static Instant laInstant(String isoLocal) {
    return LocalDateTime.parse(isoLocal).atZone(LA).toInstant();
  }

  static Calendar calendar(String json, Options options) {
    return new Calendar(CalendarData.fromYearJson(CalendarData.readTree(json)), options);
  }
}

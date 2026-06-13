package com.gigamonkeys.bells;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The string syntax for abstract times: {@link #parseTime} and {@link #formatTime}, plus the
 * {@code "[-+]HH:MM"} offset helper. Everything that needs a calendar lives on {@link BellSchedule}.
 *
 * <p>Java counterpart of the TypeScript {@code abstract-time.ts} module.
 */
public final class AbstractTimes {

  private AbstractTimes() {}

  private static final Map<String, Integer> WEEKDAY_NUMBERS = Map.ofEntries(
      Map.entry("monday", 1), Map.entry("mon", 1),
      Map.entry("tuesday", 2), Map.entry("tue", 2),
      Map.entry("wednesday", 3), Map.entry("wed", 3),
      Map.entry("thursday", 4), Map.entry("thu", 4),
      Map.entry("friday", 5), Map.entry("fri", 5),
      Map.entry("saturday", 6), Map.entry("sat", 6),
      Map.entry("sunday", 7), Map.entry("sun", 7));

  static final Map<Integer, String> WEEKDAY_NAMES = Map.of(
      1, "monday",
      2, "tuesday",
      3, "wednesday",
      4, "thursday",
      5, "friday",
      6, "saturday",
      7, "sunday");

  private static final Pattern OFFSET = Pattern.compile("^([+-]?)(\\d{1,2}):(\\d{2})$");

  // A signed time-offset token: the string syntax requires the sign.
  private static final Pattern OFFSET_TOKEN = Pattern.compile("^[+-]\\d{1,2}:\\d{2}$");

  private static final Pattern ISO_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

  private static final Pattern SIGNED_INT = Pattern.compile("^[+-]\\d+$");

  /**
   * Parse an {@code "[-+]HH:MM"} offset into signed minutes. The sign is optional here (stored
   * offsets may be unsigned, e.g. {@code "00:00"}); the string syntax requires it so an offset
   * token is unambiguous.
   *
   * @param offset the offset string
   * @return signed minutes
   * @throws IllegalArgumentException on a malformed offset
   */
  public static int parseOffsetMinutes(String offset) {
    Matcher m = OFFSET.matcher(offset);
    if (m.matches()) {
      int minutes = Integer.parseInt(m.group(3));
      if (minutes <= 59) {
        int total = Integer.parseInt(m.group(2)) * 60 + minutes;
        return m.group(1).equals("-") ? -total : total;
      }
    }
    throw new IllegalArgumentException("Invalid time offset \"" + offset + "\"");
  }

  private static String formatOffset(int minutes) {
    String sign = minutes < 0 ? "-" : "+";
    int abs = Math.abs(minutes);
    return String.format("%s%02d:%02d", sign, abs / 60, abs % 60);
  }

  private static DaySpec parseDayPart(List<String> tokens) {
    String joined = String.join(" ", tokens);

    if (tokens.size() == 1) {
      String tok = tokens.get(0);
      if (ISO_DATE.matcher(tok).matches()) {
        try {
          LocalDate.parse(tok);
        } catch (DateTimeParseException e) {
          throw new IllegalArgumentException("Invalid date \"" + tok + "\"");
        }
        return new DaySpec.AbsoluteDate(tok);
      }
      Integer weekday = WEEKDAY_NUMBERS.get(tok);
      if (weekday != null) {
        return new DaySpec.Weekday(weekday);
      }
      throw new IllegalArgumentException("Unrecognized day part \"" + joined + "\"");
    }

    if (tokens.size() == 2) {
      if (tokens.get(0).equals("next") && tokens.get(1).equals("week")) {
        return new DaySpec.Week("start", 1);
      }
      if (SIGNED_INT.matcher(tokens.get(0)).matches()) {
        int n = Integer.parseInt(tokens.get(0));
        if (tokens.get(1).equals("day") || tokens.get(1).equals("days")) {
          return new DaySpec.SchoolDays(n);
        }
        if (tokens.get(1).equals("week") || tokens.get(1).equals("weeks")) {
          return new DaySpec.Weeks(n);
        }
      }
      throw new IllegalArgumentException("Unrecognized day part \"" + joined + "\"");
    }

    if ((tokens.get(0).equals("start") || tokens.get(0).equals("end")) && tokens.get(1).equals("of")) {
      if (tokens.size() == 3 && tokens.get(2).equals("week")) {
        return new DaySpec.Week(tokens.get(0), 0);
      }
      if (tokens.size() == 4 && tokens.get(2).equals("next") && tokens.get(3).equals("week")) {
        return new DaySpec.Week(tokens.get(0), 1);
      }
    }

    throw new IllegalArgumentException("Unrecognized day part \"" + joined + "\"");
  }

  /**
   * Parse the compact one-line syntax: {@code anchor [time-offset] [day-part]}, whitespace-separated,
   * case-insensitive. E.g. {@code "end_of_period -00:05"}, {@code "start_of_day next week"},
   * {@code "end_of_day +1 day"}. Throws on unknown anchors, malformed offsets, and unrecognized
   * day parts.
   *
   * @param spec the string spec
   * @return the parsed abstract time
   */
  public static AbstractTime parseTime(String spec) {
    List<String> tokens = new ArrayList<>();
    for (String s : spec.trim().toLowerCase(Locale.ROOT).split("\\s+")) {
      if (!s.isEmpty()) {
        tokens.add(s);
      }
    }
    if (tokens.isEmpty()) {
      throw new IllegalArgumentException("Empty abstract-time spec");
    }

    TimeAnchor anchor = TimeAnchor.fromLabel(tokens.remove(0));

    String offset = null;
    if (!tokens.isEmpty() && OFFSET_TOKEN.matcher(tokens.get(0)).matches()) {
      offset = tokens.remove(0);
      parseOffsetMinutes(offset); // validate (e.g. minutes <= 59)
    }

    DaySpec day = tokens.isEmpty() ? null : parseDayPart(tokens);
    return new AbstractTime(anchor, day, offset);
  }

  private static String formatCount(int n, String unit) {
    int abs = Math.abs(n);
    return (n < 0 ? "-" : "+") + abs + " " + unit + (abs == 1 ? "" : "s");
  }

  private static String formatDayPart(DaySpec day) {
    if (day instanceof DaySpec.AbsoluteDate d) {
      return d.date();
    }
    if (day instanceof DaySpec.SchoolDays d) {
      return formatCount(d.n(), "day");
    }
    if (day instanceof DaySpec.Weeks d) {
      return formatCount(d.n(), "week");
    }
    if (day instanceof DaySpec.Weekday d) {
      String name = WEEKDAY_NAMES.get(d.weekday());
      if (name == null) {
        throw new IllegalArgumentException(
            "Invalid weekday " + d.weekday() + " (must be 1=Monday..7=Sunday)");
      }
      return name;
    }
    if (day instanceof DaySpec.Week d) {
      if (d.n() == 0) {
        return d.edge() + " of week";
      }
      if (d.n() == 1) {
        return d.edge() + " of next week";
      }
      throw new IllegalArgumentException(
          "Cannot format week spec with n=" + d.n() + " (string syntax covers n=0 and n=1)");
    }
    throw new IllegalArgumentException("Unknown day spec");
  }

  /**
   * Canonical string form of an abstract time; round-trips through {@link #parseTime}.
   *
   * @param t the abstract time
   * @return the canonical string
   */
  public static String formatTime(AbstractTime t) {
    List<String> parts = new ArrayList<>();
    parts.add(t.anchor().label());
    int offset = parseOffsetMinutes(t.offset() == null ? "+00:00" : t.offset());
    if (offset != 0) {
      parts.add(formatOffset(offset));
    }
    if (t.day() != null) {
      parts.add(formatDayPart(t.day()));
    }
    return String.join(" ", parts);
  }
}

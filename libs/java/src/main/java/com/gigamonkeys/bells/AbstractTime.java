package com.gigamonkeys.bells;

/**
 * A fully abstract time, before day binding: a {@link TimeAnchor}, an optional {@link DaySpec}
 * ({@code null} = the base date), and an optional {@code "[-+]HH:MM"} offset ({@code null} =
 * {@code "+00:00"}).
 *
 * @param anchor the schedule-defined point
 * @param day which day, or {@code null} for the base date
 * @param offset a signed {@code HH:MM} offset, or {@code null} for none
 */
public record AbstractTime(TimeAnchor anchor, DaySpec day, String offset) {}

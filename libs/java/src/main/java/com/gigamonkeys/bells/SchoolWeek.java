package com.gigamonkeys.bells;

import java.time.LocalDate;

/**
 * A canonical school week: a Monday-anchored ISO week containing at least one school day.
 * School weeks are numbered 1..n in chronological order over {@code [firstDay, lastDay]};
 * full-week breaks get no number and are skipped, so the numbering is dense.
 *
 * @param number the 1-based school-week number
 * @param monday the Monday anchoring the ISO week
 * @param firstSchoolDay the first school day in the week
 * @param lastSchoolDay the last school day in the week
 * @param schoolDayCount the number of school days in the week
 */
public record SchoolWeek(
    int number,
    LocalDate monday,
    LocalDate firstSchoolDay,
    LocalDate lastSchoolDay,
    int schoolDayCount) {}

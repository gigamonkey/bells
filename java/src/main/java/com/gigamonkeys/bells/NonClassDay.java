package com.gigamonkeys.bells;

import java.time.LocalDate;

/**
 * A school day on which no regular classes are held, with a descriptive label
 * (e.g. {@code "exam"}, {@code "bonus"}).
 *
 * @param date the date
 * @param label the non-class label
 */
public record NonClassDay(LocalDate date, String label) {}

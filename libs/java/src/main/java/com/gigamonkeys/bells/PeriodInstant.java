package com.gigamonkeys.bells;

import java.time.Instant;
import java.util.List;

/**
 * A period resolved to absolute instants for a particular date, as returned by
 * {@link BellSchedule#scheduleFor} and {@link BellSchedule#periodsForDate}.
 *
 * @param name the period's display name
 * @param start the instant the period starts
 * @param end the instant the period ends
 * @param tags the period's tags
 */
public record PeriodInstant(String name, Instant start, Instant end, List<String> tags) {}

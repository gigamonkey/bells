package com.gigamonkeys.bells;

import java.time.Instant;

/**
 * Start/end of a school day. Both endpoints are non-null.
 *
 * @param start the start of the school day
 * @param end the end of the school day
 */
public record DayBounds(Instant start, Instant end) {}

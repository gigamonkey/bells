package com.gigamonkeys.bells;

import java.time.Instant;

/**
 * A start/end pair of instants. Used for day bounds and summer bounds. For summer bounds,
 * either endpoint may be {@code null} when adjacent-year data is unavailable.
 *
 * @param start the start instant, or {@code null}
 * @param end the end instant, or {@code null}
 */
public record Bounds(Instant start, Instant end) {}

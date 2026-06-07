package com.gigamonkeys.bells;

import java.time.Instant;

/**
 * Start/end of summer. Either endpoint may be {@code null} when adjacent-year data is
 * unavailable (mirrors the TS {@code SummerBounds}, whose fields are nullable).
 *
 * @param start the end of the previous school year, or {@code null}
 * @param end the start of the next school year, or {@code null}
 */
public record SummerBounds(Instant start, Instant end) {}

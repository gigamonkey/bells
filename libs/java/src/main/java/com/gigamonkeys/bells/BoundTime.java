package com.gigamonkeys.bells;

/**
 * An abstract time after day binding: a concrete date, the anchor, and a normalized offset. The
 * period (if the anchor needs one) is still unbound until {@link BellSchedule#resolveTime}.
 *
 * @param date an ISO date ({@code "YYYY-MM-DD"})
 * @param anchor the schedule-defined point
 * @param offset a {@code "[-+]HH:MM"} offset (never {@code null})
 */
public record BoundTime(String date, TimeAnchor anchor, String offset) {}

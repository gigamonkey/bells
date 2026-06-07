"""Pure date/time utilities for the bells library.

This is the Python counterpart of the JavaScript ``datetime.js`` module. Where
the JS library leans on the Temporal API, the Python port uses the standard
library:

- ``Temporal.PlainDate``     → :class:`datetime.date`
- ``Temporal.PlainTime``     → :class:`datetime.time`
- ``Temporal.Instant``       → timezone-aware :class:`datetime.datetime` in UTC
- ``Temporal.Duration``      → :class:`datetime.timedelta`
- ``Temporal.PlainDateTime`` → naive :class:`datetime.datetime`

An "instant" throughout this package is an aware ``datetime`` normalized to
UTC, so two instants always compare correctly regardless of how they were
constructed.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import NamedTuple, Optional
from zoneinfo import ZoneInfo


class ParsedTime(NamedTuple):
    """Result of :func:`parse_plain_time`."""

    time: time
    ambiguous: bool


def parse_plain_date(s: str) -> date:
    """Parse a ``"YYYY-MM-DD"`` string into a :class:`datetime.date`."""
    return date.fromisoformat(s)


def _parse_hour_minute(s: str) -> tuple[int, int]:
    """Strictly parse a ``"H:M"``/``"HH:MM"`` string into ``(hour, minute)``.

    Rejects anything that isn't exactly two 1–2 digit numeric components in
    range (no seconds, no am/pm suffix, no missing parts).
    """
    parts = s.split(":")
    if len(parts) == 2 and all(1 <= len(p) <= 2 and p.isascii() and p.isdigit() for p in parts):
        h, m = int(parts[0]), int(parts[1])
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h, m
    raise ValueError(f'Invalid time string: "{s}"')


def parse_plain_time(s: str, previous: Optional[time]) -> ParsedTime:
    """Parse a time string into a :class:`datetime.time`.

    Time strings may omit 24-hour notation for PM times. E.g. ``"1:25"`` means
    13:25. For ``h`` in 1–11, both AM (``h``) and PM (``h+12``) are candidates;
    for ``h == 12`` the candidates are noon (12) and midnight (0); for ``h == 0``
    or ``h >= 13`` only one interpretation exists. The candidate that is
    ``>= previous`` and closest to ``previous`` is chosen.

    Examples::

        "8:24"  after 7:26   → 8:24  (both 8:24 and 20:24 qualify; 8:24 is closer)
        "1:25"  after 12:27  → 13:25 (1:25 is before 12:27; only PM qualifies)
        "12:30" after 11:40  → 12:30 (noon and midnight qualify; noon is closer)
        "11:41" after 11:41  → 11:41 (equal counts as valid; AM is the minimum)

    Returns ``ambiguous=True`` only when no candidate is ``>= previous`` (a data
    error); the AM candidate is returned in that case.
    """
    h, m = _parse_hour_minute(s)

    # h == 0 or h >= 13 have exactly one interpretation — return directly.
    if h == 0 or h >= 13:
        return ParsedTime(time(hour=h, minute=m), False)

    # h = 1–11: candidates are AM (h) and PM (h+12).
    # h = 12: candidates are noon (12) and midnight (0) — 12-hour clock ambiguity.
    if h == 12:
        candidates = [time(hour=12, minute=m), time(hour=0, minute=m)]
    else:
        candidates = [time(hour=h, minute=m), time(hour=h + 12, minute=m)]

    if previous is None:
        # No previous — return AM (smallest candidate).
        return ParsedTime(candidates[0], False)

    prev_minutes = previous.hour * 60 + previous.minute
    valid = [t for t in candidates if t.hour * 60 + t.minute >= prev_minutes]

    if valid:
        # Pick the minimum valid interpretation (closest to previous).
        chosen = min(valid, key=lambda t: t.hour * 60 + t.minute)
        return ParsedTime(chosen, False)

    # No candidate is >= previous — genuine data error; fall back to AM.
    return ParsedTime(candidates[0], True)


def resolve_schedule_times(periods: list[dict]) -> list[dict]:
    """Resolve all time strings in a raw period list.

    Returns a new list of period dicts with ``start`` and ``end`` replaced by
    :class:`datetime.time` values. Other fields are preserved.
    """
    last_time: Optional[time] = None
    result: list[dict] = []

    for p in periods:
        optional = "optional" in (p.get("tags") or [])
        start = parse_plain_time(p["start"], last_time).time
        end = parse_plain_time(p["end"], start).time
        # Don't advance last_time for optional periods — they may run
        # concurrently with the previous period (e.g. Period 7 and Period Ext
        # both at 15:39).
        if not optional:
            last_time = end
        result.append({**p, "start": start, "end": end})

    return result


def plain_to_instant(d: date, t: time, tz: str) -> datetime:
    """Combine a date and wall-clock time in timezone ``tz`` into a UTC instant."""
    aware = datetime.combine(d, t, tzinfo=ZoneInfo(tz))
    return aware.astimezone(timezone.utc)


def instant_to_date(instant: datetime, tz: str) -> date:
    """Return the calendar date of ``instant`` as observed in timezone ``tz``."""
    return instant.astimezone(ZoneInfo(tz)).date()


def now_instant() -> datetime:
    """The current moment as a UTC instant (counterpart of ``Temporal.Now.instant()``)."""
    return datetime.now(timezone.utc)


def noon(d: date) -> datetime:
    """A naive :class:`datetime` at noon on ``d`` (counterpart of ``noon`` in JS)."""
    return datetime.combine(d, time(hour=12, minute=0, second=0))


def days_between(a: datetime, b: datetime) -> int:
    """Number of calendar days between two instants.

    Compares the two instants as dates in UTC to avoid DST edge cases, mirroring
    the JS implementation.
    """
    date_a = a.astimezone(timezone.utc).date()
    date_b = b.astimezone(timezone.utc).date()
    return (date_b - date_a).days


def includes_weekend(start: datetime, end: datetime, tz: str) -> bool:
    """Does the span ``[start, end)`` include a Saturday or Sunday in ``tz``?"""
    d = instant_to_date(start, tz)
    end_date = instant_to_date(end, tz)

    while d < end_date:
        if d.isoweekday() in (6, 7):  # 6=Sat, 7=Sun
            return True
        d = d + timedelta(days=1)
    return False

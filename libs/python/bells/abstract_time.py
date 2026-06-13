"""Abstract times: moments described relative to the school schedule ("five
minutes before the end of the period", "start of school next Monday") rather
than as wall-clock times.

Python counterpart of the JavaScript ``abstract-time.js`` module. An abstract
time has three independent parts: a day spec (which date, possibly relative to
a base date), a time anchor (a schedule-defined point in that day), and a
signed HH:MM offset. Resolution happens in two phases: day binding
(:meth:`BellSchedule.bind_time`, producing a bound time) and time resolution
(:meth:`BellSchedule.resolve_time`, supplying the period if the anchor needs
one).

This module holds the types and the string syntax (:func:`parse_time` /
:func:`format_time`); everything that needs a calendar lives on BellSchedule.

The types are plain dicts, mirroring the rest of the Python port:

- ``AbstractTime``: ``{"anchor": str, "offset"?: str, "day"?: DaySpec}``
- ``BoundTime``: ``{"date": str, "anchor": str, "offset": str}``
- ``DaySpec``: ``{"type": "date", "date": str}`` |
  ``{"type": "schoolDays"|"weeks", "n": int}`` |
  ``{"type": "weekday", "weekday": int}`` |
  ``{"type": "week", "edge": "start"|"end", "n": int}``

Anchors: ``start_of_period``, ``end_of_period``, ``start_of_day``,
``end_of_day``, ``midnight``.
"""

from __future__ import annotations

import re
from datetime import date

ANCHORS = (
    "start_of_period",
    "end_of_period",
    "start_of_day",
    "end_of_day",
    "midnight",
)

WEEKDAY_NUMBERS = {
    "monday": 1, "mon": 1,
    "tuesday": 2, "tue": 2,
    "wednesday": 3, "wed": 3,
    "thursday": 4, "thu": 4,
    "friday": 5, "fri": 5,
    "saturday": 6, "sat": 6,
    "sunday": 7, "sun": 7,
}

WEEKDAY_NAMES = {
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
    7: "sunday",
}

_OFFSET_RE = re.compile(r"^([+-]?)(\d{1,2}):(\d{2})$")

# A signed time-offset token: the string syntax requires the sign.
_OFFSET_TOKEN_RE = re.compile(r"^[+-]\d{1,2}:\d{2}$")

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_SIGNED_INT_RE = re.compile(r"^([+-])(\d+)$")


def parse_offset_minutes(offset: str) -> int:
    """Parse an ``'[-+]HH:MM'`` offset into signed minutes.

    The sign is optional here (stored offsets may be unsigned, e.g. ``'00:00'``);
    the string syntax requires it so an offset token is unambiguous.
    """
    m = _OFFSET_RE.match(offset)
    if m:
        minutes = int(m.group(3))
        if minutes <= 59:
            total = int(m.group(2)) * 60 + minutes
            return -total if m.group(1) == "-" else total
    raise ValueError(f'Invalid time offset "{offset}"')


def _format_offset(minutes: int) -> str:
    sign = "-" if minutes < 0 else "+"
    abs_minutes = abs(minutes)
    return f"{sign}{abs_minutes // 60:02d}:{abs_minutes % 60:02d}"


def _parse_day_part(tokens: list[str]) -> dict:
    def bad() -> ValueError:
        return ValueError(f'Unrecognized day part "{" ".join(tokens)}"')

    if len(tokens) == 1:
        tok = tokens[0]
        if _ISO_DATE_RE.match(tok):
            try:
                date.fromisoformat(tok)
            except ValueError:
                raise ValueError(f'Invalid date "{tok}"')
            return {"type": "date", "date": tok}
        if tok in WEEKDAY_NUMBERS:
            return {"type": "weekday", "weekday": WEEKDAY_NUMBERS[tok]}
        raise bad()

    if len(tokens) == 2:
        if tokens[0] == "next" and tokens[1] == "week":
            return {"type": "week", "edge": "start", "n": 1}
        if _SIGNED_INT_RE.match(tokens[0]):
            n = int(tokens[0])
            if tokens[1] in ("day", "days"):
                return {"type": "schoolDays", "n": n}
            if tokens[1] in ("week", "weeks"):
                return {"type": "weeks", "n": n}
        raise bad()

    if tokens[0] in ("start", "end") and tokens[1] == "of":
        if len(tokens) == 3 and tokens[2] == "week":
            return {"type": "week", "edge": tokens[0], "n": 0}
        if len(tokens) == 4 and tokens[2] == "next" and tokens[3] == "week":
            return {"type": "week", "edge": tokens[0], "n": 1}

    raise bad()


def parse_time(spec: str) -> dict:
    """Parse the compact one-line syntax: ``anchor [time-offset] [day-part]``,
    whitespace-separated, case-insensitive. E.g. ``'end_of_period -00:05'``,
    ``'start_of_day next week'``, ``'end_of_day +1 day'``. Raises on unknown
    anchors, malformed offsets, and unrecognized day parts.
    """
    tokens = spec.strip().lower().split()
    if not tokens:
        raise ValueError("Empty abstract-time spec")

    anchor = tokens.pop(0)
    if anchor not in ANCHORS:
        raise ValueError(f'Unknown anchor "{anchor}"')

    t: dict = {"anchor": anchor}

    if tokens and _OFFSET_TOKEN_RE.match(tokens[0]):
        offset = tokens.pop(0)
        parse_offset_minutes(offset)  # validate (e.g. minutes <= 59)
        t["offset"] = offset

    if tokens:
        t["day"] = _parse_day_part(tokens)

    return t


def _format_day_part(day: dict) -> str:
    kind = day["type"]
    if kind == "date":
        return day["date"]
    if kind in ("schoolDays", "weeks"):
        n = day["n"]
        if not isinstance(n, int):
            raise ValueError(f"Cannot format non-integer day spec {n}")
        abs_n = abs(n)
        unit = "day" if kind == "schoolDays" else "week"
        plural = "" if abs_n == 1 else "s"
        return f"{'-' if n < 0 else '+'}{abs_n} {unit}{plural}"
    if kind == "weekday":
        name = WEEKDAY_NAMES.get(day["weekday"])
        if not name:
            raise ValueError(
                f"Invalid weekday {day['weekday']} (must be 1=Monday..7=Sunday)"
            )
        return name
    if kind == "week":
        n = day["n"]
        if n == 0:
            return f"{day['edge']} of week"
        if n == 1:
            return f"{day['edge']} of next week"
        raise ValueError(
            f"Cannot format week spec with n={n} (string syntax covers n=0 and n=1)"
        )
    raise ValueError(f'Unknown day spec type "{kind}"')


def format_time(t: dict) -> str:
    """Canonical string form of an abstract time; round-trips through
    :func:`parse_time`."""
    if t["anchor"] not in ANCHORS:
        raise ValueError(f'Unknown anchor "{t["anchor"]}"')
    parts = [t["anchor"]]
    offset = parse_offset_minutes(t.get("offset") or "+00:00")
    if offset != 0:
        parts.append(_format_offset(offset))
    if t.get("day"):
        parts.append(_format_day_part(t["day"]))
    return " ".join(parts)

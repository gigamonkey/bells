"""BellSchedule — wraps one or more Calendar instances.

Python counterpart of the JavaScript ``bell-schedule.js`` module.
"""

from __future__ import annotations

import re
import sys
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable, Optional
from zoneinfo import ZoneInfo

from .abstract_time import parse_offset_minutes
from .calendar import Calendar, Interval, normalize_include_tags
from .datetimeutil import _instant_to_date, _now_instant

_PERIOD_NUMBER_RE = re.compile(r"^Period (\d+)\b")


def _default_period_number(period: dict) -> Optional[int]:
    """The bhs-cs heuristic for numbered periods: "Period 3", "Period 3 Final"."""
    m = _PERIOD_NUMBER_RE.match(period["name"])
    return int(m.group(1)) if m else None


def _default_warn(warning: str) -> None:
    print(warning, file=sys.stderr)


class BellSchedule:
    """The public entry point. Queries one or more years of calendar data."""

    def __init__(self, calendar_data_array: list[dict], options: Optional[dict] = None):
        options = options or {}
        role = options.get("role") or "student"
        include_tags = normalize_include_tags(options.get("include_tags") or {})
        self._options = {"role": role, "include_tags": include_tags}
        self._period_number = options.get("period_number") or _default_period_number
        self._calendars = [
            Calendar(d, {"role": role, "include_tags": include_tags})
            for d in calendar_data_array
        ]

    @property
    def timezone(self) -> str:
        """The timezone shared by all calendars (e.g. ``'America/Los_Angeles'``)."""
        return self._calendars[0].timezone

    # ── internal calendar selection ─────────────────────────────────────────

    def _calendar_at(self, instant: datetime) -> Optional[Calendar]:
        for c in self._calendars:
            if c.is_in_calendar(instant):
                return c
        return None

    def _next_calendar(self, instant: datetime) -> Optional[Calendar]:
        best = None
        for c in self._calendars:
            if c.start_of_year() <= instant:
                continue
            if best is None or c.start_of_year() < best.start_of_year():
                best = c
        return best

    def _prev_calendar(self, instant: datetime) -> Optional[Calendar]:
        best = None
        for c in self._calendars:
            if c.end_of_year() >= instant:
                continue
            if best is None or c.end_of_year() > best.end_of_year():
                best = c
        return best

    def _calendar_for_date(self, d: date) -> Optional[Calendar]:
        for c in self._calendars:
            if c.first_day <= d <= c.last_day:
                return c
        return None

    # ── public API ──────────────────────────────────────────────────────────

    def current_interval(self, instant: Optional[datetime] = None) -> Optional[Interval]:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.current_interval(instant) if cal else None

    def period_at(self, instant: Optional[datetime] = None) -> Optional[Interval]:
        if instant is None:
            instant = _now_instant()
        interval = self.current_interval(instant)
        return interval if interval and interval.type == "period" else None

    def is_school_day(self, d: Optional[date] = None, tz: Optional[str] = None) -> bool:
        """Whether ``d`` is a school day.

        With no date, defaults to today in the system-local timezone; pass ``tz``
        (an IANA name) to anchor "today" to a specific zone (e.g. the school's)
        when the process runs elsewhere — e.g. a server in UTC.
        """
        if d is None:
            d = _instant_to_date(_now_instant(), tz) if tz else date.today()
        cal = self._calendar_for_date(d)
        return cal.is_school_day(d) if cal else False

    def current_day_bounds(self, instant: Optional[datetime] = None) -> Optional[dict]:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        if not cal:
            return None
        d = _instant_to_date(instant, cal.timezone)
        if not cal.is_school_day(d):
            return None
        sched = cal.schedule(d)
        return {
            "start": sched.start_of_day(d, cal.timezone),
            "end": sched.end_of_day(d, cal.timezone),
        }

    def next_school_day_start(self, instant: Optional[datetime] = None) -> datetime:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        if cal:
            return cal.next_school_day_start(instant)

        nxt = self._next_calendar(instant)
        if nxt:
            return nxt.start_of_year()
        raise RuntimeError("No calendar data available for next school day")

    def previous_school_day_end(self, instant: Optional[datetime] = None) -> datetime:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        if cal:
            return cal.previous_school_day_end(instant)

        prev = self._prev_calendar(instant)
        if prev:
            return prev.end_of_year()
        raise RuntimeError("No calendar data available for previous school day")

    def school_time_left(self, instant: Optional[datetime] = None) -> timedelta:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.school_time_left(instant) if cal else timedelta(0)

    def school_time_done(self, instant: Optional[datetime] = None) -> timedelta:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.school_time_done(instant) if cal else timedelta(0)

    def total_school_time(self, instant: Optional[datetime] = None) -> timedelta:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.total_school_time() if cal else timedelta(0)

    def next_year_start(self, instant: Optional[datetime] = None) -> datetime:
        if instant is None:
            instant = _now_instant()
        nxt = self._next_calendar(instant)
        if not nxt:
            raise RuntimeError("No next year calendar data available")
        return nxt.start_of_year()

    def current_year_start(self, instant: Optional[datetime] = None) -> Optional[datetime]:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.start_of_year() if cal else None

    def current_year_end(self, instant: Optional[datetime] = None) -> Optional[datetime]:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.end_of_year() if cal else None

    def school_time_between(self, start: datetime, end: datetime) -> timedelta:
        total = timedelta(0)
        for cal in self._calendars:
            cal_start = cal.start_of_year()
            cal_end = cal.end_of_year()

            frm = cal_start if start < cal_start else start
            to = cal_end if end > cal_end else end

            if frm < to:
                total += cal.school_time_between(frm, to)

        return total

    def school_days_between(self, start: date, end: date) -> int:
        count = 0
        for cal in self._calendars:
            count += cal.school_days_between(start, end)
        return count

    def school_days_left(self, instant: Optional[datetime] = None) -> int:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.school_days_left(instant) if cal else 0

    def calendar_days_left(self, instant: Optional[datetime] = None) -> int:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.calendar_days_left(instant) if cal else 0

    def non_class_days_left(self, instant: Optional[datetime] = None) -> list[dict]:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant)
        return cal.non_class_days_left(instant) if cal else []

    def non_class_label(self, d: date) -> Optional[str]:
        cal = self._calendar_for_date(d)
        return cal.non_class_label(d) if cal else None

    def summer_bounds(self, instant: Optional[datetime] = None) -> Optional[dict]:
        if instant is None:
            instant = _now_instant()
        if self._calendar_at(instant):
            return None

        prev = self._prev_calendar(instant)
        nxt = self._next_calendar(instant)

        if not prev and not nxt:
            return None

        return {
            "start": prev.end_of_year() if prev else None,
            "end": nxt.start_of_year() if nxt else None,
        }

    def next_school_day(self, d: date) -> date:
        cur = d + timedelta(days=1)
        for _ in range(365):
            if self.is_school_day(cur):
                return cur
            cur = cur + timedelta(days=1)
        raise RuntimeError("No school day found within 365 days")

    def previous_school_day(self, d: date) -> date:
        cur = d - timedelta(days=1)
        for _ in range(365):
            if self.is_school_day(cur):
                return cur
            cur = cur - timedelta(days=1)
        raise RuntimeError("No school day found within 365 days")

    def schedule_name_for(self, d: date) -> Optional[str]:
        cal = self._calendar_for_date(d)
        if not cal or not cal.is_school_day(d):
            return None
        return cal.schedule(d).name

    def schedule_for(self, d: date) -> list[dict]:
        cal = self._calendar_for_date(d)
        if not cal or not cal.is_school_day(d):
            return []
        sched = cal.schedule(d)
        return [
            {
                "name": p.name,
                "start": p.start_instant(d, cal.timezone),
                "end": p.end_instant(d, cal.timezone),
                "tags": p.tags,
            }
            for p in sched.actual_periods()
        ]

    def periods_for_date(self, instant: Optional[datetime] = None) -> list[dict]:
        if instant is None:
            instant = _now_instant()
        cal = self._calendar_at(instant) or self._next_calendar(instant)
        if not cal:
            return []

        if cal.is_in_calendar(instant):
            today = _instant_to_date(instant, cal.timezone)
            if cal.is_school_day(today):
                sched = cal.schedule(today)
                end_of_day = sched.end_of_day(today, cal.timezone)
                if instant < end_of_day:
                    d = today
                else:
                    d = _instant_to_date(cal.next_school_day_start(instant), cal.timezone)
            else:
                d = _instant_to_date(cal.next_school_day_start(instant), cal.timezone)
        else:
            d = cal.first_day

        sched = cal.schedule(d)
        return [
            {
                "name": p.name,
                "start": p.start_instant(d, cal.timezone),
                "end": p.end_instant(d, cal.timezone),
                "tags": p.tags,
            }
            for p in sched.actual_periods()
        ]

    # ── abstract times ────────────────────────────────────────────────────────

    def _first_calendar_day(self) -> date:
        return min(c.first_day for c in self._calendars)

    def _last_calendar_day(self) -> date:
        return max(c.last_day for c in self._calendars)

    def _check_in_calendars(self, d: date, what: str) -> None:
        if d < self._first_calendar_day() or d > self._last_calendar_day():
            raise IndexError(f"Resolving {what} runs outside the loaded calendars at {d}")

    def add_school_days(self, d: date, n: int) -> date:
        """n school days from ``d`` (n may be negative; 0 = ``d`` itself)."""
        if not isinstance(n, int) or isinstance(n, bool):
            raise ValueError(f"School-day offset must be an integer, got {n}")
        start = d
        step = -1 if n < 0 else 1
        remaining = abs(n)
        while remaining > 0:
            d = d + timedelta(days=step)
            self._check_in_calendars(d, f"{n} school days from {start}")
            if self.is_school_day(d):
                remaining -= 1
        return d

    def resolve_day(self, base: date, day: Optional[dict] = None) -> date:
        """Resolve a day spec against a base date; omitted means the base itself."""
        if not day:
            return base
        kind = day["type"]
        if kind == "date":
            return date.fromisoformat(day["date"])
        if kind == "schoolDays":
            return self.add_school_days(base, day["n"])
        if kind == "weeks":
            # Taken literally — no school-day snapping; validation warns instead.
            return base + timedelta(weeks=day["n"])
        if kind == "weekday":
            weekday = day["weekday"]
            if not isinstance(weekday, int) or weekday < 1 or weekday > 7:
                raise ValueError(f"Invalid weekday {weekday} (must be 1=Monday..7=Sunday)")
            # First matching day strictly after the base; never snapped.
            return base + timedelta(days=((weekday - base.isoweekday() + 6) % 7) + 1)
        if kind == "week":
            monday = base - timedelta(days=base.isoweekday() - 1) + timedelta(weeks=day["n"])
            if day["edge"] == "start":
                # First school day on or after the Monday; a week with no school
                # days advances into the following week ("the first day back").
                d = monday
                while not self.is_school_day(d):
                    self._check_in_calendars(d, f"start of the week of {monday}")
                    d = d + timedelta(days=1)
                return d
            # edge == 'end': last school day on or before the Sunday. A week with
            # no school days is an error: walking backward would land at or
            # before the base date and guessing forward is just as wrong.
            d = monday + timedelta(days=6)
            while d >= monday:
                if self.is_school_day(d):
                    return d
                d = d - timedelta(days=1)
            raise ValueError(f"'end of week': the week of {monday} has no school days")
        raise ValueError(f'Unknown day spec type "{kind}"')

    def bind_time(
        self,
        base: date,
        t: dict,
        on_warning: Optional[Callable[[str], None]] = None,
    ) -> dict:
        """Phase 1: bind the day spec against a base date. Runs
        :meth:`time_warnings` on the result and reports anything it finds via
        ``on_warning`` (default: print to stderr)."""
        if on_warning is None:
            on_warning = _default_warn
        offset = t.get("offset") or "+00:00"
        parse_offset_minutes(offset)  # reject malformed offsets at load time
        d = self.resolve_day(base, t.get("day"))
        bound = {"date": d.isoformat(), "anchor": t["anchor"], "offset": offset}

        warnings = self.time_warnings(bound)
        day = t.get("day")
        if day and day.get("type") == "week" and day.get("edge") == "start":
            monday = base - timedelta(days=base.isoweekday() - 1) + timedelta(weeks=day["n"])
            if d > monday + timedelta(days=6):
                warnings.append(
                    f"'start of week' advanced to {d}: the week of {monday} has no school days"
                )
        for w in warnings:
            on_warning(w)
        return bound

    def time_warnings(self, t: dict) -> list[str]:
        """Sanity-check a bound time against the calendar: human-readable
        warnings for specs that can't carry their anchor. Empty = OK. (It cannot
        check a specific period — the period isn't bound yet.)"""
        anchor = t["anchor"]
        if anchor == "midnight":
            return []  # midnight on any date is well-defined
        d = date.fromisoformat(t["date"])
        if not self.is_school_day(d):
            return [f"{anchor} on {t['date']}, which is not a school day"]
        if anchor in ("start_of_period", "end_of_period"):
            numbered = any(self._period_number(p) is not None for p in self.schedule_for(d))
            if not numbered:
                return [f"{anchor} on {t['date']}, which has no numbered periods"]
        return []

    def resolve_time(self, t: dict, period: Optional[int] = None) -> Optional[datetime]:
        """Phase 2: resolve a bound time to a concrete moment (an aware datetime
        in the schedule's timezone), supplying the period if the anchor needs
        one. ``None`` when the date has no schedule, no such period, or a period
        anchor's period is omitted — never a guess."""
        offset_minutes = parse_offset_minutes(t["offset"])
        anchor = self._anchor_instant(date.fromisoformat(t["date"]), t["anchor"], period)
        if anchor is None:
            return None
        # Offsets are applied to the absolute instant (UTC), so offsets crossing
        # a DST transition resolve as exact elapsed time.
        resolved = anchor + timedelta(minutes=offset_minutes)
        return resolved.astimezone(ZoneInfo(self.timezone))

    def _anchor_instant(
        self, d: date, anchor: str, period: Optional[int]
    ) -> Optional[datetime]:
        tz = self.timezone
        if anchor == "midnight":
            local = datetime.combine(d, time(hour=0), tzinfo=ZoneInfo(tz))
            return local.astimezone(timezone.utc)
        if anchor in ("start_of_day", "end_of_day"):
            periods = self.schedule_for(d)
            if not periods:
                return None
            return periods[0]["start"] if anchor == "start_of_day" else periods[-1]["end"]
        if anchor in ("start_of_period", "end_of_period"):
            if period is None:
                return None
            p = self.period_on_date(d, period)
            if p is None:
                return None
            return p["start"] if anchor == "start_of_period" else p["end"]
        return None

    def period_on_date(self, d: date, n: int) -> Optional[dict]:
        """The numbered period on a date, per the period_number matcher, or None."""
        for p in self.schedule_for(d):
            if self._period_number(p) == n:
                return p
        return None

    def current_or_next_period_number(self, instant: Optional[datetime] = None) -> Optional[int]:
        """The number of the period containing ``instant``, or the next numbered
        period later the same day, or None if neither exists."""
        if instant is None:
            instant = _now_instant()
        d = _instant_to_date(instant, self.timezone)
        for p in self.schedule_for(d):
            n = self._period_number(p)
            if n is not None and instant < p["end"]:
                return n
        return None

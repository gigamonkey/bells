"""BellSchedule — wraps one or more Calendar instances.

Python counterpart of the JavaScript ``bell-schedule.js`` module.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from .calendar import Calendar, Interval, normalize_include_tags
from .datetimeutil import _instant_to_date, _now_instant


class BellSchedule:
    """The public entry point. Queries one or more years of calendar data."""

    def __init__(self, calendar_data_array: list[dict], options: Optional[dict] = None):
        options = options or {}
        role = options.get("role") or "student"
        include_tags = normalize_include_tags(options.get("include_tags") or {})
        self._options = {"role": role, "include_tags": include_tags}
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

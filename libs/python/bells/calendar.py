"""Calendar, Schedule, Period, and Interval classes.

Python counterpart of the JavaScript ``calendar.js`` module. No global state;
all date/time logic lives in :mod:`bells.datetimeutil`.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional, Union

from .datetimeutil import (
    days_between,
    includes_weekend,
    instant_to_date,
    now_instant,
    parse_plain_date,
    plain_to_instant,
    resolve_schedule_times,
)

WEEKDAY_NAMES = {
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
    7: "sunday",
}


def normalize_include_tags(
    include_tags: Union[list[str], dict, None]
) -> dict[int, list[str]]:
    """Normalize the ``include_tags`` option.

    Accepts either a flat list (same tags every weekday) or a per-day-of-week
    map keyed by ISO weekday (1=Mon … 5=Fri). Returns a dict keyed by weekday.
    """
    if isinstance(include_tags, list):
        return {1: include_tags, 2: include_tags, 3: include_tags, 4: include_tags, 5: include_tags}
    return include_tags or {}


class Period:
    """A single named period with wall-clock start/end times."""

    def __init__(
        self,
        name: str,
        start: time,
        end: time,
        tags: Optional[list[str]] = None,
        teachers: bool = False,
    ):
        self.name = name
        self.start = start  # datetime.time
        self.end = end  # datetime.time
        self.tags = tags or []
        self.teachers = bool(teachers)
        self.next: Optional["Period"] = None

    def start_instant(self, d: date, timezone: str) -> datetime:
        return plain_to_instant(d, self.start, timezone)

    def end_instant(self, d: date, timezone: str) -> datetime:
        return plain_to_instant(d, self.end, timezone)

    def is_after(self, instant: datetime, d: date, timezone: str) -> bool:
        return self.start_instant(d, timezone) > instant

    def is_before(self, instant: datetime, d: date, timezone: str) -> bool:
        return self.end_instant(d, timezone) < instant

    def contains(self, instant: datetime, d: date, timezone: str) -> bool:
        return self.start_instant(d, timezone) < instant < self.end_instant(d, timezone)

    def to_interval(self, d: date, timezone: str) -> "Interval":
        return Interval(
            self.name,
            self.start_instant(d, timezone),
            self.end_instant(d, timezone),
            True,
            "period",
            self.tags,
        )


class Interval:
    """A span of time of a particular ``type`` (period, passing, break, …)."""

    def __init__(
        self,
        name: str,
        start: datetime,
        end: datetime,
        during_school: bool,
        type: str,
        tags: list[str],
    ):
        self.name = name
        self.start = start
        self.end = end
        self.during_school = during_school
        self.type = type
        self.tags = tags

    def left(self, now: Optional[datetime] = None) -> timedelta:
        if now is None:
            now = now_instant()
        return self.end - now

    def done(self, now: Optional[datetime] = None) -> timedelta:
        if now is None:
            now = now_instant()
        return now - self.start


class Schedule:
    """A resolved set of periods for one specific date."""

    def __init__(self, calendar: "Calendar", periods: list[dict], d: date, name: Optional[str] = None):
        self.calendar = calendar
        self.date = d
        self.name = name
        self.raw_periods = [
            Period(p["name"], p["start"], p["end"], p.get("tags"), p.get("teachers", False))
            for p in periods
        ]

        # Set .next links on actual periods.
        actual = self.actual_periods()
        for i, p in enumerate(actual):
            p.next = actual[i + 1] if i < len(actual) - 1 else None

    def _maybe_break(self, instant: datetime) -> Optional[Interval]:
        if self.not_in_school(instant):
            prev = self.calendar.previous_school_day_end(instant)
            nxt = self.calendar.next_school_day_start(instant)
            days = days_between(prev, nxt)
            if days >= 3:
                name = self._break_name(days, prev, nxt)
                return Interval(f"{name}!", prev, nxt, False, "break", [])
        return None

    def _break_name(self, days: int, start: datetime, end: datetime) -> str:
        tz = self.calendar.timezone
        if days > 4:
            next_holiday = self.calendar.next_holiday(start)
            return self.calendar.break_names.get(next_holiday.isoformat(), "Vacation")
        elif includes_weekend(start, end, tz):
            return "Long weekend" if days > 3 else "Weekend"
        else:
            return "Mid-week vacation?"

    def has_period(self, p: Period) -> bool:
        """Whether a period should be included given the current date/config."""
        if p.teachers:
            return self.calendar.role == "teacher"

        tags = p.tags or []
        if "optional" not in tags:
            # Not optional — always include.
            return True

        # Optional — include only if one of its other tags appears in
        # include_tags for this day.
        dow = self.date.isoweekday()  # 1=Mon … 7=Sun
        allowed = self.calendar.include_tags.get(dow, [])
        return any(tag != "optional" and tag in allowed for tag in tags)

    def actual_periods(self) -> list[Period]:
        base = [p for p in self.raw_periods if self.has_period(p)]

        if not base:
            return base

        # Trim nonschool optional periods from start and end. These are
        # administrative periods (e.g. Food Trucks) that should not define
        # school day boundaries. User-configurable optional periods (zero,
        # seventh, ext) are kept so that enabling them correctly affects the
        # start/end of the school day.
        def is_nonschool(p: Period) -> bool:
            return "nonschool" in (p.tags or [])

        while base and "optional" in (base[0].tags or []) and is_nonschool(base[0]):
            base.pop(0)
        while base and "optional" in (base[-1].tags or []) and is_nonschool(base[-1]):
            base.pop()

        return base

    def first_period(self) -> Optional[Period]:
        ps = self.actual_periods()
        return ps[0] if ps else None

    def last_period(self) -> Optional[Period]:
        ps = self.actual_periods()
        return ps[-1] if ps else None

    def start_of_day(self, d: date, timezone: str) -> datetime:
        return self.first_period().start_instant(d, timezone)

    def end_of_day(self, d: date, timezone: str) -> datetime:
        return self.last_period().end_instant(d, timezone)

    def not_in_school(self, instant: datetime) -> bool:
        d = self.date
        return (
            not self.calendar.is_school_day(d)
            or instant >= self.end_of_day(d, self.calendar.timezone)
            or instant <= self.start_of_day(d, self.calendar.timezone)
        )

    def current_interval(self, instant: datetime) -> Optional[Interval]:
        days_off = self._maybe_break(instant)
        if days_off:
            return days_off

        tz = self.calendar.timezone
        d = self.date
        first = self.first_period()
        last = self.last_period()

        if first is None:
            return None

        if first.is_after(instant, d, tz):
            return Interval(
                "Before school",
                self.calendar.previous_school_day_end(instant),
                first.start_instant(d, tz),
                False,
                "before-school",
                [],
            )
        elif last.is_before(instant, d, tz):
            return Interval(
                "After school",
                last.end_instant(d, tz),
                self.calendar.next_school_day_start(instant),
                False,
                "after-school",
                [],
            )
        else:
            p = first
            while p is not None:
                if p.contains(instant, d, tz):
                    return p.to_interval(d, tz)
                elif (
                    p.next
                    and p.is_before(instant, d, tz)
                    and p.next.is_after(instant, d, tz)
                ):
                    return Interval(
                        f"Passing to {p.next.name}",
                        p.end_instant(d, tz),
                        p.next.start_instant(d, tz),
                        True,
                        "passing",
                        [],
                    )
                p = p.next

        return None


class Calendar:
    """A single academic year's calendar data."""

    def __init__(self, data: dict, options: dict):
        self.data = data
        self.timezone = data["timezone"]
        self.role = options["role"]
        self.include_tags = normalize_include_tags(options["include_tags"])

        if self.role == "teacher" and data.get("firstDayTeachers"):
            self.first_day = parse_plain_date(data["firstDayTeachers"])
        else:
            self.first_day = parse_plain_date(data["firstDay"])
        self.last_day = parse_plain_date(data["lastDay"])
        self.schedules = data["schedules"]
        self.weekday_schedules = data.get("weekdaySchedules") or {}
        self.dates = data.get("dates") or {}
        self.holidays = data.get("holidays") or []
        self.teacher_work_days = data.get("teacherWorkDays") or []
        self.break_names = data.get("breakNames") or {}
        self.non_class_days = data.get("nonClassDays") or {}

    # ── internal helpers ────────────────────────────────────────────────────

    def _noon_instant(self, d: date) -> datetime:
        return plain_to_instant(d, time(hour=12), self.timezone)

    def _next_school_day(self, d: date) -> date:
        d = d + timedelta(days=1)
        while not self.is_school_day(d):
            d = d + timedelta(days=1)
        return d

    def _previous_school_day(self, d: date) -> date:
        d = d - timedelta(days=1)
        while not self.is_school_day(d):
            d = d - timedelta(days=1)
        return d

    def _school_time_between(self, start: datetime, end: datetime) -> timedelta:
        # Clamp start/end to calendar bounds.
        cal_start = self.start_of_year()
        cal_end = self.end_of_year()
        cursor = cal_start if start < cal_start else start
        finish = cal_end if end > cal_end else end

        if cursor >= finish:
            return timedelta(0)

        total = timedelta(0)
        cursor_date = instant_to_date(cursor, self.timezone)

        while cursor_date <= self.last_day:
            # Stop once the start of this day is past the finish time.
            day_midnight = plain_to_instant(cursor_date, time(hour=0), self.timezone)
            if day_midnight >= finish:
                break

            if self.is_school_day(cursor_date):
                sched = self.schedule(cursor_date)
                day_start = sched.start_of_day(cursor_date, self.timezone)
                day_end = sched.end_of_day(cursor_date, self.timezone)

                frm = cursor if cursor > day_start else day_start
                to = finish if finish < day_end else day_end

                if frm < to:
                    total += to - frm

            cursor_date = cursor_date + timedelta(days=1)

        return total

    def _named_schedule(self, name: str) -> list[dict]:
        periods = self.schedules.get(name)
        if periods is None:
            raise ValueError(f'Unknown schedule "{name}"')
        return periods

    # ── public API ──────────────────────────────────────────────────────────

    def is_in_calendar(self, instant: datetime) -> bool:
        return self.start_of_year() <= instant <= self.end_of_year()

    def start_of_year(self) -> datetime:
        sched = self.schedule(self.first_day)
        return sched.first_period().start_instant(self.first_day, self.timezone)

    def end_of_year(self) -> datetime:
        sched = self.schedule(self.last_day)
        return sched.last_period().end_instant(self.last_day, self.timezone)

    def schedule(self, d: date) -> Schedule:
        ds = d.isoformat()
        name = None
        if ds in self.dates and d >= self.first_day:
            entry = self.dates[ds]
            if isinstance(entry, str):
                periods = self._named_schedule(entry)
                name = entry
            else:
                periods = entry
        else:
            weekday_name = WEEKDAY_NAMES[d.isoweekday()]
            name = self.weekday_schedules.get(weekday_name, "NORMAL")
            periods = self._named_schedule(name)
        return Schedule(self, resolve_schedule_times(periods), d, name)

    def is_school_day(self, d: date) -> bool:
        dow = d.isoweekday()
        return dow != 6 and dow != 7 and not self.is_holiday(d)

    def is_holiday(self, d: date) -> bool:
        ds = d.isoformat()
        return ds in self.holidays and not (
            self.role == "teacher" and ds in self.teacher_work_days
        )

    def next_holiday(self, instant: datetime) -> date:
        d = instant_to_date(instant, self.timezone) + timedelta(days=1)
        while not self.is_holiday(d) and d <= self.last_day:
            d = d + timedelta(days=1)
        return d

    def next_school_day_start(self, instant: datetime) -> datetime:
        d = instant_to_date(instant, self.timezone)
        if self.is_school_day(d):
            start = self.schedule(d).start_of_day(d, self.timezone)
            if start > instant:
                return start
        nxt = self._next_school_day(d)
        return self.schedule(nxt).start_of_day(nxt, self.timezone)

    def previous_school_day_end(self, instant: datetime) -> datetime:
        d = instant_to_date(instant, self.timezone)
        if self.is_school_day(d):
            end = self.schedule(d).end_of_day(d, self.timezone)
            if end < instant:
                return end
        prev = self._previous_school_day(d)
        return self.schedule(prev).end_of_day(prev, self.timezone)

    def current_interval(self, instant: datetime) -> Optional[Interval]:
        d = instant_to_date(instant, self.timezone)
        sched = self.schedule(d)
        return sched.current_interval(instant)

    def school_days_left(self, instant: datetime) -> int:
        d = instant_to_date(instant, self.timezone)
        sched = self.schedule(d)
        end_of_day = sched.end_of_day(d, self.timezone) if self.is_school_day(d) else None

        count = 0
        if end_of_day and instant < end_of_day:
            count = 1  # currently a school day, counts as remaining

        # Always start counting from tomorrow regardless.
        cur = d + timedelta(days=1)
        while cur <= self.last_day:
            if self.is_school_day(cur):
                count += 1
            cur = cur + timedelta(days=1)
        return count

    def non_class_label(self, d: date) -> Optional[str]:
        return self.non_class_days.get(d.isoformat())

    def non_class_days_left(self, instant: datetime) -> list[dict]:
        today = instant_to_date(instant, self.timezone)
        today_sched = self.schedule(today) if self.is_school_day(today) else None
        today_end = today_sched.end_of_day(today, self.timezone) if today_sched else None
        includes_today = bool(today_end and instant < today_end)

        result = []
        for date_str, label in self.non_class_days.items():
            d = parse_plain_date(date_str)
            if d < today:
                continue
            if d == today and not includes_today:
                continue
            if d > self.last_day:
                continue
            result.append({"date": d, "label": label})
        result.sort(key=lambda x: x["date"])
        return result

    def school_days_between(self, start: date, end: date) -> int:
        # Clamp to calendar bounds.
        frm = self.first_day if start < self.first_day else start
        to = self.last_day if end > self.last_day else end

        count = 0
        d = frm
        while d <= to:
            if self.is_school_day(d):
                count += 1
            d = d + timedelta(days=1)
        return count

    def calendar_days_left(self, instant: datetime) -> int:
        d = instant_to_date(instant, self.timezone)
        end_date = self.last_day + timedelta(days=1)
        return days_between(self._noon_instant(d), self._noon_instant(end_date))

    def school_time_left(self, instant: datetime) -> timedelta:
        return self._school_time_between(instant, self.end_of_year())

    def school_time_done(self, instant: datetime) -> timedelta:
        return self._school_time_between(self.start_of_year(), instant)

    def total_school_time(self) -> timedelta:
        return self._school_time_between(self.start_of_year(), self.end_of_year())

    def school_time_between(self, start: datetime, end: datetime) -> timedelta:
        return self._school_time_between(start, end)

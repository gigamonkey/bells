from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from conftest import LA, la_instant, pd

from bells import BellSchedule

CALENDAR_DATA = {
    "year": "2025-2026",
    "timezone": "America/Los_Angeles",
    "firstDay": "2025-08-13",
    "lastDay": "2026-06-04",
    "schedules": {
        "NORMAL": [
            {"name": "Period 1", "start": "8:30", "end": "9:28"},
            {"name": "Period 2", "start": "9:34", "end": "10:37"},
        ],
        "LATE_START": [
            {"name": "Period 1", "start": "10:00", "end": "10:43"},
            {"name": "Period 2", "start": "10:49", "end": "11:37"},
        ],
    },
    "weekdaySchedules": {"monday": "LATE_START"},
    "holidays": ["2025-09-01", "2025-11-27", "2025-11-28"],
    "teacherWorkDays": [],
    "breakNames": {},
}


def make_bs(**opts):
    options = {"role": "student", "include_tags": {}}
    options.update(opts)
    return BellSchedule([CALENDAR_DATA], options)


class TestNextSchoolDay:
    def test_skips_weekend(self):
        assert make_bs().next_school_day(pd("2025-08-15")) == pd("2025-08-18")

    def test_skips_holiday(self):
        assert make_bs().next_school_day(pd("2025-08-29")) == pd("2025-09-02")

    def test_skips_consecutive_holidays_and_weekends(self):
        assert make_bs().next_school_day(pd("2025-11-26")) == pd("2025-12-01")

    def test_from_saturday(self):
        assert make_bs().next_school_day(pd("2025-08-16")) == pd("2025-08-18")


class TestPreviousSchoolDay:
    def test_skips_weekend(self):
        assert make_bs().previous_school_day(pd("2025-08-18")) == pd("2025-08-15")

    def test_skips_holiday(self):
        assert make_bs().previous_school_day(pd("2025-09-02")) == pd("2025-08-29")

    def test_skips_consecutive(self):
        assert make_bs().previous_school_day(pd("2025-12-01")) == pd("2025-11-26")


class TestSchoolDaysBetween:
    def test_inclusive_both_endpoints(self):
        assert make_bs().school_days_between(pd("2025-08-18"), pd("2025-08-22")) == 5

    def test_single_school_day(self):
        assert make_bs().school_days_between(pd("2025-08-13"), pd("2025-08-13")) == 1

    def test_single_non_school_day(self):
        assert make_bs().school_days_between(pd("2025-08-16"), pd("2025-08-16")) == 0

    def test_adjacent_school_days(self):
        assert make_bs().school_days_between(pd("2025-08-13"), pd("2025-08-14")) == 2

    def test_excludes_holidays(self):
        assert make_bs().school_days_between(pd("2025-08-29"), pd("2025-09-03")) == 3

    def test_excludes_weekends(self):
        assert make_bs().school_days_between(pd("2025-08-15"), pd("2025-08-18")) == 2

    def test_full_week(self):
        assert make_bs().school_days_between(pd("2025-08-18"), pd("2025-08-25")) == 6


class TestIsSchoolDay:
    def test_school_day(self):
        assert make_bs().is_school_day(pd("2025-08-13")) is True

    def test_weekend(self):
        assert make_bs().is_school_day(pd("2025-08-16")) is False

    def test_holiday(self):
        assert make_bs().is_school_day(pd("2025-09-01")) is False

    def test_outside_range(self):
        assert make_bs().is_school_day(pd("2024-01-01")) is False

    def test_no_arg_defaults_to_system_local_today(self):
        bs = make_bs()
        assert bs.is_school_day() == bs.is_school_day(date.today())

    def test_tz_arg_anchors_today_to_zone(self):
        bs = make_bs()
        today_la = datetime.now(timezone.utc).astimezone(ZoneInfo(LA)).date()
        assert bs.is_school_day(tz=LA) == bs.is_school_day(today_la)


class TestScheduleFor:
    def test_normal_school_day(self):
        periods = make_bs().schedule_for(pd("2025-08-13"))
        assert len(periods) == 2
        assert periods[0]["name"] == "Period 1"
        assert periods[1]["name"] == "Period 2"

    def test_late_start_monday(self):
        periods = make_bs().schedule_for(pd("2025-08-18"))
        assert len(periods) == 2
        assert periods[0]["name"] == "Period 1"
        start = periods[0]["start"].astimezone(ZoneInfo(LA))
        assert (start.hour, start.minute) == (10, 0)

    def test_holiday_empty(self):
        assert make_bs().schedule_for(pd("2025-09-01")) == []

    def test_weekend_empty(self):
        assert make_bs().schedule_for(pd("2025-08-16")) == []

    def test_outside_range_empty(self):
        assert make_bs().schedule_for(pd("2024-01-01")) == []

    def test_period_shape(self):
        for p in make_bs().schedule_for(pd("2025-08-13")):
            assert "name" in p and "start" in p and "end" in p and "tags" in p


NON_CLASS_DATA = {
    **CALENDAR_DATA,
    "dates": {"2026-06-01": "NORMAL", "2026-06-04": "NORMAL"},
    "nonClassDays": {"2026-06-01": "exam", "2026-06-04": "bonus"},
}


def make_nc_bs():
    return BellSchedule([NON_CLASS_DATA], {"role": "student", "include_tags": {}})


class TestNonClassDays:
    def test_label_listed(self):
        assert make_nc_bs().non_class_label(pd("2026-06-01")) == "exam"
        assert make_nc_bs().non_class_label(pd("2026-06-04")) == "bonus"

    def test_label_unlisted(self):
        assert make_nc_bs().non_class_label(pd("2025-08-19")) is None

    def test_days_left_active_calendar(self):
        lst = make_nc_bs().non_class_days_left(la_instant("2026-05-15T08:00:00"))
        assert len(lst) == 2

    def test_days_left_outside_calendar(self):
        lst = make_nc_bs().non_class_days_left(la_instant("2030-01-01T08:00:00"))
        assert lst == []

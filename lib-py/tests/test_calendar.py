from datetime import time
from zoneinfo import ZoneInfo

import pytest
from conftest import LA, la_instant, pd

from bells.calendar import Calendar, Interval, Period, normalize_include_tags

# ─── Shared fixture ───────────────────────────────────────────────────────────

CALENDAR_DATA = {
    "year": "2025-2026",
    "timezone": "America/Los_Angeles",
    "firstDay": "2025-08-13",
    "firstDayTeachers": "2025-08-11",
    "lastDay": "2026-06-04",
    "schedules": {
        "NORMAL": [
            {"name": "Period 0", "start": "7:26", "end": "8:24", "tags": ["optional", "zero"]},
            {"name": "Period 1", "start": "8:30", "end": "9:28"},
            {"name": "Period 2", "start": "9:34", "end": "10:37"},
            {"name": "Period 3", "start": "10:43", "end": "11:41"},
            {"name": "Lunch", "start": "11:42", "end": "12:22"},
            {"name": "Period 4", "start": "12:27", "end": "13:25"},
            {"name": "Period 5", "start": "13:31", "end": "14:29"},
            {"name": "Period 6", "start": "14:35", "end": "15:33"},
            {"name": "Period 7", "start": "15:39", "end": "16:37", "tags": ["optional", "seventh"]},
            {"name": "Period Ext", "start": "15:39", "end": "17:09", "tags": ["optional", "ext"]},
        ],
        "LATE_START": [
            {"name": "Staff meeting", "start": "8:03", "end": "9:33", "teachers": True},
            {"name": "Period 1", "start": "10:00", "end": "10:43"},
            {"name": "Period 2", "start": "10:49", "end": "11:37"},
            {"name": "Period 3", "start": "11:43", "end": "12:26"},
            {"name": "Lunch", "start": "12:26", "end": "13:06"},
            {"name": "Period 4", "start": "13:12", "end": "13:55"},
            {"name": "Period 5", "start": "14:01", "end": "14:44"},
            {"name": "Period 6", "start": "14:50", "end": "15:33"},
        ],
    },
    "weekdaySchedules": {"monday": "LATE_START"},
    "holidays": ["2025-09-01", "2025-11-27"],
    "teacherWorkDays": [],
    "breakNames": {"2025-11-26": "Thanksgiving Break"},
}


def make_calendar(**opts):
    options = {"role": "student", "include_tags": {}}
    options.update(opts)
    return Calendar(CALENDAR_DATA, options)


# ─── normalize_include_tags ───────────────────────────────────────────────────


class TestNormalizeIncludeTags:
    def test_flat_array_maps_days_1_to_5(self):
        tags = ["zero", "seventh"]
        result = normalize_include_tags(tags)
        for day in (1, 2, 3, 4, 5):
            assert result[day] == tags

    def test_flat_array_no_entries_for_6_7(self):
        result = normalize_include_tags(["zero"])
        assert 6 not in result
        assert 7 not in result

    def test_map_input_returned_as_is(self):
        m = {1: ["zero"], 3: ["seventh"]}
        assert normalize_include_tags(m) == m

    def test_none_returns_empty(self):
        assert normalize_include_tags(None) == {}


# ─── Calendar: basic queries ──────────────────────────────────────────────────


class TestIsSchoolDay:
    def test_wednesday_in_term(self):
        assert make_calendar().is_school_day(pd("2025-08-13")) is True

    def test_saturday(self):
        assert make_calendar().is_school_day(pd("2025-08-16")) is False

    def test_sunday(self):
        assert make_calendar().is_school_day(pd("2025-08-17")) is False

    def test_holiday(self):
        assert make_calendar().is_school_day(pd("2025-09-01")) is False


class TestIsHoliday:
    def test_listed_holiday(self):
        assert make_calendar().is_holiday(pd("2025-09-01")) is True

    def test_non_holiday_weekday(self):
        assert make_calendar().is_holiday(pd("2025-08-13")) is False

    def test_teacher_work_day_for_teacher(self):
        data = {**CALENDAR_DATA, "holidays": ["2025-09-01"], "teacherWorkDays": ["2025-09-01"]}
        cal = Calendar(data, {"role": "teacher", "include_tags": {}})
        assert cal.is_holiday(pd("2025-09-01")) is False

    def test_teacher_work_day_for_student(self):
        data = {**CALENDAR_DATA, "holidays": ["2025-09-01"], "teacherWorkDays": ["2025-09-01"]}
        cal = Calendar(data, {"role": "student", "include_tags": {}})
        assert cal.is_holiday(pd("2025-09-01")) is True


class TestSchedule:
    def test_monday_late_start(self):
        sched = make_calendar().schedule(pd("2025-08-18"))
        first = sched.first_period()
        assert first.name == "Period 1"
        assert (first.start.hour, first.start.minute) == (10, 0)

    def test_tuesday_normal(self):
        sched = make_calendar().schedule(pd("2025-08-19"))
        first = sched.first_period()
        assert first.name == "Period 1"
        assert (first.start.hour, first.start.minute) == (8, 30)

    def test_inline_array_override(self):
        data = {**CALENDAR_DATA, "dates": {"2025-08-19": [{"name": "Assembly", "start": "9:00", "end": "10:00"}]}}
        cal = Calendar(data, {"role": "student", "include_tags": {}})
        assert cal.schedule(pd("2025-08-19")).first_period().name == "Assembly"

    def test_named_schedule_override(self):
        data = {
            **CALENDAR_DATA,
            "schedules": {**CALENDAR_DATA["schedules"], "ASSEMBLY": [{"name": "Assembly", "start": "9:00", "end": "10:00"}]},
            "dates": {"2025-08-19": "ASSEMBLY"},
        }
        cal = Calendar(data, {"role": "student", "include_tags": {}})
        assert cal.schedule(pd("2025-08-19")).first_period().name == "Assembly"

    def test_no_weekday_schedules_monday_falls_back_to_normal(self):
        data = {**CALENDAR_DATA, "weekdaySchedules": {}}
        cal = Calendar(data, {"role": "student", "include_tags": {}})
        first = cal.schedule(pd("2025-08-18")).first_period()
        assert (first.start.hour, first.start.minute) == (8, 30)

    def test_custom_weekday_schedule_for_wednesday(self):
        data = {
            **CALENDAR_DATA,
            "schedules": {**CALENDAR_DATA["schedules"], "ASSEMBLY": [{"name": "Assembly", "start": "9:00", "end": "10:00"}]},
            "weekdaySchedules": {"wednesday": "ASSEMBLY"},
        }
        cal = Calendar(data, {"role": "student", "include_tags": {}})
        assert cal.schedule(pd("2025-08-20")).first_period().name == "Assembly"


class TestStartEndOfYear:
    def test_start_of_year_period_1_830(self):
        soy = make_calendar().start_of_year()
        zdt = soy.astimezone(ZoneInfo(LA))
        assert zdt.date().isoformat() == "2025-08-13"
        assert (zdt.hour, zdt.minute) == (8, 30)

    def test_end_of_year_period_6_1533(self):
        eoy = make_calendar().end_of_year()
        zdt = eoy.astimezone(ZoneInfo(LA))
        assert zdt.date().isoformat() == "2026-06-04"
        assert (zdt.hour, zdt.minute) == (15, 33)

    def test_teacher_start_of_year(self):
        cal = Calendar(CALENDAR_DATA, {"role": "teacher", "include_tags": {}})
        zdt = cal.start_of_year().astimezone(ZoneInfo(LA))
        assert zdt.date().isoformat() == "2025-08-11"
        assert (zdt.hour, zdt.minute) == (8, 3)


# ─── Schedule.has_period ──────────────────────────────────────────────────────


class TestHasPeriod:
    def _sched(self, date_str="2025-08-19", **calopts):
        options = {"role": "student", "include_tags": {}}
        options.update(calopts)
        return Calendar(CALENDAR_DATA, options).schedule(pd(date_str))

    def test_no_tags_always_included(self):
        sched = self._sched()
        p = Period("Period 1", time(8, 30), time(9, 28), [], False)
        assert sched.has_period(p) is True

    def test_optional_zero_with_matching_include_tags(self):
        sched = self._sched(include_tags={2: ["zero"]})
        p = Period("Period 0", time(7, 26), time(8, 24), ["optional", "zero"], False)
        assert sched.has_period(p) is True

    def test_optional_zero_without_include_tags(self):
        sched = self._sched(include_tags={})
        p = Period("Period 0", time(7, 26), time(8, 24), ["optional", "zero"], False)
        assert sched.has_period(p) is False

    def test_optional_only_always_excluded(self):
        sched = self._sched(include_tags={2: ["zero", "seventh", "ext", "optional"]})
        p = Period("Lunch-extra", time(12, 0), time(12, 30), ["optional"], False)
        assert sched.has_period(p) is False

    def test_teacher_period_for_teacher(self):
        sched = self._sched(role="teacher")
        p = Period("Staff meeting", time(8, 3), time(9, 33), [], True)
        assert sched.has_period(p) is True

    def test_teacher_period_for_student(self):
        sched = self._sched(role="student")
        p = Period("Staff meeting", time(8, 3), time(9, 33), [], True)
        assert sched.has_period(p) is False


# ─── Schedule.actual_periods ──────────────────────────────────────────────────


class TestActualPeriods:
    def test_student_no_include_tags_excludes_optional(self):
        sched = make_calendar().schedule(pd("2025-08-19"))
        names = [p.name for p in sched.actual_periods()]
        assert "Period 0" not in names
        assert "Period 7" not in names
        assert "Period Ext" not in names

    def test_student_no_include_tags_includes_mandatory(self):
        sched = make_calendar().schedule(pd("2025-08-19"))
        names = [p.name for p in sched.actual_periods()]
        for n in ("Period 1", "Period 2", "Period 3", "Lunch", "Period 4", "Period 5", "Period 6"):
            assert n in names

    def test_zero_included_when_in_include_tags(self):
        sched = make_calendar(include_tags={2: ["zero"]}).schedule(pd("2025-08-19"))
        names = [p.name for p in sched.actual_periods()]
        assert "Period 0" in names

    def test_seventh_passes_ext_does_not(self):
        sched = make_calendar(include_tags={2: ["seventh"]}).schedule(pd("2025-08-19"))
        p7 = next(p for p in sched.raw_periods if p.name == "Period 7")
        p_ext = next(p for p in sched.raw_periods if p.name == "Period Ext")
        assert sched.has_period(p7) is True
        assert sched.has_period(p_ext) is False

    def test_first_period_is_period_1(self):
        sched = make_calendar().schedule(pd("2025-08-19"))
        assert sched.first_period().name == "Period 1"

    def test_last_period_is_period_6(self):
        sched = make_calendar().schedule(pd("2025-08-19"))
        assert sched.last_period().name == "Period 6"


# ─── Schedule.current_interval ────────────────────────────────────────────────

TUE = "2025-08-19"


class TestCurrentInterval:
    def test_during_period_1(self):
        iv = make_calendar().current_interval(la_instant(f"{TUE}T08:45:00"))
        assert iv.type == "period"
        assert iv.name == "Period 1"
        assert iv.during_school is True

    def test_during_period_3(self):
        iv = make_calendar().current_interval(la_instant(f"{TUE}T11:00:00"))
        assert iv.type == "period"
        assert iv.name == "Period 3"

    def test_during_lunch(self):
        iv = make_calendar().current_interval(la_instant(f"{TUE}T11:50:00"))
        assert iv.type == "period"
        assert iv.name == "Lunch"

    def test_passing(self):
        iv = make_calendar().current_interval(la_instant(f"{TUE}T09:30:00"))
        assert iv.type == "passing"
        assert "Passing to Period 2" in iv.name

    def test_before_school(self):
        iv = make_calendar().current_interval(la_instant(f"{TUE}T07:00:00"))
        assert iv.type == "before-school"
        assert iv.name == "Before school"
        assert iv.during_school is False

    def test_after_school(self):
        iv = make_calendar().current_interval(la_instant(f"{TUE}T16:00:00"))
        assert iv.type == "after-school"
        assert iv.name == "After school"
        assert iv.during_school is False

    def test_weekend_break(self):
        iv = make_calendar().current_interval(la_instant("2025-08-16T12:00:00"))
        assert iv.type == "break"
        assert "Weekend" in iv.name

    def test_monday_late_start_period_1(self):
        iv = make_calendar().current_interval(la_instant("2025-08-18T10:20:00"))
        assert iv.type == "period"
        assert iv.name == "Period 1"


# ─── Interval.left / Interval.done ────────────────────────────────────────────


class TestIntervalLeftDone:
    def _iv(self):
        start = la_instant("2025-08-19T08:30:00")
        end = la_instant("2025-08-19T09:28:00")
        return Interval("Period 1", start, end, True, "period", [])

    def test_left(self):
        now = la_instant("2025-08-19T09:00:00")
        assert self._iv().left(now).total_seconds() / 60 == 28

    def test_done(self):
        now = la_instant("2025-08-19T09:00:00")
        assert self._iv().done(now).total_seconds() / 60 == 30

    def test_left_plus_done_equals_total(self):
        now = la_instant("2025-08-19T09:00:00")
        iv = self._iv()
        total = (iv.end - iv.start).total_seconds() / 60
        assert iv.left(now).total_seconds() / 60 + iv.done(now).total_seconds() / 60 == total


# ─── Calendar.nonClassDays ────────────────────────────────────────────────────

NON_CLASS_DATA = {
    **CALENDAR_DATA,
    "dates": {"2026-06-01": "NORMAL", "2026-06-02": "NORMAL", "2026-06-03": "NORMAL", "2026-06-04": "NORMAL"},
    "nonClassDays": {"2026-06-01": "exam", "2026-06-02": "exam", "2026-06-03": "exam", "2026-06-04": "bonus"},
}


def make_non_class_cal():
    return Calendar(NON_CLASS_DATA, {"role": "student", "include_tags": {}})


class TestNonClassLabel:
    def test_returns_label(self):
        assert make_non_class_cal().non_class_label(pd("2026-06-01")) == "exam"
        assert make_non_class_cal().non_class_label(pd("2026-06-04")) == "bonus"

    def test_null_for_regular_day(self):
        assert make_non_class_cal().non_class_label(pd("2025-08-19")) is None

    def test_null_when_missing(self):
        cal = Calendar(CALENDAR_DATA, {"role": "student", "include_tags": {}})
        assert cal.non_class_label(pd("2026-06-01")) is None


class TestNonClassDaysLeft:
    def test_before_any_in_order(self):
        lst = make_non_class_cal().non_class_days_left(la_instant("2026-05-15T08:00:00"))
        assert [x["date"].isoformat() for x in lst] == ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"]
        assert [x["label"] for x in lst] == ["exam", "exam", "exam", "bonus"]

    def test_on_day_before_end_includes(self):
        lst = make_non_class_cal().non_class_days_left(la_instant("2026-06-02T08:00:00"))
        assert [x["date"].isoformat() for x in lst] == ["2026-06-02", "2026-06-03", "2026-06-04"]

    def test_on_day_after_end_excludes(self):
        lst = make_non_class_cal().non_class_days_left(la_instant("2026-06-02T17:00:00"))
        assert [x["date"].isoformat() for x in lst] == ["2026-06-03", "2026-06-04"]

    def test_after_last_empty(self):
        lst = make_non_class_cal().non_class_days_left(la_instant("2026-06-04T18:00:00"))
        assert lst == []

    def test_empty_when_undefined(self):
        cal = Calendar(CALENDAR_DATA, {"role": "student", "include_tags": {}})
        assert cal.non_class_days_left(la_instant("2026-05-15T08:00:00")) == []

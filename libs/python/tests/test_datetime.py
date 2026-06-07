from datetime import time

from conftest import LA, la_instant, pt

from bells.datetimeutil import (
    days_between,
    includes_weekend,
    parse_plain_time,
    resolve_schedule_times,
)


# ─── parse_plain_time ─────────────────────────────────────────────────────────


class TestParsePlainTimeUnambiguousHighHour:
    def test_13_25_null_previous(self):
        t, ambiguous = parse_plain_time("13:25", None)
        assert (t.hour, t.minute) == (13, 25)
        assert ambiguous is False

    def test_15_33_null_previous(self):
        t, ambiguous = parse_plain_time("15:33", None)
        assert (t.hour, t.minute) == (15, 33)
        assert ambiguous is False


class TestParsePlainTimeFirstInSchedule:
    def test_8_30(self):
        t, ambiguous = parse_plain_time("8:30", None)
        assert (t.hour, t.minute) == (8, 30)
        assert ambiguous is False

    def test_7_26(self):
        t, ambiguous = parse_plain_time("7:26", None)
        assert (t.hour, t.minute) == (7, 26)
        assert ambiguous is False


class TestParsePlainTimeAMInference:
    def test_9_34_after_8_30(self):
        t, ambiguous = parse_plain_time("9:34", pt(8, 30))
        assert (t.hour, t.minute) == (9, 34)
        assert ambiguous is False

    def test_8_24_after_7_26(self):
        t, ambiguous = parse_plain_time("8:24", pt(7, 26))
        assert (t.hour, t.minute) == (8, 24)
        assert ambiguous is False


class TestParsePlainTimeNoonVsMidnight:
    def test_12_30_after_11_40_is_noon(self):
        t, ambiguous = parse_plain_time("12:30", pt(11, 40))
        assert (t.hour, t.minute) == (12, 30)
        assert ambiguous is False

    def test_12_00_after_midnight_is_midnight(self):
        t, ambiguous = parse_plain_time("12:00", pt(0, 0))
        assert (t.hour, t.minute) == (0, 0)
        assert ambiguous is False


class TestParsePlainTimeUnambiguousPM:
    def test_1_25_after_12_27(self):
        t, ambiguous = parse_plain_time("1:25", pt(12, 27))
        assert (t.hour, t.minute) == (13, 25)
        assert ambiguous is False

    def test_2_29_after_13_31(self):
        t, ambiguous = parse_plain_time("2:29", pt(13, 31))
        assert (t.hour, t.minute) == (14, 29)
        assert ambiguous is False

    def test_4_37_after_15_39(self):
        t, ambiguous = parse_plain_time("4:37", pt(15, 39))
        assert (t.hour, t.minute) == (16, 37)
        assert ambiguous is False


class TestParsePlainTimePicksMinimum:
    def test_6_30_after_5_00(self):
        t, ambiguous = parse_plain_time("6:30", pt(5, 0))
        assert (t.hour, t.minute) == (6, 30)
        assert ambiguous is False


class TestParsePlainTimeAmbiguous:
    def test_7_00_after_20_00(self):
        _, ambiguous = parse_plain_time("7:00", pt(20, 0))
        assert ambiguous is True


# ─── resolve_schedule_times ───────────────────────────────────────────────────

NORMAL = [
    {"name": "Period 0", "start": "7:26", "end": "8:24", "tags": ["optional", "zero"]},
    {"name": "Period 1", "start": "8:30", "end": "9:28"},
    {"name": "Period 2", "start": "9:34", "end": "10:37"},
    {"name": "Period 3", "start": "10:43", "end": "11:41"},
    {"name": "Lunch", "start": "11:41", "end": "12:21"},
    {"name": "Period 4", "start": "12:27", "end": "1:25"},
    {"name": "Period 5", "start": "1:31", "end": "2:29"},
    {"name": "Period 6", "start": "2:35", "end": "3:33"},
    {"name": "Period 7", "start": "3:39", "end": "4:37", "tags": ["optional", "seventh"]},
    {"name": "Period Ext", "start": "3:39", "end": "5:09", "tags": ["optional", "ext"]},
]


class TestResolveScheduleTimes:
    def _find(self, resolved, name):
        return next(p for p in resolved if p["name"] == name)

    def test_same_number_of_periods(self):
        assert len(resolve_schedule_times(NORMAL)) == len(NORMAL)

    def test_returns_time_objects(self):
        for p in resolve_schedule_times(NORMAL):
            assert isinstance(p["start"], time)
            assert isinstance(p["end"], time)

    def test_period_1_start(self):
        p1 = self._find(resolve_schedule_times(NORMAL), "Period 1")
        assert (p1["start"].hour, p1["start"].minute) == (8, 30)

    def test_period_4_start_unambiguous_am(self):
        p4 = self._find(resolve_schedule_times(NORMAL), "Period 4")
        assert (p4["start"].hour, p4["start"].minute) == (12, 27)

    def test_period_4_end_pm_inference(self):
        p4 = self._find(resolve_schedule_times(NORMAL), "Period 4")
        assert (p4["end"].hour, p4["end"].minute) == (13, 25)

    def test_period_5_start(self):
        p5 = self._find(resolve_schedule_times(NORMAL), "Period 5")
        assert (p5["start"].hour, p5["start"].minute) == (13, 31)

    def test_period_6_end(self):
        p6 = self._find(resolve_schedule_times(NORMAL), "Period 6")
        assert (p6["end"].hour, p6["end"].minute) == (15, 33)

    def test_period_7_end(self):
        p7 = self._find(resolve_schedule_times(NORMAL), "Period 7")
        assert (p7["end"].hour, p7["end"].minute) == (16, 37)

    def test_preserves_tags(self):
        p0 = self._find(resolve_schedule_times(NORMAL), "Period 0")
        assert p0["tags"] == ["optional", "zero"]


# ─── days_between ─────────────────────────────────────────────────────────────


class TestDaysBetween:
    def test_same_day(self):
        a = la_instant("2025-08-13T12:00:00")
        b = la_instant("2025-08-13T15:00:00")
        assert days_between(a, b) == 0

    def test_one_day(self):
        a = la_instant("2025-08-13T12:00:00")
        b = la_instant("2025-08-14T12:00:00")
        assert days_between(a, b) == 1

    def test_five_days(self):
        a = la_instant("2025-08-13T12:00:00")
        b = la_instant("2025-08-18T12:00:00")
        assert days_between(a, b) == 5

    def test_across_dst_spring_forward(self):
        a = la_instant("2025-03-09T12:00:00")
        b = la_instant("2025-03-10T12:00:00")
        assert days_between(a, b) == 1

    def test_negative_direction(self):
        a = la_instant("2025-08-15T12:00:00")
        b = la_instant("2025-08-13T12:00:00")
        assert days_between(a, b) == -2


# ─── includes_weekend ─────────────────────────────────────────────────────────


class TestIncludesWeekend:
    def test_mon_fri_no_weekend(self):
        start = la_instant("2025-08-18T16:00:00")
        end = la_instant("2025-08-22T08:30:00")
        assert includes_weekend(start, end, LA) is False

    def test_span_including_saturday(self):
        start = la_instant("2025-08-22T15:33:00")
        end = la_instant("2025-08-25T08:30:00")
        assert includes_weekend(start, end, LA) is True

    def test_span_including_sunday(self):
        start = la_instant("2025-08-24T12:00:00")
        end = la_instant("2025-08-25T08:30:00")
        assert includes_weekend(start, end, LA) is True

    def test_same_weekday_no_weekend(self):
        start = la_instant("2025-08-20T16:00:00")
        end = la_instant("2025-08-20T17:00:00")
        assert includes_weekend(start, end, LA) is False

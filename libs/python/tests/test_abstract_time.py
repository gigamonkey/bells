"""Mirror of the TypeScript abstract-time.test.ts suite."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from bells import BellSchedule
from bells.abstract_time import format_time, parse_time

TZ = "America/Los_Angeles"

# A synthetic year with the interesting calendar shapes: a Monday holiday
# (2025-10-13), a Thu–Fri holiday pair (Thanksgiving), a full vacation week
# (2026-02-16..20), a schedule variant missing period 3 (SHORT), a day with
# no numbered periods at all (ASSEMBLY), and non-numbered periods ("Lunch").
CALENDAR_DATA = {
    "year": "2025-2026",
    "timezone": TZ,
    "firstDay": "2025-09-02",
    "lastDay": "2026-06-12",
    "schedules": {
        "NORMAL": [
            {"name": "Period 1", "start": "8:30", "end": "9:30"},
            {"name": "Period 2", "start": "9:36", "end": "10:36"},
            {"name": "Lunch", "start": "10:36", "end": "11:06"},
            {"name": "Period 3", "start": "11:12", "end": "12:12"},
        ],
        "SHORT": [
            {"name": "Period 1", "start": "8:30", "end": "9:15"},
            {"name": "Period 2", "start": "9:21", "end": "10:06"},
        ],
        "FINALS": [
            {"name": "Period 1 Final", "start": "8:30", "end": "10:00"},
            {"name": "Period 2 Final", "start": "10:15", "end": "11:45"},
        ],
        "ASSEMBLY": [{"name": "Assembly", "start": "9:00", "end": "12:00"}],
    },
    "dates": {
        "2025-10-31": "SHORT",
        "2026-01-09": "ASSEMBLY",
        "2026-06-01": "FINALS",
    },
    "holidays": [
        "2025-10-13",  # a Monday
        "2025-11-27", "2025-11-28",  # Thu-Fri
        "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",  # vacation week
    ],
}


def pd(s: str):
    from datetime import date

    return date.fromisoformat(s)


def at(date_str: str, hour: int, minute: int) -> datetime:
    local = datetime(*map(int, date_str.split("-")), hour, minute, tzinfo=ZoneInfo(TZ))
    return local.astimezone(timezone.utc)


def make_bell_schedule(opts=None):
    return BellSchedule([CALENDAR_DATA], opts or {})


def bound(date_str, anchor, offset="+00:00"):
    return {"date": date_str, "anchor": anchor, "offset": offset}


# ─── parse_time ───────────────────────────────────────────────────────────────


class TestParseTime:
    def test_parses_a_bare_anchor(self):
        assert parse_time("start_of_period") == {"anchor": "start_of_period"}
        assert parse_time("midnight") == {"anchor": "midnight"}

    def test_parses_a_time_offset(self):
        assert parse_time("end_of_period -00:05") == {
            "anchor": "end_of_period",
            "offset": "-00:05",
        }
        assert parse_time("start_of_day +1:30") == {
            "anchor": "start_of_day",
            "offset": "+1:30",
        }

    def test_parses_school_day_offsets(self):
        assert parse_time("end_of_day +1 day")["day"] == {"type": "schoolDays", "n": 1}
        assert parse_time("start_of_day -2 days")["day"] == {"type": "schoolDays", "n": -2}

    def test_parses_week_offsets(self):
        assert parse_time("midnight +1 week")["day"] == {"type": "weeks", "n": 1}
        assert parse_time("midnight -3 weeks")["day"] == {"type": "weeks", "n": -3}

    def test_parses_weekday_names(self):
        assert parse_time("start_of_period monday")["day"] == {"type": "weekday", "weekday": 1}
        assert parse_time("midnight sun")["day"] == {"type": "weekday", "weekday": 7}

    def test_parses_week_boundaries(self):
        assert parse_time("start_of_day start of week")["day"] == {
            "type": "week", "edge": "start", "n": 0,
        }
        assert parse_time("end_of_day end of week")["day"] == {
            "type": "week", "edge": "end", "n": 0,
        }
        assert parse_time("start_of_day start of next week")["day"] == {
            "type": "week", "edge": "start", "n": 1,
        }
        assert parse_time("end_of_day end of next week")["day"] == {
            "type": "week", "edge": "end", "n": 1,
        }

    def test_parses_next_week_alias(self):
        assert parse_time("start_of_day next week")["day"] == {
            "type": "week", "edge": "start", "n": 1,
        }

    def test_parses_absolute_dates(self):
        assert parse_time("start_of_day 2026-01-05")["day"] == {
            "type": "date", "date": "2026-01-05",
        }

    def test_parses_offset_and_day_part_together(self):
        assert parse_time("end_of_period -00:05 +1 day") == {
            "anchor": "end_of_period",
            "offset": "-00:05",
            "day": {"type": "schoolDays", "n": 1},
        }

    def test_is_case_insensitive(self):
        assert parse_time("START_OF_DAY MONDAY") == parse_time("start_of_day monday")
        assert parse_time("Midnight Start Of Next Week") == parse_time(
            "midnight start of next week"
        )

    def test_throws_on_empty_spec(self):
        with pytest.raises(ValueError, match="Empty"):
            parse_time("")
        with pytest.raises(ValueError, match="Empty"):
            parse_time("   ")

    def test_throws_on_unknown_anchor(self):
        with pytest.raises(ValueError, match="start_of_lunch"):
            parse_time("start_of_lunch")

    def test_throws_on_malformed_offset(self):
        with pytest.raises(ValueError, match=r"\+00:99"):
            parse_time("start_of_day +00:99")

    def test_throws_on_unrecognized_day_parts(self):
        with pytest.raises(ValueError, match="someday"):
            parse_time("start_of_day someday")
        with pytest.raises(ValueError, match="1 day"):  # sign required
            parse_time("start_of_day 1 day")
        with pytest.raises(ValueError, match="end of last week"):
            parse_time("start_of_day end of last week")
        with pytest.raises(ValueError, match="2026-13-05"):
            parse_time("start_of_day 2026-13-05")


# ─── format_time ──────────────────────────────────────────────────────────────


class TestFormatTime:
    @staticmethod
    def canon(s):
        return format_time(parse_time(s))

    def test_round_trips_every_grammar_form(self):
        for s in [
            "start_of_period",
            "end_of_period -00:05",
            "end_of_day +1 day",
            "start_of_day -2 days",
            "midnight +1 week",
            "start_of_period monday",
            "end_of_day end of week",
            "start_of_day start of next week",
            "start_of_day 2026-01-05",
        ]:
            assert self.canon(s) == s

    def test_canonicalizes_non_canonical_input(self):
        assert self.canon("START_OF_DAY MON") == "start_of_day monday"
        assert self.canon("start_of_day next week") == "start_of_day start of next week"
        assert self.canon("end_of_day +1 days") == "end_of_day +1 day"
        assert self.canon("start_of_day +1:30") == "start_of_day +01:30"

    def test_omits_a_zero_offset(self):
        assert self.canon("midnight +00:00") == "midnight"
        assert format_time({"anchor": "midnight", "offset": "00:00"}) == "midnight"
        assert format_time({"anchor": "midnight", "offset": "-00:00"}) == "midnight"

    def test_throws_on_inexpressible_values(self):
        with pytest.raises(ValueError, match="n=2"):
            format_time({"anchor": "midnight", "day": {"type": "week", "edge": "start", "n": 2}})
        with pytest.raises(ValueError, match="weekday 8"):
            format_time({"anchor": "midnight", "day": {"type": "weekday", "weekday": 8}})


# ─── resolve_day ──────────────────────────────────────────────────────────────


class TestResolveDay:
    bs = make_bell_schedule()

    def test_returns_base_when_omitted(self):
        assert self.bs.resolve_day(pd("2025-10-06")) == pd("2025-10-06")

    def test_returns_absolute_dates_at_face_value(self):
        assert self.bs.resolve_day(pd("2025-10-06"), {"type": "date", "date": "2025-10-13"}) == pd(
            "2025-10-13"
        )

    def test_counts_school_days_past_weekends_and_holidays(self):
        assert self.bs.resolve_day(pd("2025-10-10"), {"type": "schoolDays", "n": 1}) == pd(
            "2025-10-14"
        )
        assert self.bs.resolve_day(pd("2025-10-14"), {"type": "schoolDays", "n": -1}) == pd(
            "2025-10-10"
        )
        assert self.bs.resolve_day(pd("2025-10-10"), {"type": "schoolDays", "n": 3}) == pd(
            "2025-10-16"
        )

    def test_counts_school_days_from_non_school_base(self):
        assert self.bs.resolve_day(pd("2025-10-11"), {"type": "schoolDays", "n": 1}) == pd(
            "2025-10-14"
        )
        assert self.bs.resolve_day(pd("2025-10-11"), {"type": "schoolDays", "n": -1}) == pd(
            "2025-10-10"
        )

    def test_returns_base_for_zero_school_days(self):
        assert self.bs.resolve_day(pd("2025-10-11"), {"type": "schoolDays", "n": 0}) == pd(
            "2025-10-11"
        )

    def test_takes_week_offsets_literally(self):
        assert self.bs.resolve_day(pd("2025-10-06"), {"type": "weeks", "n": 1}) == pd("2025-10-13")
        assert self.bs.resolve_day(pd("2025-10-13"), {"type": "weeks", "n": -1}) == pd("2025-10-06")

    def test_resolves_weekdays_strictly_after_base(self):
        assert self.bs.resolve_day(pd("2025-10-06"), {"type": "weekday", "weekday": 1}) == pd(
            "2025-10-13"
        )
        assert self.bs.resolve_day(pd("2025-10-06"), {"type": "weekday", "weekday": 5}) == pd(
            "2025-10-10"
        )
        assert self.bs.resolve_day(pd("2025-10-06"), {"type": "weekday", "weekday": 6}) == pd(
            "2025-10-11"
        )

    def test_rejects_out_of_range_weekdays(self):
        with pytest.raises(ValueError, match="weekday 0"):
            self.bs.resolve_day(pd("2025-10-06"), {"type": "weekday", "weekday": 0})

    def test_snaps_start_of_week_forward(self):
        assert self.bs.resolve_day(
            pd("2025-10-06"), {"type": "week", "edge": "start", "n": 1}
        ) == pd("2025-10-14")
        assert self.bs.resolve_day(
            pd("2025-10-15"), {"type": "week", "edge": "start", "n": 0}
        ) == pd("2025-10-14")

    def test_snaps_end_of_week_backward(self):
        assert self.bs.resolve_day(
            pd("2025-11-24"), {"type": "week", "edge": "end", "n": 0}
        ) == pd("2025-11-26")
        assert self.bs.resolve_day(
            pd("2025-11-17"), {"type": "week", "edge": "end", "n": 1}
        ) == pd("2025-11-26")
        assert self.bs.resolve_day(
            pd("2025-10-15"), {"type": "week", "edge": "end", "n": 0}
        ) == pd("2025-10-17")

    def test_advances_start_of_week_past_empty_week(self):
        assert self.bs.resolve_day(
            pd("2026-02-09"), {"type": "week", "edge": "start", "n": 1}
        ) == pd("2026-02-23")

    def test_throws_for_end_of_week_with_no_school_days(self):
        with pytest.raises(ValueError, match="no school days"):
            self.bs.resolve_day(pd("2026-02-09"), {"type": "week", "edge": "end", "n": 1})

    def test_throws_when_running_past_loaded_calendars(self):
        with pytest.raises(IndexError):
            self.bs.resolve_day(pd("2026-06-12"), {"type": "schoolDays", "n": 5})
        with pytest.raises(IndexError):
            self.bs.resolve_day(pd("2025-09-02"), {"type": "schoolDays", "n": -1})
        with pytest.raises(IndexError):
            self.bs.resolve_day(pd("2026-06-12"), {"type": "week", "edge": "start", "n": 1})


# ─── add_school_days ──────────────────────────────────────────────────────────


class TestAddSchoolDays:
    bs = make_bell_schedule()

    def test_returns_date_itself_for_zero(self):
        assert self.bs.add_school_days(pd("2025-10-13"), 0) == pd("2025-10-13")

    def test_counts_forward_and_backward(self):
        assert self.bs.add_school_days(pd("2025-10-10"), 2) == pd("2025-10-15")
        assert self.bs.add_school_days(pd("2025-10-14"), -2) == pd("2025-10-09")

    def test_rejects_non_integer_offsets(self):
        with pytest.raises(ValueError, match="integer"):
            self.bs.add_school_days(pd("2025-10-10"), 1.5)


# ─── bind_time ────────────────────────────────────────────────────────────────


class TestBindTime:
    bs = make_bell_schedule()

    @staticmethod
    def collect():
        warnings = []
        return warnings, warnings.append

    def test_binds_to_base_with_default_offset(self):
        warnings, on_warning = self.collect()
        b = self.bs.bind_time(pd("2025-10-06"), parse_time("start_of_period"), on_warning)
        assert b == {"date": "2025-10-06", "anchor": "start_of_period", "offset": "+00:00"}
        assert warnings == []

    def test_preserves_parsed_offset(self):
        _, on_warning = self.collect()
        b = self.bs.bind_time(pd("2025-10-06"), parse_time("end_of_period -00:05 +1 day"), on_warning)
        assert b == {"date": "2025-10-07", "anchor": "end_of_period", "offset": "-00:05"}

    def test_warns_when_weekday_lands_on_holiday(self):
        warnings, on_warning = self.collect()
        b = self.bs.bind_time(pd("2025-10-06"), parse_time("start_of_day monday"), on_warning)
        assert b["date"] == "2025-10-13"
        assert len(warnings) == 1
        assert "not a school day" in warnings[0]

    def test_warns_when_plus_one_week_lands_on_holiday(self):
        warnings, on_warning = self.collect()
        self.bs.bind_time(pd("2025-10-06"), parse_time("start_of_day +1 week"), on_warning)
        assert len(warnings) == 1
        assert "not a school day" in warnings[0]

    def test_does_not_warn_about_midnight_on_holiday(self):
        warnings, on_warning = self.collect()
        self.bs.bind_time(pd("2025-10-06"), parse_time("midnight +1 week"), on_warning)
        assert warnings == []

    def test_does_not_warn_when_start_of_week_snaps_within_week(self):
        warnings, on_warning = self.collect()
        b = self.bs.bind_time(pd("2025-10-06"), parse_time("start_of_day next week"), on_warning)
        assert b["date"] == "2025-10-14"
        assert warnings == []

    def test_warns_when_start_of_week_advances_past_empty_week(self):
        warnings, on_warning = self.collect()
        b = self.bs.bind_time(pd("2026-02-09"), parse_time("start_of_day next week"), on_warning)
        assert b["date"] == "2026-02-23"
        assert len(warnings) == 1
        assert "advanced" in warnings[0]

    def test_rejects_malformed_offsets_at_bind_time(self):
        with pytest.raises(ValueError, match="0:5"):
            self.bs.bind_time(pd("2025-10-06"), {"anchor": "midnight", "offset": "0:5"}, lambda w: None)


# ─── time_warnings ────────────────────────────────────────────────────────────


class TestTimeWarnings:
    bs = make_bell_schedule()

    def test_never_warns_about_midnight(self):
        assert self.bs.time_warnings(bound("2025-10-13", "midnight")) == []

    def test_warns_about_school_anchors_on_non_school_days(self):
        for anchor in ("start_of_period", "end_of_period", "start_of_day", "end_of_day"):
            ws = self.bs.time_warnings(bound("2025-10-13", anchor))
            assert len(ws) == 1
            assert "not a school day" in ws[0]

    def test_warns_about_period_anchors_with_no_numbered_periods(self):
        ws = self.bs.time_warnings(bound("2026-01-09", "start_of_period"))
        assert len(ws) == 1
        assert "no numbered periods" in ws[0]

    def test_does_not_warn_about_day_anchors_with_no_numbered_periods(self):
        assert self.bs.time_warnings(bound("2026-01-09", "start_of_day")) == []

    def test_returns_empty_for_sensible_specs(self):
        assert self.bs.time_warnings(bound("2025-10-14", "start_of_period")) == []

    def test_accepts_unsigned_offsets(self):
        assert self.bs.time_warnings(bound("2025-10-14", "start_of_period", "00:00")) == []


# ─── resolve_time ─────────────────────────────────────────────────────────────


class TestResolveTime:
    bs = make_bell_schedule()

    def test_resolves_midnight_on_any_date(self):
        z = self.bs.resolve_time(bound("2025-10-13", "midnight"))
        assert z is not None
        assert z.astimezone(timezone.utc) == at("2025-10-13", 0, 0)

    def test_resolves_start_and_end_of_day(self):
        start = self.bs.resolve_time(bound("2025-09-02", "start_of_day"))
        end = self.bs.resolve_time(bound("2025-09-02", "end_of_day"))
        assert start.astimezone(timezone.utc) == at("2025-09-02", 8, 30)
        assert end.astimezone(timezone.utc) == at("2025-09-02", 12, 12)

    def test_returns_none_for_day_anchors_on_non_school_days(self):
        assert self.bs.resolve_time(bound("2025-10-13", "start_of_day")) is None
        assert self.bs.resolve_time(bound("2025-10-11", "end_of_day")) is None

    def test_resolves_period_anchors_with_supplied_period(self):
        start = self.bs.resolve_time(bound("2025-09-02", "start_of_period"), 2)
        end = self.bs.resolve_time(bound("2025-09-02", "end_of_period"), 2)
        assert start.astimezone(timezone.utc) == at("2025-09-02", 9, 36)
        assert end.astimezone(timezone.utc) == at("2025-09-02", 10, 36)

    def test_applies_the_offset(self):
        z = self.bs.resolve_time(bound("2025-09-02", "end_of_period", "-00:05"), 1)
        assert z.astimezone(timezone.utc) == at("2025-09-02", 9, 25)

    def test_accepts_unsigned_offsets(self):
        z = self.bs.resolve_time(bound("2025-09-02", "start_of_period", "00:00"), 1)
        assert z.astimezone(timezone.utc) == at("2025-09-02", 8, 30)

    def test_returns_none_when_period_omitted(self):
        assert self.bs.resolve_time(bound("2025-09-02", "start_of_period")) is None

    def test_returns_none_when_no_such_period(self):
        assert self.bs.resolve_time(bound("2025-10-31", "start_of_period"), 3) is None
        p1 = self.bs.resolve_time(bound("2025-10-31", "start_of_period"), 1)
        assert p1.astimezone(timezone.utc) == at("2025-10-31", 8, 30)

    def test_applies_offsets_across_dst(self):
        # Fall-back is 2025-11-02 at 2:00. Midnight +4h elapsed = 3:00 PST.
        z = self.bs.resolve_time(bound("2025-11-02", "midnight", "+04:00"))
        assert z is not None
        assert z.hour == 3
        assert z.utcoffset().total_seconds() == -8 * 3600

    def test_rejects_malformed_offsets(self):
        with pytest.raises(ValueError, match="bogus"):
            self.bs.resolve_time(bound("2025-09-02", "midnight", "bogus"))


# ─── period_on_date ───────────────────────────────────────────────────────────


class TestPeriodOnDate:
    bs = make_bell_schedule()

    def test_finds_numbered_periods(self):
        p = self.bs.period_on_date(pd("2025-09-02"), 2)
        assert p is not None
        assert p["name"] == "Period 2"
        assert p["start"] == at("2025-09-02", 9, 36)

    def test_matches_period_1_final_as_period_1(self):
        p = self.bs.period_on_date(pd("2026-06-01"), 1)
        assert p is not None
        assert p["name"] == "Period 1 Final"

    def test_returns_none_for_missing_period_or_non_school_day(self):
        assert self.bs.period_on_date(pd("2025-10-31"), 3) is None
        assert self.bs.period_on_date(pd("2025-10-13"), 1) is None

    def test_uses_custom_matcher(self):
        custom = make_bell_schedule(
            {"period_number": lambda p: 0 if p["name"] == "Lunch" else None}
        )
        p = custom.period_on_date(pd("2025-09-02"), 0)
        assert p is not None
        assert p["name"] == "Lunch"
        assert custom.period_on_date(pd("2025-09-02"), 1) is None


# ─── current_or_next_period_number ────────────────────────────────────────────


class TestCurrentOrNextPeriodNumber:
    bs = make_bell_schedule()

    def test_returns_containing_period_number(self):
        assert self.bs.current_or_next_period_number(at("2025-09-03", 10, 0)) == 2

    def test_skips_non_numbered_periods(self):
        assert self.bs.current_or_next_period_number(at("2025-09-03", 10, 50)) == 3

    def test_returns_first_period_before_school(self):
        assert self.bs.current_or_next_period_number(at("2025-09-03", 7, 0)) == 1

    def test_returns_none_after_last_period(self):
        assert self.bs.current_or_next_period_number(at("2025-09-03", 13, 0)) is None

    def test_returns_none_on_non_school_days(self):
        assert self.bs.current_or_next_period_number(at("2025-10-13", 10, 0)) is None

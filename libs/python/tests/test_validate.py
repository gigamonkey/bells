import copy

from bells.validate import validate_calendar_data

# ─── Shared valid fixture ─────────────────────────────────────────────────────

VALID_DATA = [
    {
        "year": "2025-2026",
        "id": "test",
        "name": "Test School",
        "timezone": "America/Los_Angeles",
        "firstDay": "2025-08-13",
        "firstDayTeachers": "2025-08-11",
        "lastDay": "2026-06-04",
        "schedules": {
            "NORMAL": [
                {"name": "Period 0", "start": "13:00", "end": "13:30", "tags": ["optional", "zero"]},
                {"name": "Period 1", "start": "13:35", "end": "14:05"},
                {"name": "Period 2", "start": "14:10", "end": "14:40"},
                {"name": "Period 3", "start": "14:45", "end": "15:15"},
                {"name": "Lunch", "start": "15:20", "end": "15:50"},
                {"name": "Period 4", "start": "15:55", "end": "16:25"},
                {"name": "Period 5", "start": "16:30", "end": "17:00"},
                {"name": "Period 6", "start": "17:05", "end": "17:35"},
                {"name": "Period 7", "start": "17:40", "end": "18:10", "tags": ["optional", "seventh"]},
                {"name": "Period Ext", "start": "17:40", "end": "18:30", "tags": ["optional", "ext"]},
            ],
            "LATE_START": [
                {"name": "Staff meeting", "start": "13:00", "end": "14:00", "teachers": True},
                {"name": "Period 1", "start": "14:10", "end": "14:50"},
                {"name": "Period 2", "start": "14:55", "end": "15:35"},
                {"name": "Period 3", "start": "15:40", "end": "16:20"},
                {"name": "Lunch", "start": "16:25", "end": "16:55"},
                {"name": "Period 4", "start": "17:00", "end": "17:40"},
                {"name": "Period 5", "start": "17:45", "end": "18:25"},
                {"name": "Period 6", "start": "18:30", "end": "19:10"},
            ],
        },
        "weekdaySchedules": {"monday": "LATE_START"},
        "holidays": ["2025-09-01", "2025-11-27"],
        "teacherWorkDays": [],
        "breakNames": {"2025-11-26": "Thanksgiving Break"},
    }
]


def with_patch(patcher):
    clone = copy.deepcopy(VALID_DATA)
    patcher(clone[0])
    return clone


# ─── Tests ────────────────────────────────────────────────────────────────────


class TestValidData:
    def test_valid_fixture(self):
        result = validate_calendar_data(VALID_DATA)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_single_object(self):
        assert validate_calendar_data(VALID_DATA[0])["valid"] is True


class TestMissingRequiredFields:
    def test_each_field(self):
        for field in ("year", "id", "name", "timezone", "firstDay", "lastDay", "schedules"):
            data = with_patch(lambda d, f=field: d.pop(f))
            result = validate_calendar_data(data)
            assert result["valid"] is False
            assert any(field in e for e in result["errors"]), field

    def test_missing_normal(self):
        data = with_patch(lambda d: d["schedules"].pop("NORMAL"))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("NORMAL" in e for e in result["errors"])


class TestWeekdaySchedules:
    def test_unknown_schedule(self):
        data = with_patch(lambda d: d.__setitem__("weekdaySchedules", {"monday": "BOGUS"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("BOGUS" in e for e in result["errors"])

    def test_invalid_weekday_key(self):
        data = with_patch(lambda d: d.__setitem__("weekdaySchedules", {"funday": "NORMAL"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("funday" in e for e in result["errors"])

    def test_saturday_not_allowed(self):
        data = with_patch(lambda d: d.__setitem__("weekdaySchedules", {"saturday": "NORMAL"}))
        assert validate_calendar_data(data)["valid"] is False

    def test_missing_weekday_schedules_valid(self):
        data = with_patch(lambda d: d.pop("weekdaySchedules"))
        assert validate_calendar_data(data)["valid"] is True


class TestDates:
    def test_inline_array_valid(self):
        data = with_patch(lambda d: d.__setitem__("dates", {"2025-09-15": [{"name": "X", "start": "13:00", "end": "14:00"}]}))
        assert validate_calendar_data(data)["valid"] is True

    def test_schedule_name_valid(self):
        data = with_patch(lambda d: d.__setitem__("dates", {"2025-09-15": "LATE_START"}))
        assert validate_calendar_data(data)["valid"] is True

    def test_unknown_schedule_name(self):
        data = with_patch(lambda d: d.__setitem__("dates", {"2025-09-15": "BOGUS"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("BOGUS" in e for e in result["errors"])

    def test_date_out_of_range(self):
        data = with_patch(lambda d: d.__setitem__("dates", {"2024-01-01": "NORMAL"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("2024-01-01" in e for e in result["errors"])

    def test_inline_bad_times(self):
        data = with_patch(lambda d: d.__setitem__("dates", {"2025-09-15": [{"name": "Bad", "start": "14:00", "end": "13:00"}]}))
        assert validate_calendar_data(data)["valid"] is False


class TestInvalidTimezone:
    def test_bogus(self):
        data = with_patch(lambda d: d.__setitem__("timezone", "Not/ATimezone"))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("timezone" in e.lower() for e in result["errors"])


class TestFirstDayTeachers:
    def test_after_first_day(self):
        data = with_patch(lambda d: d.__setitem__("firstDayTeachers", "2025-08-20"))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("firstDayTeachers" in e for e in result["errors"])

    def test_same_as_first_day(self):
        data = with_patch(lambda d: d.__setitem__("firstDayTeachers", "2025-08-13"))
        assert validate_calendar_data(data)["valid"] is True

    def test_before_first_day(self):
        data = with_patch(lambda d: d.__setitem__("firstDayTeachers", "2025-08-11"))
        assert validate_calendar_data(data)["valid"] is True


class TestDateRangeChecks:
    def test_holiday_before_first_day_teachers(self):
        data = with_patch(lambda d: d.__setitem__("holidays", ["2025-08-01"]))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("holiday" in e and "2025-08-01" in e for e in result["errors"])

    def test_holiday_after_last_day(self):
        data = with_patch(lambda d: d.__setitem__("holidays", ["2027-01-01"]))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("holiday" in e and "2027-01-01" in e for e in result["errors"])

    def test_holiday_in_range(self):
        data = with_patch(lambda d: d.__setitem__("holidays", ["2025-09-01"]))
        assert validate_calendar_data(data)["valid"] is True

    def test_dates_key_outside_range(self):
        data = with_patch(lambda d: d.__setitem__("dates", {"2024-01-01": [{"name": "Test", "start": "8:00", "end": "9:00"}]}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("2024-01-01" in e for e in result["errors"])

    def test_dates_key_within_range(self):
        data = with_patch(lambda d: d.__setitem__("dates", {"2025-09-15": [{"name": "Assembly", "start": "8:30", "end": "15:33"}]}))
        assert validate_calendar_data(data)["valid"] is True

    def test_break_names_outside_range(self):
        data = with_patch(lambda d: d.__setitem__("breakNames", {"2024-12-25": "Winter Break"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("2024-12-25" in e for e in result["errors"])


class TestPeriodTimeValidation:
    def test_neither_am_nor_pm_after_previous(self):
        data = with_patch(lambda d: d["schedules"].__setitem__("NORMAL", [
            {"name": "Late", "start": "20:00", "end": "20:30"},
            {"name": "Trouble", "start": "7:00", "end": "8:00"},
        ]))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("ambiguous" in e for e in result["errors"])

    def test_start_after_end(self):
        data = with_patch(lambda d: d["schedules"].__setitem__("NORMAL", [
            {"name": "Bad period", "start": "14:00", "end": "13:00"},
        ]))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("Bad period" in e and "not before" in e for e in result["errors"])

    def test_start_equals_end(self):
        data = with_patch(lambda d: d["schedules"].__setitem__("NORMAL", [
            {"name": "Zero duration", "start": "14:00", "end": "14:00"},
        ]))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("Zero duration" in e for e in result["errors"])


class TestOverlappingPeriods:
    def test_two_overlapping_non_optional(self):
        data = with_patch(lambda d: d["schedules"].__setitem__("NORMAL", [
            {"name": "Period A", "start": "13:00", "end": "14:30"},
            {"name": "Period B", "start": "14:00", "end": "15:00"},
        ]))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("overlap" in e for e in result["errors"])

    def test_optional_same_time_no_overlap(self):
        assert validate_calendar_data(VALID_DATA)["valid"] is True

    def test_adjacent_not_overlapping(self):
        data = with_patch(lambda d: d["schedules"].__setitem__("NORMAL", [
            {"name": "Period A", "start": "13:00", "end": "14:00"},
            {"name": "Period B", "start": "14:00", "end": "15:00"},
        ]))
        result = validate_calendar_data(data)
        assert len([e for e in result["errors"] if "overlap" in e]) == 0


class TestNonClassDaysValidation:
    def with_non_class(self, entries, extra_dates=None):
        extra_dates = extra_dates or {}

        def patcher(d):
            d["dates"] = {**{k: "NORMAL" for k in entries}, **extra_dates}
            d["nonClassDays"] = entries

        return with_patch(patcher)

    def test_all_valid(self):
        data = self.with_non_class({"2026-06-01": "exam", "2026-06-04": "bonus"})
        result = validate_calendar_data(data)
        assert result["valid"] is True, result["errors"]

    def test_invalid_date_string(self):
        data = self.with_non_class({"not-a-date": "exam"})
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("not-a-date" in e for e in result["errors"])

    def test_out_of_range(self):
        data = with_patch(lambda d: d.__setitem__("nonClassDays", {"2024-01-01": "exam"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("2024-01-01" in e for e in result["errors"])

    def test_weekend_date(self):
        data = with_patch(lambda d: d.__setitem__("nonClassDays", {"2025-09-06": "exam"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("weekend" in e for e in result["errors"])

    def test_holiday_date(self):
        data = with_patch(lambda d: d.__setitem__("nonClassDays", {"2025-09-01": "exam"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("holiday" in e for e in result["errors"])

    def test_not_in_dates_map(self):
        data = with_patch(lambda d: d.__setitem__("nonClassDays", {"2025-08-19": "exam"}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("NORMAL schedule" in e for e in result["errors"])

    def test_non_string_label(self):
        data = self.with_non_class({"2026-06-01": 42})
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("non-empty string" in e for e in result["errors"])

    def test_empty_string_label(self):
        data = self.with_non_class({"2026-06-01": ""})
        assert validate_calendar_data(data)["valid"] is False

    def test_missing_non_class_days_valid(self):
        data = with_patch(lambda d: d.pop("nonClassDays", None))
        assert validate_calendar_data(data)["valid"] is True


class TestEdgeCases:
    def test_none_data(self):
        result = validate_calendar_data(None)
        assert result["valid"] is False
        assert len(result["errors"]) > 0

    def test_empty_array(self):
        result = validate_calendar_data([])
        assert result["valid"] is False
        assert len(result["errors"]) > 0

    def test_error_in_second_year(self):
        data = [VALID_DATA[0], {**VALID_DATA[0], "year": "2026-2027", "timezone": "Bad/Zone"}]
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("timezone" in e or "Bad/Zone" in e for e in result["errors"])


class TestMalformedInput:
    """Malformed (wrong-type) input must be reported, never crash."""

    def test_non_object_array_element(self):
        # A primitive where a year object is expected: report missing fields,
        # don't crash. Matches the JS reference and the Java port.
        result = validate_calendar_data([42])
        assert result["valid"] is False
        assert any('missing required field "year"' in e for e in result["errors"])
        assert any('missing required field "schedules"' in e for e in result["errors"])

    def test_non_object_element_alongside_valid(self):
        data = [VALID_DATA[0], "not a year"]
        result = validate_calendar_data(data)
        assert result["valid"] is False
        # The valid year is still validated; the bad element reports missing fields.
        assert any("Year 1" in e and "missing required field" in e for e in result["errors"])

    def test_empty_object_schedules_is_present_not_missing(self):
        # An empty (but present) object is truthy in JS, so `schedules` is not
        # "missing"; instead schedules.NORMAL is reported missing.
        data = with_patch(lambda d: d.__setitem__("schedules", {}))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("missing schedules.NORMAL" in e for e in result["errors"])
        assert not any('missing required field "schedules"' in e for e in result["errors"])

    def test_malformed_container_does_not_crash(self):
        # weekdaySchedules given a non-object: must not raise.
        data = with_patch(lambda d: d.__setitem__("weekdaySchedules", 42))
        result = validate_calendar_data(data)
        assert isinstance(result["valid"], bool)

    def test_empty_year_labelled_unknown(self):
        data = with_patch(lambda d: d.__setitem__("year", ""))
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert any("Year 0 (unknown)" in e for e in result["errors"])

    def test_multiple_ids_reported_in_insertion_order(self):
        data = [
            {**VALID_DATA[0], "id": "aaa"},
            {**VALID_DATA[0], "id": "bbb"},
            {**VALID_DATA[0], "id": "ccc"},
        ]
        result = validate_calendar_data(data)
        assert result["valid"] is False
        assert 'Calendar array mixes multiple ids: "aaa", "bbb", "ccc"' in result["errors"]

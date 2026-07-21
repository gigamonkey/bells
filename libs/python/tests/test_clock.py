from datetime import timedelta

import pytest
from conftest import la_instant

from bells import (
    BellSchedule,
    clear_debug_time,
    get_debug_offset,
    set_debug_offset,
    set_debug_time,
)

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
    },
    "weekdaySchedules": {},
    "holidays": [],
    "teacherWorkDays": [],
    "breakNames": {},
}


def make_bs():
    return BellSchedule([CALENDAR_DATA], {"role": "student", "include_tags": {}})


# A moment inside Period 1 on Tuesday 2025-08-19 (a normal school day).
DURING_PERIOD_1 = la_instant("2025-08-19T08:45")


@pytest.fixture(autouse=True)
def _reset_clock():
    yield
    clear_debug_time()


def test_defaults_to_real_clock():
    assert get_debug_offset() is None


def test_set_debug_time_drives_time_defaulting_methods():
    # Sanity: explicit instant resolves to Period 1.
    assert make_bs().current_interval(DURING_PERIOD_1).name == "Period 1"
    set_debug_time(DURING_PERIOD_1)
    # No argument -> uses the debug time.
    assert make_bs().current_interval().name == "Period 1"
    assert make_bs().period_at().name == "Period 1"


def test_clear_debug_time_restores_real_clock():
    set_debug_time(DURING_PERIOD_1)
    assert get_debug_offset() is not None
    clear_debug_time()
    assert get_debug_offset() is None


def test_set_debug_offset_and_set_debug_time_agree():
    set_debug_time(DURING_PERIOD_1)
    via_time = make_bs().current_interval().name
    offset = get_debug_offset()
    clear_debug_time()
    assert offset is not None
    set_debug_offset(offset)
    assert make_bs().current_interval().name == via_time


def test_explicit_instant_overrides_debug_offset():
    # Pretend it is a summer day with no school...
    set_debug_time(la_instant("2025-07-15T12:00"))
    assert make_bs().current_interval() is None
    # ...but an explicit instant still wins.
    assert make_bs().current_interval(DURING_PERIOD_1).name == "Period 1"


def test_set_debug_offset_accepts_timedelta():
    set_debug_offset(timedelta(hours=-3))
    assert get_debug_offset() == timedelta(hours=-3)

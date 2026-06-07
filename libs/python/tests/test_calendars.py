"""Tests for the Calendars file loader."""

import json
from datetime import date

from bells import Calendars

YEAR = {
    "year": "2025-2026",
    "id": "loader-test",
    "name": "Loader Test",
    "timezone": "America/Los_Angeles",
    "firstDay": "2025-08-13",
    "lastDay": "2026-06-04",
    "schedules": {"NORMAL": [{"name": "Period 1", "start": "8:30", "end": "9:28"}]},
}


def _calendars(tmp_path, payload):
    (tmp_path / "2025-2026.json").write_text(json.dumps(payload), encoding="utf-8")
    return Calendars(str(tmp_path) + "/")


class TestForYear:
    def test_loads_from_array_file(self, tmp_path):
        bs = _calendars(tmp_path, [YEAR]).for_year("2025-2026")
        assert bs.timezone == "America/Los_Angeles"
        assert bs.is_school_day(date(2025, 8, 13)) is True  # Wednesday
        assert bs.is_school_day(date(2025, 8, 16)) is False  # Saturday

    def test_loads_from_single_object_file(self, tmp_path):
        # A file holding a single year object (not an array) is normalized.
        bs = _calendars(tmp_path, YEAR).for_year("2025-2026")
        assert bs.timezone == "America/Los_Angeles"

    def test_caches_loaded_year(self, tmp_path):
        cals = _calendars(tmp_path, [YEAR])
        cals.for_year("2025-2026")
        (tmp_path / "2025-2026.json").unlink()  # cached load must still succeed
        assert cals.for_year("2025-2026").timezone == "America/Los_Angeles"

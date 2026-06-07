"""Calendars — per-year file loader.

Python counterpart of the JavaScript ``calendars.js`` module. Loads year JSON
files from a directory path or a base URL.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.request import urlopen

from .bell_schedule import BellSchedule
from .datetimeutil import _instant_to_date, _now_instant


class Calendars:
    """Loads per-year calendar JSON files lazily and builds BellSchedules."""

    def __init__(self, base_path: str):
        """``base_path`` is a directory path (e.g. ``'./calendars/'``) or URL base."""
        self._base_path = base_path
        self._cache: dict[str, list[dict]] = {}

    def _load(self, year: str) -> list[dict]:
        if year in self._cache:
            return self._cache[year]

        file_path = f"{self._base_path}{year}.json"

        if self._base_path.startswith("http://") or self._base_path.startswith("https://"):
            with urlopen(file_path) as res:
                data = json.loads(res.read().decode("utf-8"))
        else:
            text = Path(file_path).read_text(encoding="utf-8")
            data = json.loads(text)

        arr = data if isinstance(data, list) else [data]
        self._cache[year] = arr
        return arr

    def for_year(self, year: str, options: Optional[dict] = None) -> BellSchedule:
        """Build a BellSchedule for a specific academic year (e.g. ``'2025-2026'``)."""
        arr = self._load(year)
        return BellSchedule(arr, options or {})

    def current(self, options: Optional[dict] = None, tz: Optional[str] = None) -> BellSchedule:
        """Build a BellSchedule appropriate for the current date.

        During summer, loads both the most recent ended year and the next
        upcoming year so summer-bounds and next-year-start queries work.

        "Today" defaults to the system-local date; pass ``tz`` (an IANA name) to
        anchor the academic-year rollover to a specific zone (e.g. the school's)
        when running elsewhere — e.g. a server in UTC.
        """
        today = _instant_to_date(_now_instant(), tz) if tz else date.today()
        year = self._academic_year_for(today)

        primary_arr = self._load(year)
        first_day = primary_arr[0].get("firstDayTeachers") or primary_arr[0]["firstDay"]
        last_day = primary_arr[0]["lastDay"]
        today_str = today.isoformat()
        in_year = first_day <= today_str <= last_day

        if in_year:
            return BellSchedule(primary_arr, options or {})

        # Summer — load adjacent year.
        all_data = list(primary_arr)

        if today_str > last_day:
            # After this year's end — load the next academic year.
            next_year_label = self._next_academic_year(year)
            try:
                all_data.extend(self._load(next_year_label))
            except Exception:
                pass  # Next year data not available; that's fine.
        else:
            # Before this year's start — load the previous academic year.
            prev_year_label = self._prev_academic_year(year)
            try:
                all_data[:0] = self._load(prev_year_label)
            except Exception:
                pass  # Previous year data not available; that's fine.

        return BellSchedule(all_data, options or {})

    def _academic_year_for(self, d: date) -> str:
        """Academic year label for a date. The academic year starts in August."""
        month, year = d.month, d.year
        if month >= 8:
            return f"{year}-{year + 1}"
        return f"{year - 1}-{year}"

    def _next_academic_year(self, year: str) -> str:
        start = int(year.split("-")[0])
        return f"{start + 1}-{start + 2}"

    def _prev_academic_year(self, year: str) -> str:
        start = int(year.split("-")[0])
        return f"{start - 1}-{start}"

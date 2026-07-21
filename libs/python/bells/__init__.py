"""bells — a framework-agnostic library for querying school bell schedules.

Python port of the ``@peterseibel/bells`` JavaScript library. Built on the
standard library ``datetime`` and ``zoneinfo`` modules instead of Temporal.
"""

from .abstract_time import format_time, parse_time
from .bell_schedule import BellSchedule
from .calendar import Calendar, Interval, Period, Schedule, normalize_include_tags
from .calendars import Calendars
from .datetimeutil import (
    clear_debug_time,
    get_debug_offset,
    set_debug_offset,
    set_debug_time,
)
from .validate import validate_calendar_data

__all__ = [
    "BellSchedule",
    "Calendars",
    "Calendar",
    "Schedule",
    "Period",
    "Interval",
    "normalize_include_tags",
    "validate_calendar_data",
    "parse_time",
    "format_time",
    "set_debug_time",
    "set_debug_offset",
    "clear_debug_time",
    "get_debug_offset",
]

__version__ = "0.5.0"

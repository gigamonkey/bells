"""Shared test helpers."""

import sys
from datetime import date, datetime, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

# Make the package importable when running pytest from the python directory
# without an editable install.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

LA = "America/Los_Angeles"


def la_instant(iso_local: str) -> datetime:
    """A UTC instant from a local wall-clock datetime string in LA."""
    naive = datetime.fromisoformat(iso_local)
    return naive.replace(tzinfo=ZoneInfo(LA)).astimezone(timezone.utc)


def pd(s: str) -> date:
    return date.fromisoformat(s)


def pt(hour: int, minute: int) -> time:
    return time(hour=hour, minute=minute)

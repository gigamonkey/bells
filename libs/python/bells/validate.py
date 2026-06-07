"""Validates calendar data objects.

Python counterpart of the JavaScript ``validate.js`` module. Error and warning
message strings match the JS implementation so downstream tooling stays
consistent.
"""

from __future__ import annotations

from datetime import date
from typing import Optional
from zoneinfo import ZoneInfo

from .datetimeutil import parse_plain_date, parse_plain_time


def _is_valid_timezone(tz: str) -> bool:
    """Whether ``tz`` is a valid IANA timezone identifier."""
    try:
        ZoneInfo(tz)
        return True
    except Exception:
        return False


def _try_parse_date(s) -> Optional[date]:
    """Parse a date string; return ``None`` if invalid."""
    if not isinstance(s, str):
        return None
    try:
        return parse_plain_date(s)
    except ValueError:
        return None


def _validate_period_times(periods: list[dict], schedule_label: str) -> list[str]:
    """Validate all time strings in a schedule's period list."""
    errors: list[str] = []
    last_time = None

    for p in periods:
        if not p.get("start") or not p.get("end"):
            errors.append(f'{schedule_label}: period "{p.get("name")}" missing start or end')
            continue

        optional = "optional" in (p.get("tags") or [])
        start_time, start_ambiguous = parse_plain_time(p["start"], last_time)
        if start_ambiguous:
            errors.append(
                f'{schedule_label}: period "{p["name"]}" start time "{p["start"]}" is ambiguous'
            )

        end_time, end_ambiguous = parse_plain_time(p["end"], start_time)
        if end_ambiguous:
            errors.append(
                f'{schedule_label}: period "{p["name"]}" end time "{p["end"]}" is ambiguous'
            )

        start_minutes = start_time.hour * 60 + start_time.minute
        end_minutes = end_time.hour * 60 + end_time.minute
        if start_minutes >= end_minutes:
            errors.append(
                f'{schedule_label}: period "{p["name"]}" start ({p["start"]}) '
                f'is not before end ({p["end"]})'
            )

        # Don't advance last_time for optional periods — they may run
        # concurrently with the previous period.
        if not optional:
            last_time = end_time

    return errors


def _validate_no_overlap(periods: list[dict], schedule_label: str) -> dict:
    """Check for overlapping non-optional periods.

    Student-vs-student overlaps are errors; teacher-vs-student overlaps are
    warnings (teacher schedules run on a separate track).
    """
    errors: list[str] = []
    warnings: list[str] = []

    student_periods = []
    teacher_periods = []
    last_time = None
    for p in periods:
        if not p.get("start") or not p.get("end"):
            continue

        optional = "optional" in (p.get("tags") or [])
        start_time, _ = parse_plain_time(p["start"], last_time)
        end_time, _ = parse_plain_time(p["end"], start_time)

        if not optional:
            last_time = end_time
            entry = {"name": p["name"], "start": start_time, "end": end_time}
            if p.get("teachers"):
                teacher_periods.append(entry)
            else:
                student_periods.append(entry)

    def overlaps(a, b) -> bool:
        a_start = a["start"].hour * 60 + a["start"].minute
        a_end = a["end"].hour * 60 + a["end"].minute
        b_start = b["start"].hour * 60 + b["start"].minute
        b_end = b["end"].hour * 60 + b["end"].minute
        return a_start < b_end and b_start < a_end

    # Student vs student: errors.
    for i in range(len(student_periods)):
        for j in range(i + 1, len(student_periods)):
            if overlaps(student_periods[i], student_periods[j]):
                errors.append(
                    f'{schedule_label}: periods "{student_periods[i]["name"]}" '
                    f'and "{student_periods[j]["name"]}" overlap'
                )

    # Teacher vs student: warnings.
    for t in teacher_periods:
        for s in student_periods:
            if overlaps(t, s):
                warnings.append(
                    f'{schedule_label}: teacher period "{t["name"]}" '
                    f'overlaps student period "{s["name"]}"'
                )

    return {"errors": errors, "warnings": warnings}


def _validate_year(year: dict, index: int) -> dict:
    """Validate a single year data object."""
    errors: list[str] = []
    warnings: list[str] = []
    label = f"Year {index} ({year.get('year') or 'unknown'})"

    # 1. Required fields.
    for field in ("year", "id", "name", "timezone", "firstDay", "lastDay", "schedules"):
        if not year.get(field):
            errors.append(f'{label}: missing required field "{field}"')

    schedules = year.get("schedules")
    if isinstance(schedules, dict):
        if not isinstance(schedules.get("NORMAL"), list):
            errors.append(f"{label}: missing schedules.NORMAL")
        for key, value in schedules.items():
            if not isinstance(value, list):
                errors.append(f"{label}: schedules.{key} must be an array of periods")

    # Stop if basic structure is broken.
    if errors:
        return {"errors": errors, "warnings": warnings}

    # 2. Timezone validity.
    if not _is_valid_timezone(year["timezone"]):
        errors.append(f'{label}: "{year["timezone"]}" is not a valid IANA timezone identifier')

    # 3. Parse dates.
    first_day = _try_parse_date(year["firstDay"])
    last_day = _try_parse_date(year["lastDay"])

    if not first_day:
        errors.append(f'{label}: invalid firstDay "{year["firstDay"]}"')
    if not last_day:
        errors.append(f'{label}: invalid lastDay "{year["lastDay"]}"')

    range_start = first_day

    if year.get("firstDayTeachers"):
        first_day_teachers = _try_parse_date(year["firstDayTeachers"])
        if not first_day_teachers:
            errors.append(f'{label}: invalid firstDayTeachers "{year["firstDayTeachers"]}"')
        elif first_day and first_day_teachers > first_day:
            errors.append(f"{label}: firstDayTeachers must not be after firstDay")
        else:
            range_start = first_day_teachers

    # 4. Range check for dates in schedules keys, holidays, etc.
    def in_range(date_str: str) -> bool:
        d = _try_parse_date(date_str)
        if not d:
            return False
        if not range_start or not last_day:
            return True  # can't check without bounds
        return range_start <= d <= last_day

    VALID_WEEKDAYS = {"monday", "tuesday", "wednesday", "thursday", "friday"}
    for day, name in (year.get("weekdaySchedules") or {}).items():
        if day not in VALID_WEEKDAYS:
            errors.append(f'{label}: weekdaySchedules key "{day}" is not a valid weekday name')
        if not isinstance(name, str) or name not in (year.get("schedules") or {}):
            errors.append(
                f'{label}: weekdaySchedules.{day} references unknown schedule "{name}"'
            )

    for key, value in (year.get("dates") or {}).items():
        if not _try_parse_date(key):
            errors.append(f'{label}: dates key "{key}" is not a valid date')
        elif not in_range(key):
            errors.append(f'{label}: dates key "{key}" is outside the calendar year range')
        if isinstance(value, str):
            if value not in (year.get("schedules") or {}):
                errors.append(f'{label}: dates.{key} references unknown schedule "{value}"')
        elif not isinstance(value, list):
            errors.append(
                f"{label}: dates.{key} must be a schedule name or an array of periods"
            )

    for d in year.get("holidays") or []:
        if not in_range(d):
            errors.append(f'{label}: holiday "{d}" is outside the calendar year range')

    for d in year.get("teacherWorkDays") or []:
        if not in_range(d):
            errors.append(f'{label}: teacherWorkDay "{d}" is outside the calendar year range')

    for key in (year.get("breakNames") or {}).keys():
        if not in_range(key):
            errors.append(f'{label}: breakNames key "{key}" is outside the calendar year range')

    holiday_set = set(year.get("holidays") or [])
    for key, value in (year.get("nonClassDays") or {}).items():
        d = _try_parse_date(key)
        if not d:
            errors.append(f'{label}: nonClassDays key "{key}" is not a valid date')
            continue
        if not in_range(key):
            errors.append(f'{label}: nonClassDays key "{key}" is outside the calendar year range')
            continue
        dow = d.isoweekday()
        if dow == 6 or dow == 7:
            errors.append(f'{label}: nonClassDays date "{key}" falls on a weekend')
        elif key in holiday_set:
            errors.append(f'{label}: nonClassDays date "{key}" is also a holiday')
        elif key not in (year.get("dates") or {}):
            errors.append(
                f'{label}: nonClassDays date "{key}" has no entry in dates (uses NORMAL schedule)'
            )
        if not isinstance(value, str) or len(value) == 0:
            errors.append(f"{label}: nonClassDays.{key} must be a non-empty string label")

    # 5. Validate period times in all schedules.
    all_schedules = []
    for key, periods in (year.get("schedules") or {}).items():
        if isinstance(periods, list):
            all_schedules.append((periods, f"{label} schedules.{key}"))
    for key, value in (year.get("dates") or {}).items():
        if isinstance(value, list):
            all_schedules.append((value, f"{label} dates.{key}"))

    for periods, schedule_label in all_schedules:
        errors.extend(_validate_period_times(periods, schedule_label))
        overlap = _validate_no_overlap(periods, schedule_label)
        errors.extend(overlap["errors"])
        warnings.extend(overlap["warnings"])

    return {"errors": errors, "warnings": warnings}


def validate_calendar_data(data) -> dict:
    """Validate calendar data (a single year object or a list of them).

    Returns a dict with keys ``valid`` (bool), ``errors`` (list[str]), and
    ``warnings`` (list[str]).
    """
    errors: list[str] = []
    warnings: list[str] = []

    if data is None or not isinstance(data, (dict, list)):
        return {"valid": False, "errors": ["Data must be an object or array"], "warnings": []}

    arr = data if isinstance(data, list) else [data]

    if len(arr) == 0:
        return {"valid": False, "errors": ["Data array is empty"], "warnings": []}

    for i, year in enumerate(arr):
        result = _validate_year(year, i)
        errors.extend(result["errors"])
        warnings.extend(result["warnings"])

    # All entries in an array must share the same id.
    ids = {y.get("id") for y in arr if y.get("id") is not None}
    if len(ids) > 1:
        joined = ", ".join(f'"{s}"' for s in ids)
        errors.append(f"Calendar array mixes multiple ids: {joined}")

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}

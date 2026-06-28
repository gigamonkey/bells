"""Validates calendar data objects.

Python counterpart of the JavaScript ``validate.js`` module. Error and warning
message strings match the JS implementation so downstream tooling stays
consistent.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from .datetimeutil import parse_plain_date, parse_plain_time


REQUIRED_FIELDS = ("year", "id", "name", "timezone", "firstDay", "lastDay", "schedules")


def _is_falsy(value) -> bool:
    """Whether ``value`` is falsy in the JavaScript sense.

    The JS reference uses ``!value`` and ``value || default`` throughout, so an
    empty string, ``0``, ``False``, ``None``/missing, and ``NaN`` are falsy,
    while empty objects/arrays (``{}``/``[]``) are truthy. Mirrors Java's
    ``Validator.isFalsy``.
    """
    if value is None or value is False:
        return True
    if isinstance(value, str):
        return value == ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value == 0 or value != value  # 0 or NaN
    return False  # objects and arrays are truthy


def _as_dict(value) -> dict:
    """Return ``value`` if it is a dict, else an empty dict (JS-tolerant)."""
    return value if isinstance(value, dict) else {}


def _as_list(value) -> list:
    """Return ``value`` if it is a list, else an empty list (JS-tolerant)."""
    return value if isinstance(value, list) else []


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


def _count_school_weeks(first_day: date, last_day: date, holiday_set: set) -> int:
    """Count school weeks in [first_day, last_day] using the same Monday-anchored
    ISO grouping the runtime uses (student view: weekdays that aren't holidays)."""
    count = 0
    monday = None
    d = first_day
    while d <= last_day:
        dow = d.isoweekday()
        if dow == 6 or dow == 7 or d.isoformat() in holiday_set:
            d = d + timedelta(days=1)
            continue
        m = d - timedelta(days=dow - 1)
        if monday is None or monday != m:
            count += 1
            monday = m
        d = d + timedelta(days=1)
    return count


def _validate_annotations(annotations, label, first_day, last_day, holiday_set) -> dict:
    """Validate the optional ``annotations`` field. Checks the anchor of each
    entry (key validity / in-range), never the free-form payload content."""
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(annotations, dict):
        errors.append(f"{label}: annotations must be an object")
        return {"errors": errors, "warnings": warnings}

    for bucket in annotations.keys():
        if bucket not in ("ranges", "weeks", "dates"):
            warnings.append(f'{label}: annotations has unknown bucket "{bucket}"')

    def in_year(d: date) -> bool:
        if not first_day or not last_day:
            return True
        return first_day <= d <= last_day

    def check_payload(value, where: str) -> bool:
        if not isinstance(value, dict):
            errors.append(f"{where} must be an object")
            return False
        if "label" in value and not isinstance(value["label"], str):
            warnings.append(f"{where} label should be a string")
        if "kind" in value and not isinstance(value["kind"], str):
            warnings.append(f"{where} kind should be a string")
        return True

    ranges = annotations.get("ranges")
    if ranges is not None:
        if not isinstance(ranges, dict):
            errors.append(f"{label}: annotations.ranges must be an object")
        else:
            for id_, value in ranges.items():
                where = f"{label}: annotations.ranges.{id_}"
                if not check_payload(value, where):
                    continue
                start = _try_parse_date(value.get("start"))
                end = _try_parse_date(value.get("end"))
                if not start:
                    errors.append(f'{where} has invalid start "{value.get("start")}"')
                elif not in_year(start):
                    errors.append(
                        f'{where} start "{value.get("start")}" is outside the calendar year range'
                    )
                if not end:
                    errors.append(f'{where} has invalid end "{value.get("end")}"')
                elif not in_year(end):
                    errors.append(
                        f'{where} end "{value.get("end")}" is outside the calendar year range'
                    )
                if start and end and start > end:
                    errors.append(
                        f'{where} start "{value.get("start")}" is after end "{value.get("end")}"'
                    )

    weeks = annotations.get("weeks")
    if weeks is not None:
        if not isinstance(weeks, dict):
            errors.append(f"{label}: annotations.weeks must be an object")
        else:
            week_count = (
                _count_school_weeks(first_day, last_day, holiday_set)
                if (first_day and last_day)
                else None
            )
            for key, value in weeks.items():
                where = f"{label}: annotations.weeks.{key}"
                if not re.fullmatch(r"\d+", key) or int(key) < 1:
                    errors.append(f"{where} key is not an integer >= 1")
                    continue
                if not check_payload(value, where):
                    continue
                if week_count is not None and int(key) > week_count:
                    warnings.append(f"{where} key exceeds the year's {week_count} school weeks")

    dates = annotations.get("dates")
    if dates is not None:
        if not isinstance(dates, dict):
            errors.append(f"{label}: annotations.dates must be an object")
        else:
            for key, value in dates.items():
                where = f"{label}: annotations.dates.{key}"
                d = _try_parse_date(key)
                if not d:
                    errors.append(f"{where} key is not a valid date")
                    continue
                if not in_year(d):
                    errors.append(f"{where} key is outside the calendar year range")
                    continue
                check_payload(value, where)

    return {"errors": errors, "warnings": warnings}


def _validate_year(year: dict, index: int) -> dict:
    """Validate a single year data object."""
    errors: list[str] = []
    warnings: list[str] = []
    year_name = year.get("year") if isinstance(year, dict) else None
    label = f"Year {index} ({year_name or 'unknown'})"

    # A non-object array element: every required field reads as missing, then we
    # bail out — matching the JS reference, where property access on a primitive
    # yields undefined.
    if not isinstance(year, dict):
        for field in REQUIRED_FIELDS:
            errors.append(f'{label}: missing required field "{field}"')
        return {"errors": errors, "warnings": warnings}

    # 1. Required fields.
    for field in REQUIRED_FIELDS:
        if _is_falsy(year.get(field)):
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
    for day, name in _as_dict(year.get("weekdaySchedules")).items():
        if day not in VALID_WEEKDAYS:
            errors.append(f'{label}: weekdaySchedules key "{day}" is not a valid weekday name')
        if not isinstance(name, str) or name not in (year.get("schedules") or {}):
            errors.append(
                f'{label}: weekdaySchedules.{day} references unknown schedule "{name}"'
            )

    for key, value in _as_dict(year.get("dates")).items():
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

    for d in _as_list(year.get("holidays")):
        if not in_range(d):
            errors.append(f'{label}: holiday "{d}" is outside the calendar year range')

    for d in _as_list(year.get("teacherWorkDays")):
        if not in_range(d):
            errors.append(f'{label}: teacherWorkDay "{d}" is outside the calendar year range')

    for key in _as_dict(year.get("breakNames")).keys():
        if not in_range(key):
            errors.append(f'{label}: breakNames key "{key}" is outside the calendar year range')

    holiday_set = set(_as_list(year.get("holidays")))
    for key, value in _as_dict(year.get("nonClassDays")).items():
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

    # 4b. Annotations (optional, additive).
    if "annotations" in year:
        ann = _validate_annotations(
            year.get("annotations"), label, first_day, last_day, holiday_set
        )
        errors.extend(ann["errors"])
        warnings.extend(ann["warnings"])

    # 5. Validate period times in all schedules.
    all_schedules = []
    for key, periods in _as_dict(year.get("schedules")).items():
        if isinstance(periods, list):
            all_schedules.append((periods, f"{label} schedules.{key}"))
    for key, value in _as_dict(year.get("dates")).items():
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

    # All entries in an array must share the same id. Preserve insertion order
    # (dict.fromkeys) so the message is deterministic, matching the JS Set and
    # Java LinkedHashSet.
    ids = list(
        dict.fromkeys(
            y.get("id") for y in arr if isinstance(y, dict) and y.get("id") is not None
        )
    )
    if len(ids) > 1:
        joined = ", ".join(f'"{s}"' for s in ids)
        errors.append(f"Calendar array mixes multiple ids: {joined}")

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}

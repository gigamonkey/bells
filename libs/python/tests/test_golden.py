"""Cross-implementation golden tests.

Runs the shared cases from libs/golden/ against this port and compares the
canonically-serialized results with the committed expected files (generated
by the TypeScript reference implementation). See libs/golden/README.md.
"""

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from bells import BellSchedule

GOLDEN_DIR = Path(__file__).resolve().parent.parent.parent / "golden"


def _instant(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _date(s: str) -> date:
    return date.fromisoformat(s)


# ── Canonical serialization (see libs/golden/README.md) ─────────────────────


def _ser_instant(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ser_opt_instant(dt):
    return None if dt is None else _ser_instant(dt)


def _ser_duration(td: timedelta) -> int:
    return round(td.total_seconds())


def _ser_interval(interval):
    if interval is None:
        return None
    return {
        "name": interval.name,
        "type": interval.type,
        "start": _ser_instant(interval.start),
        "end": _ser_instant(interval.end),
        "duringSchool": interval.during_school,
        "tags": interval.tags,
    }


def _ser_bounds(bounds):
    if bounds is None:
        return None
    return {"start": _ser_opt_instant(bounds["start"]), "end": _ser_opt_instant(bounds["end"])}


def _ser_periods(periods):
    return [
        {
            "name": p["name"],
            "start": _ser_instant(p["start"]),
            "end": _ser_instant(p["end"]),
            "tags": p["tags"],
        }
        for p in periods
    ]


def _ser_non_class_days(days):
    return [{"date": d["date"].isoformat(), "label": d["label"]} for d in days]


# ── Query dispatch (camelCase protocol name → this port's API) ──────────────

DISPATCH = {
    "timezone": lambda b, a: b.timezone,
    "currentInterval": lambda b, a: _ser_interval(b.current_interval(_instant(a["instant"]))),
    "periodAt": lambda b, a: _ser_interval(b.period_at(_instant(a["instant"]))),
    "isSchoolDay": lambda b, a: b.is_school_day(_date(a["date"])),
    "currentDayBounds": lambda b, a: _ser_bounds(b.current_day_bounds(_instant(a["instant"]))),
    "nextSchoolDayStart": lambda b, a: _ser_instant(b.next_school_day_start(_instant(a["instant"]))),
    "previousSchoolDayEnd": lambda b, a: _ser_instant(b.previous_school_day_end(_instant(a["instant"]))),
    "schoolTimeLeft": lambda b, a: _ser_duration(b.school_time_left(_instant(a["instant"]))),
    "schoolTimeDone": lambda b, a: _ser_duration(b.school_time_done(_instant(a["instant"]))),
    "totalSchoolTime": lambda b, a: _ser_duration(b.total_school_time(_instant(a["instant"]))),
    "schoolTimeBetween": lambda b, a: _ser_duration(
        b.school_time_between(_instant(a["start"]), _instant(a["end"]))
    ),
    "schoolDaysBetween": lambda b, a: b.school_days_between(_date(a["start"]), _date(a["end"])),
    "schoolDaysLeft": lambda b, a: b.school_days_left(_instant(a["instant"])),
    "calendarDaysLeft": lambda b, a: b.calendar_days_left(_instant(a["instant"])),
    "nextYearStart": lambda b, a: _ser_instant(b.next_year_start(_instant(a["instant"]))),
    "currentYearStart": lambda b, a: _ser_opt_instant(b.current_year_start(_instant(a["instant"]))),
    "currentYearEnd": lambda b, a: _ser_opt_instant(b.current_year_end(_instant(a["instant"]))),
    "summerBounds": lambda b, a: _ser_bounds(b.summer_bounds(_instant(a["instant"]))),
    "nextSchoolDay": lambda b, a: b.next_school_day(_date(a["date"])).isoformat(),
    "previousSchoolDay": lambda b, a: b.previous_school_day(_date(a["date"])).isoformat(),
    "scheduleNameFor": lambda b, a: b.schedule_name_for(_date(a["date"])),
    "scheduleFor": lambda b, a: _ser_periods(b.schedule_for(_date(a["date"]))),
    "periodsForDate": lambda b, a: _ser_periods(b.periods_for_date(_instant(a["instant"]))),
    "nonClassDaysLeft": lambda b, a: _ser_non_class_days(b.non_class_days_left(_instant(a["instant"]))),
    "nonClassLabel": lambda b, a: b.non_class_label(_date(a["date"])),
}


# ── Case loading ─────────────────────────────────────────────────────────────


def _load_calendar_data(files):
    data = []
    for f in files:
        with open(GOLDEN_DIR / "calendars" / f) as fh:
            parsed = json.load(fh)
        data.extend(parsed if isinstance(parsed, list) else [parsed])
    return data


def _to_options(options):
    converted = {}
    if "role" in options:
        converted["role"] = options["role"]
    include_tags = options.get("includeTags")
    if include_tags is not None:
        if isinstance(include_tags, dict):
            include_tags = {int(k): v for k, v in include_tags.items()}
        converted["include_tags"] = include_tags
    return converted


def _collect():
    params = []
    schedules = {}
    for case_file in sorted((GOLDEN_DIR / "cases").glob("*.json")):
        name = case_file.stem
        with open(case_file) as fh:
            case = json.load(fh)
        with open(GOLDEN_DIR / "expected" / f"{name}.json") as fh:
            expected = json.load(fh)
        schedules[name] = BellSchedule(
            _load_calendar_data(case["calendars"]), _to_options(case["options"])
        )
        for query in case["queries"]:
            params.append(
                pytest.param(name, query, expected[query["id"]], id=f"{name}:{query['id']}")
            )
    return schedules, params


SCHEDULES, PARAMS = _collect()


@pytest.mark.parametrize("case_name,query,expected", PARAMS)
def test_golden(case_name, query, expected):
    method = query["method"]
    assert method in DISPATCH, f"Golden query method not in protocol: {method}"
    assert DISPATCH[method](SCHEDULES[case_name], query["args"]) == expected

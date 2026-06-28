"""Cross-implementation golden tests.

Runs the shared cases from libs/golden/ against this port and compares the
canonically-serialized results with the committed expected files (generated
by the TypeScript reference implementation). See libs/golden/README.md.
"""

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from bells import BellSchedule, format_time, parse_time

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


def _ser_period(p):
    if p is None:
        return None
    return {
        "name": p["name"],
        "start": _ser_instant(p["start"]),
        "end": _ser_instant(p["end"]),
        "tags": p["tags"],
    }


def _ser_zoned(dt):
    return None if dt is None else _ser_instant(dt)


def _ser_school_week(w):
    if w is None:
        return None
    return {
        "number": w["number"],
        "monday": w["monday"].isoformat(),
        "firstSchoolDay": w["first_school_day"].isoformat(),
        "lastSchoolDay": w["last_school_day"].isoformat(),
        "schoolDayCount": w["school_day_count"],
    }


def _ser_school_weeks(ws):
    return [_ser_school_week(w) for w in ws]


def _ser_annotation(a):
    out = {}
    for k, v in a.items():
        if k == "school_week":
            out["schoolWeek"] = _ser_school_week(v)
        elif isinstance(v, date):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _ser_annotations(arr):
    return [_ser_annotation(a) for a in arr]


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
    # School weeks & annotations.
    "schoolWeeks": lambda b, a: _ser_school_weeks(b.school_weeks()),
    "schoolWeek": lambda b, a: _ser_school_week(b.school_week(a["n"])),
    "weekForDate": lambda b, a: _ser_school_week(b.week_for_date(_date(a["date"]))),
    "rangeAnnotations": lambda b, a: _ser_annotations(b.range_annotations()),
    "weekAnnotations": lambda b, a: _ser_annotations(b.week_annotations()),
    "dateAnnotations": lambda b, a: _ser_annotations(b.date_annotations()),
    "annotationsOn": lambda b, a: _ser_annotations(b.annotations_on(_date(a["date"]))),
    "annotationsForWeek": lambda b, a: _ser_annotations(b.annotations_for_week(a["n"])),
    # Abstract-time API.
    "resolveDay": lambda b, a: b.resolve_day(_date(a["base"]), a.get("day")).isoformat(),
    "addSchoolDays": lambda b, a: b.add_school_days(_date(a["date"]), a["n"]).isoformat(),
    "resolveTime": lambda b, a: _ser_zoned(b.resolve_time(a["bound"], a.get("period"))),
    "periodOnDate": lambda b, a: _ser_period(b.period_on_date(_date(a["date"]), a["n"])),
    "currentOrNextPeriodNumber": lambda b, a: b.current_or_next_period_number(_instant(a["instant"])),
    "timeWarnings": lambda b, a: len(b.time_warnings(a["bound"])),
    "canonicalizeTime": lambda b, a: format_time(parse_time(a["spec"])),
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

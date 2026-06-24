"""Tests for the bundled bhs-calendars data package."""

from bhs_calendars import by_id, load_all


def test_load_all_returns_year_dicts():
    years = load_all()
    assert len(years) > 0
    for year in years:
        assert "id" in year
        assert "firstDay" in year
        assert "schedules" in year


def test_by_id_groups_and_sorts():
    groups = by_id()
    assert "bhs" in groups
    # Every group is sorted chronologically by firstDay.
    for years in groups.values():
        first_days = [y["firstDay"] for y in years]
        assert first_days == sorted(first_days)


def test_by_id_covers_all_years():
    assert sum(len(v) for v in by_id().values()) == len(load_all())


def test_schedule_builds_from_bundled_data():
    # The data plugs straight into BellSchedule when the library is installed.
    try:
        from bells import BellSchedule
    except ImportError:
        return  # bells not installed in this environment; data shape is covered above.

    years = by_id()["bhs"]
    schedule = BellSchedule(years, {})
    assert schedule is not None

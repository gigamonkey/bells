"""bhs-calendars — bundled BHS-area school bell-schedule calendar data.

Python counterpart of the npm ``@peterseibel/bhs-calendars`` package. Ships the
per-year calendar JSON for Berkeley High and nearby middle schools as package
data and exposes it as plain dictionaries, ready to hand to
``bells.BellSchedule``.

Group the flat list by the ``id`` field to assemble the year sequence for a
single school; a ``BellSchedule`` consumes one such group.
"""

from __future__ import annotations

import json
from collections import defaultdict
from importlib.resources import files

__all__ = ["load_all", "by_id"]

__version__ = "2.8.1"


def load_all() -> list[dict]:
    """Return every bundled yearly calendar object as a flat list.

    Parallels the npm package's default export. Each entry is one school-year;
    group by the ``id`` field (or use :func:`by_id`) to get a single school's
    years.
    """
    out: list[dict] = []
    data_dir = files(__package__).joinpath("data")
    for entry in sorted(data_dir.iterdir(), key=lambda p: p.name):
        if entry.name.endswith(".json"):
            data = json.loads(entry.read_text(encoding="utf-8"))
            out.extend(data if isinstance(data, list) else [data])
    return out


def by_id() -> dict[str, list[dict]]:
    """Group :func:`load_all` by ``id``, each group's years sorted by ``firstDay``.

    Returns a mapping of school id (e.g. ``"bhs"``, ``"king-6"``) to that
    school's years in chronological order.
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for year in load_all():
        groups[year["id"]].append(year)
    for years in groups.values():
        years.sort(key=lambda y: y["firstDay"])
    return dict(groups)

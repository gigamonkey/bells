# Divergences from the JavaScript library

This Python port aims to be behaviorally identical to the JavaScript
[`@peterseibel/bells`](../lib) library. This file records the places where it
intentionally differs. Each entry should eventually be reconciled — either by
backporting the change to the JS library or by reverting it here.

## 1. `is_school_day()` derives "today" in the calendar's timezone

**Status:** Python diverges; JS fix pending.

**Methods affected:** `BellSchedule.is_school_day` (only the no-argument
default; passing an explicit date behaves identically in both libraries).

### JavaScript behavior

`BellSchedule.isSchoolDay(date = Temporal.Now.plainDateISO())` defaults the date
to `Temporal.Now.plainDateISO()`, which is the current date in the **system
local** timezone.

### Python behavior

`BellSchedule.is_school_day(d=None)`, when called with no argument, derives the
current date from the current instant using the **calendar's** timezone
(`cal.timezone`, falling back to `self.timezone` when no calendar covers the
current instant):

```python
instant = now_instant()
cal = self._calendar_at(instant)
tz = cal.timezone if cal else self.timezone
d = instant_to_date(instant, tz)
```

### Why

Every other query in the library already works from an instant and converts to a
date in the calendar's own timezone (`instant_to_date(instant, cal.timezone)`).
`isSchoolDay` is the lone exception that reads a system-local date, making it
inconsistent with the rest of the API.

The discrepancy is invisible in a browser running in the school's own timezone
(system-local and calendar-local dates coincide), which is why the JS library
never needed to address it. It only matters when the process runs in a different
timezone than the school — e.g. the `server/` Express API on a UTC host — and
only during the window between UTC midnight and the school's local midnight,
where the two timezones disagree about the calendar date.

### Reconciliation

Backport the same change to the JS `BellSchedule.isSchoolDay`: instead of
defaulting the parameter to `Temporal.Now.plainDateISO()`, default to no
argument and, when absent, compute the date from `Temporal.Now.instant()` using
the active calendar's timezone. Once that lands, this entry can be removed.

# Multiple-calendar support

Today the app is hard-wired to Berkeley High. Users from other Berkeley
schools (King, Longfellow, Willard — and the per-grade tracks within each)
should be able to pick which calendar drives the display, and have that
choice persist. The `bhs-calendars` package already contains the JSON for
the middle schools; we just don't expose a way to choose them.

## Data model changes

Each yearly calendar JSON gets two new top-level fields:

- `id` — short, stable slug used as the persisted key
  (`bhs`, `king-6`, `king-7`, `king-8`, `longfellow-6`, `longfellow-78`,
  `willard-6`, `willard-78`).
- `name` — human-readable label shown in the picker
  ("Berkeley High School", "MLK Middle — 6th grade", …).

Conceptually a *calendar* is the set of yearly files that share the same
`id` (BHS will eventually have many years; the middle-school calendars
have one year each so far). The yearly-file structure (`schedules`,
`dates`, `holidays`, …) is unchanged.

Update `validateCalendarData` in `lib/src/validate.js` to require both
fields and to reject mismatched `id`s when an array is passed.

The BHS yearly files (`2022-2023.json` … `2026-2027.json`) all get
`"id": "bhs"` and `"name": "Berkeley High School"`. Middle-school files
get their own ids/names.

## Calendar registry (`calendar.js`)

Replace the hard-coded list of four BHS imports with a registry built
from all yearly JSONs in the package:

```js
import bhs2025 from '@peterseibel/bhs-calendars/2025-2026' with { type: 'json' };
// … one import per yearly file, BHS + middle schools

const yearlyFiles = [bhs2025, /* … */, king6, king7, longfellow6, /* … */];

// Group by id → { id, name, years: [yearly, …] }
const registry = new Map();
for (const y of yearlyFiles) {
  const entry = registry.get(y.id) ?? { id: y.id, name: y.name, years: [] };
  entry.years.push(y);
  registry.set(y.id, entry);
}
```

(If imports get tedious, the `bhs-calendars` package can grow a small
`index.js` that re-exports an array of all yearly files. Cleaner than
maintaining the list in two places.)

`BellSchedule` is constructed from the *selected* entry's `years`, not
the full set. The currently selected id is read from localStorage; the
default is `bhs`.

```js
const selectedId = localStorage.getItem('selectedCalendar') ?? 'bhs';
const entry = registry.get(selectedId) ?? registry.get('bhs');
_bellSchedule = new BellSchedule(entry.years, { role, includeTags });
```

Expose `getCalendars()` (returns `[...registry.values()]`), `getSelectedCalendarId()`,
and `setSelectedCalendar(id)` — the last one writes localStorage and
rebuilds the schedule the same way `saveConfiguration` does today.

## Gear-popup UI (`index.html` + `bells.js`)

Add a labelled `<select id="calendar-select">` at the top of
`#popup-config`, populated at startup from `getCalendars()`. Its
`onchange` calls `setSelectedCalendar(e.target.value)` and then refreshes
the rest of the UI (see next section).

## Optional-periods table is BHS-specific

The 5×3 grid of "0th / 7th / Ext" checkboxes only makes sense for BHS —
middle schools don't have those optional tags. After switching calendars
we should hide rows/columns that aren't relevant.

Approach: introspect the selected calendar's schedules for the tag set
in use (`zero`, `seventh`, `ext`, etc.). If none are present, hide the
whole table. Otherwise hide just the columns whose tags don't appear.
This keeps `extraPeriods` storage unchanged (still keyed by day/tag);
unused entries are simply ignored.

We should also re-render the table when the calendar selection changes,
so switching from BHS → King hides the BHS-only checkboxes immediately.

## Edge cases / considerations

- **Persisted optional-period state across schools.** Storing one
  `extraPeriods` blob means a BHS user who briefly switches to King and
  back keeps their BHS settings. Good. No migration needed.
- **Unknown id in localStorage** (e.g. user had `king-6` selected and we
  later remove that calendar) — fall back to `bhs` and overwrite.
- **Year completion progress bar.** Already keyed off `firstDay`/`lastDay`
  from the active `BellSchedule`, so it follows the selection automatically.
- **`server/index.js`** takes a `CALENDARS_PATH` env var pointing to the
  yearly files. The REST API should accept a `calendar` query param
  (defaulting to `bhs`) and filter by `id`. Out of scope for the first
  pass if we want to keep the change small, but worth a follow-up.
- **Teacher mode.** Stays as-is; orthogonal to calendar selection.

## Suggested commit order

1. Add `id` and `name` to every yearly JSON in `bhs-calendars` and bump
   the package version. Update `validateCalendarData`.
2. Build the registry in `calendar.js`, default to `bhs`, no UI yet —
   verifies nothing regresses.
3. Add the picker `<select>` to the gear popup and wire up
   `setSelectedCalendar`.
4. Hide irrelevant optional-period rows/columns based on the active
   schedule's tags.
5. (Follow-up) Server `?calendar=` support.

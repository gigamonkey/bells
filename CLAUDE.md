# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A web-based bell schedule tracker for Berkeley High School (BHS). Displays current period, countdowns, and year-completion progress in real-time. Live at https://gigamonkeys.com/misc/bhs/

## Commands

```bash
make build    # Bundle bells.js → out.js via esbuild (with sourcemap)
make watch    # esbuild in watch mode for development
make pretty   # Format JS with prettier, HTML with tidy
make lint     # ESLint validation
make all      # pretty + lint (default)
make publish  # Deploy to ~/web/www.gigamonkeys.com/misc/bhs/
```

No test suite exists for the web app. Use `setOffset()` in `bells.js` to manipulate time for manual testing of future dates.

## Architecture

ES modules bundled by esbuild. The entry point is `bells.js`; `out.js` is the compiled output (gitignored).

**Module responsibilities:**
- `bells.js` — UI orchestration, update loop (runs every second), config panel, local storage
- `calendar.js` — Thin wrapper that loads the `@peterseibel/bells` library and wires up user config (optional periods, teacher mode) to return a `BellSchedule` via `getBellSchedule()`
- `datetime.js` — Lightweight display utilities only (formatting, countdown strings); date/time logic lives in the library
- `dom.js` — Thin DOM helpers (`$`, `$$`, element creation)
- `calendars/` — Per-year JSON files (`2022-2023.json` … `2025-2026.json`) in `@peterseibel/bells` format; imported individually by `calendar.js`

**`@peterseibel/bells` library (`lib/`):** Published to npm. Handles all schedule logic: time parsing, schedule selection, overlap validation. Key exports:
- `BellSchedule` — main class; `periodsForDate(instant)` returns periods for a given moment
- `Calendars` — loads calendar data from filesystem paths or URLs
- `validateCalendarData` — validates calendar JSON; `bells-validate` CLI wraps it
- Library uses `Temporal` as a global (set by consumer via `globalThis.Temporal = Temporal`)
- Tests: `cd lib && npm test`

**Update loop:** Every second, `update()` recalculates the current interval, updates countdowns, progress bars, background color (red = last 10 min of period, blue = class, purple = passing, pink = summer), and year-completion percentage.

**Schedule selection:** Calendar data is purely data-driven. The correct schedule for a given date is determined by the library matching against per-year JSON entries — normal days, late-start variants, holidays, and special days are all defined there.

**User config:** Optional periods (0th, 7th, Ext) per weekday are stored in `localStorage`. A teacher/student toggle switches between teacher and student schedule views.

## Key Design Notes

- Timezone: always converts to `America/Los_Angeles` regardless of browser locale
- The `school-days.js` file in the repo root is a standalone untracked script (not part of the app bundle)
- `calendars.json` in the repo root is superseded by `calendars/` and no longer used

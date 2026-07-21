# Plan: Expose a debug time-offset in the `@peterseibel/bells` library

## Goal

Let consumers of the library debug their apps at a simulated "current time"
by calling a method to set a global offset (or an explicit fake "now") that
affects **every** time-defaulting method in the library — `currentInterval()`,
`periodAt()`, `schoolDaysLeft()`, `Calendars.current()`, `Interval.left()`,
etc. — without having to thread an `instant` argument through each call.

## Background: how it works today

- The library has **no** debug offset. Every time-aware method defaults its
  argument to the real clock:
  - `bell-schedule.ts` / `calendar.ts`: ~19 methods with
    `instant: Temporal.Instant = Temporal.Now.instant()`.
  - `calendars.ts:63`: `Temporal.Now.plainDateISO(timeZone)` for academic-year
    selection.
  - `validate.ts:24`: `Temporal.Now.instant()` — used only to probe whether a
    timezone string is valid; **not** time logic, leave it alone.
- The **app** (`bells.js`) owns the current offset: a module-level `offset`
  (ms), with `now() = realNow + offset` and `setOffset`/`clearOffset`. This is
  what we're promoting into the library.
- Semantics to preserve: `setOffset` sets a fake *starting* moment and time
  keeps ticking forward from there (offset is a fixed delta added to the live
  clock, not a frozen instant).

## Design

### Centralize "now" behind an internal clock (new `src/clock.ts`)

Introduce one internal accessor that all library code uses instead of
`Temporal.Now.*`:

```ts
// src/clock.ts
let debugOffset: Temporal.Duration | null = null;

/** Internal: the library's notion of "now", offset-adjusted. */
export const now = (): Temporal.Instant =>
  debugOffset ? Temporal.Now.instant().add(debugOffset) : Temporal.Now.instant();

/** Internal: offset-adjusted local date in a timezone. */
export const today = (timeZone?: string): Temporal.PlainDate =>
  now().toZonedDateTimeISO(timeZone ?? Temporal.Now.timeZoneId()).toPlainDate();
```

Public API (re-exported from `index.ts`):

```ts
setDebugTime(instant: Temporal.Instant): void   // offset = instant - realNow
setDebugOffset(offset: Temporal.Duration): void // set delta directly
clearDebugTime(): void                          // back to the real clock
getDebugOffset(): Temporal.Duration | null      // introspection / UI display
```

`setDebugTime` computes `offset = instant.since(Temporal.Now.instant())` so the
clock keeps ticking from the simulated moment (matches today's `bells.js`).

### Wire the call sites

- Replace every `= Temporal.Now.instant()` default in `bell-schedule.ts` and
  `calendar.ts` with `= now()` (import from `clock.ts`).
- `calendars.ts:63`: replace `Temporal.Now.plainDateISO(timeZone)` with
  `today(timeZone)`.
- Any internal `.plainDateISO()` derived from "now" → `today(tz)`.
- Leave `validate.ts` untouched.

### Why global mutable state (and not a `Clock` injected into `BellSchedule`)

The request is explicitly "an offset that affects **all the rest of the
library**" — inherently process-global, and it mirrors the existing `bells.js`
approach, so it's the smallest, most predictable change. A per-instance
injected clock would be cleaner in the abstract but forces the offset through
every constructor and `Calendars` factory and doesn't match the ask. Note the
one caveat in the docs: it's a debugging affordance and global — not for
concurrent multi-tenant server use.

## App migration (`bells.js`)

Once the library owns the offset, `bells.js` should delegate to it rather than
keep a parallel copy:

- Drop the local `offset` variable; have `setOffset`/`clearOffset` call the
  library's `setDebugTime`/`clearDebugTime` (keep the console-friendly
  `setOffset(year, month, date, …)` wrapper signature).
- `now()` keeps only its **timezone kludge** (that's unrelated to the debug
  offset) but drops `+ offset`, since the library now applies it.
- The `reloadAt` recompute stays.

This is a nice-to-have cleanup; the library change stands on its own if we defer
it.

## Docs & other ports

- Add a short "Debugging with a simulated time" section to `libs/ts/README.md`
  under `## API`.
- **Golden tests**: do *not* add offset to golden fixtures — golden tests are
  deterministic and pass explicit instants, and stateful global time would make
  them order-dependent. The offset is orthogonal to the tested behavior.
- **Python / Java parity**: the golden suite doesn't require this API, so port
  parity is an optional follow-up. If we do it, mirror the names
  (`set_debug_time` / `setDebugTime`) and keep it out of the golden harness.

## Testing (TS)

Add `libs/ts` unit tests (not golden):

- `setDebugTime(t)` makes `currentInterval()` / `periodAt()` resolve as if now
  were `t`; `clearDebugTime()` restores real behavior.
- `getDebugOffset()` round-trips; `setDebugOffset` and `setDebugTime` agree.
- An explicitly-passed `instant` argument still overrides the offset (the
  offset only fills the *default*).
- `afterEach(clearDebugTime)` so global state can't leak between tests.

## Steps

1. Add `src/clock.ts` (`now`, `today`, `setDebugTime`, `setDebugOffset`,
   `clearDebugTime`, `getDebugOffset`).
2. Swap `Temporal.Now.*` defaults in `bell-schedule.ts`, `calendar.ts`,
   `calendars.ts` for `now()` / `today()`.
3. Export the four public functions from `index.ts`.
4. Unit tests + `afterEach` cleanup.
5. README section.
6. (Optional, separate commit) migrate `bells.js` to delegate to the library.
7. (Optional, follow-up) Python/Java parity.

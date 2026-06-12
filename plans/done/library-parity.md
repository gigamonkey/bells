# Reconciling the three library ports (TS / Python / Java)

`libs/ts` is the reference implementation; `libs/python` and `libs/java` are
ports. The goal is for all three to provide **the same functionality and
semantics** behind **as similar an API as possible**, while each stays
idiomatic for its language. This plan catalogs every divergence found in a
full read of the three implementations and their test suites, and proposes how
to reconcile each one.

The good news up front: the load-bearing logic is already a faithful port in
all three. Schedule selection, interval/boundary computation, the
optional/teacher/tag filtering, non-school-day trimming, break detection, the
day/time counters, the full `BellSchedule` method set, and the complete
validation rule set are behaviorally identical. The divergences are confined to
(a) a small number of real behavioral edges, (b) API-shape/idiom differences,
and (c) test coverage that has drifted out of lockstep.

Severity tags used below: **[BEHAVIOR]** different results on some input,
**[ROBUSTNESS]** one port crashes where others degrade, **[MISSING]** a
function exists in some ports but not others, **[API]** idiomatic surface
difference, **[TESTS]** coverage gap.

---

## Part 1 — Behavioral divergences to reconcile

### 1.1 `isSchoolDay()` default-"today" timezone  **[BEHAVIOR]** — already tracked

This is the one already written up in `libs/python/DIVERGENCES.md` §1. Confirmed
accurate, with one addition the doc misses: **Java diverges the same way and is
undocumented there.**

- TS `bell-schedule.ts:71` — `isSchoolDay(date = Temporal.Now.plainDateISO())`
  defaults to **system-local** today.
- Python `bell_schedule.py:79` — no-arg path derives today from the current
  instant in the **calendar's** timezone (the calendar covering the instant,
  else `self.timezone`).
- Java `BellSchedule.java:155` — `isSchoolDay()` calls
  `isSchoolDay(LocalDate.now(zone()))` where `zone()` is `calendars[0].timezone()`
  — the **schedule's** timezone, not system-local.

So both ports already implement the *target* behavior; only TS still reads a
system-local date. Reconciliation (as DIVERGENCES.md prescribes):

1. Change TS `isSchoolDay` to take no default, and when the date is absent,
   compute it from `Temporal.Now.instant()` projected into the active calendar's
   timezone — mirroring how every other defaulting method in the class already
   materializes "now" (`bell-schedule.ts:79`, `:272`, etc.).
2. Unify the *port-vs-port* resolution detail: Python uses the timezone of the
   **calendar covering the current instant** (fallback `self.timezone`); Java
   unconditionally uses `calendars[0]`. They coincide today (the library assumes
   one shared timezone) but the logic differs. Make Java match Python's
   "calendar-at-instant, fallback primary" resolution so the rule is identical.
3. Delete `DIVERGENCES.md` §1 once TS lands, and drop the now-stale Java javadoc
   note that frames the calendar-tz behavior as a Java-specific choice.

**Note:** the user has said they'll handle this one; it's included here so the
reconciliation is complete and so step 2 (the undocumented Java/Python
mismatch) isn't lost.

### 1.2 `Calendars.current()` — how "today" is determined for year selection  **[BEHAVIOR/API]**

`Calendars.current()` picks *which academic-year file to load* based on today's
date. The three disagree on how "today" is obtained:

- TS `calendars.ts:58` — `Temporal.Now.plainDateISO()` (system-local), no
  parameter.
- Python `calendars.py:48,54` — `date.today()` (system-local), no parameter.
- Java `Calendars.java:93` — `current(ZoneId zone, Options options)` **requires**
  a zone: `LocalDate.now(zone)`.

This is a genuine API split, not just idiom: a caller near the Aug-1 academic-
year rollover gets a different file depending on the model. Unlike §1.1 there is
no calendar loaded yet, so there is no "calendar timezone" to defer to —
system-local is the only zero-config option.

**Recommendation:** unify on *optional zone, default system-local*.
- Java: add a `current(Options)` overload that defaults the zone to the system
  default; keep the explicit `current(ZoneId, Options)` for callers that need
  control (e.g. the server on a UTC host).
- TS/Python: accept an optional zone argument, defaulting to system-local, so a
  UTC-hosted consumer can pass the school zone explicitly and match the browser.

This gives one conceptual API across all three (optional zone, system-local
default) while keeping each call site idiomatic.

### 1.3 Empty string treated as "absent" — only in TS  **[BEHAVIOR]** (degenerate data)

TS uses JS truthiness (`||`) for several lookups, so an **empty-string** value
coerces to the fallback. Python's `.get(default)` and Java's `getOrDefault`
return the stored `""` instead:

| Lookup | TS (`""` → fallback) | Python / Java (`""` kept) |
|---|---|---|
| `nonClassLabel` | `calendar.ts:257` → `null` | `calendar.py:435` / `Calendar.java:285` → `""` |
| break name | `calendar.ts:367` → `'Vacation'` | `calendar.py:151` / `Schedule.java:243` → `""` |
| weekday schedule | `calendar.ts:168` → `'NORMAL'` | `calendar.py:374` / `Calendar.java:140` → `""` (then "unknown schedule" error) |
| `firstDayTeachers` | `calendars.ts:63` → falls back to `firstDay` | `calendars.py:58` falls back (Python matches TS here) / `Calendars.java:99` keeps `""` |

These only bite on malformed data (the validator already forbids empty
`nonClassDays` labels), but the semantics genuinely differ.

**Recommendation:** make the intent explicit and uniform — **treat empty string
as absent** in all three (this is what TS does today, incidentally, via
truthiness). Concretely: in Python/Java replace the bare `.get`/`getOrDefault`
at the four sites above with an "empty-or-missing → default" helper. This makes
TS's behavior intentional rather than a truthiness accident and removes the
divergence. Low priority, low risk.

### 1.4 Python validator crashes on malformed input; TS/Java degrade  **[ROBUSTNESS]**

`validate_calendar_data` is supposed to *return* errors, never throw. Python
throws `AttributeError` on several malformed shapes that TS/Java handle:

- Non-dict array element / non-object `year` (e.g. a bare `42` or `"foo"` in the
  array): Python `validate.py:139` (`year.get(...)`) and the id comprehension
  `validate.py:283` crash. TS `validate.ts:164` and Java `Validator.java:98`
  emit "missing required field" errors and continue.
- Present-but-wrong-type containers — `weekdaySchedules`/`dates`/`breakNames`/
  `nonClassDays` given a list/string/number: Python calls `.items()`/`.keys()`
  on them (`validate.py:188,196,217,222,247`) and crashes. Java guards with
  `.isObject()` (`Validator.java:171,190,230,243`); TS's `Object.entries(...)`
  doesn't throw.

**Recommendation:** harden Python to match the reference's "report and
continue":
- Guard that each array element is a dict before `_validate_year`.
- Guard `isinstance(..., dict)` before `.items()`/`.keys()` on the four
  containers (mirror Java's `.isObject()` checks).

### 1.5 Python validator over-reports empty `{}`/`[]` required fields  **[BEHAVIOR]**

`schedules: {}` (empty but present):
- TS `validate.ts:164` (`if (!year[field])`) — `{}`/`[]` are truthy → **not**
  flagged as missing; proceeds to the more specific "missing schedules.NORMAL".
- Java `isFalsy` (`Validator.java:455`) explicitly treats objects/arrays as
  truthy → matches TS.
- Python `validate.py:139` (`if not year.get(field)`) — `not {}`/`not []` are
  `True` → emits a spurious "missing required field" and may early-return
  differently.

**Recommendation:** Python should test key presence / `is None`, not falsiness,
in the required-field loop.

### 1.6 Python validator: nondeterministic id-mismatch message  **[BEHAVIOR]**

The "Calendar array mixes multiple ids: …" message lists ids in insertion order
in TS (`Set`, `validate.ts:343`) and Java (`LinkedHashSet`, `Validator.java:71`),
but Python builds a plain `set` (`validate.py:283`), so the order is arbitrary
between runs.

**Recommendation:** Python use `dict.fromkeys(...)` (or a list with a seen-set)
to preserve insertion order.

### 1.7 `parse_plain_time` rejects `"H:M:S"`; TS/Java truncate  **[BEHAVIOR]** (latent)

TS (`datetime.ts:41`) and Java (`DateTimes.java:64`) split on `:` and use only
the first two components, silently ignoring a seconds field. Python
(`datetimeutil.py:56`) unpacks exactly two and raises `ValueError` on a third.
Schedule data only uses `"H:M"` today, so this is latent, but it's a real
parsing divergence.

**Recommendation:** Python slice the first two components to match TS/Java
tolerance. (Optionally, separately decide whether *any* of the three should
validate time strings more strictly — see "Decisions needed".)

### 1.8 Smaller validator edges  **[BEHAVIOR]** (degenerate data)

- **`teachers` truthiness:** TS/Python classify any truthy `teachers` value as a
  teacher period (`validate.ts:116`, `validate.py:98`); Java uses
  `asBoolean(false)` (`Validator.java:372`), so a string like `"yes"` is treated
  as a *student* period. Real data is always boolean `true`, so they agree in
  practice.
- **`Year N ()` label:** for an empty-string `year`, TS/Python fall back to
  `unknown` (`validate.ts:161`, `validate.py:135`); Java prints empty parens
  (`Validator.java:94/481`).

**Recommendation:** align Java to TS truthiness/`unknown` fallback where cheap;
low priority since both require malformed data.

### 1.9 `schoolTimeBetween` precision  **[BEHAVIOR]** (not observable) — note only

TS (`bell-schedule.ts:159`) and Java (`:365`) accumulate whole **milliseconds**;
Python (`bell_schedule.py:179`) accumulates `timedelta` at microsecond
precision. With minute-aligned school times the difference can never surface.
**Recommendation:** leave as-is, or truncate Python to ms for bit-exact parity;
document the choice rather than chase it.

---

## Part 2 — Missing functionality / surface parity

### 2.1 Python is missing `noon()`  **[MISSING]**

TS (`datetime.ts:115`) and Java (`DateTimes.java:148`) expose `noon`; Python has
no equivalent. It's currently unused by callers, but it's part of the public
datetime surface in two of three ports.
**Recommendation:** add `def noon(d)` to `datetimeutil.py` for parity.

### 2.2 Python's extra datetime helpers  **[API]**

Python adds `plain_to_instant`, `instant_to_date`, `now_instant`
(`datetimeutil.py:109,115,120`) that TS/Java inline via Temporal/`java.time`.
These are reasonable Python internals.
**Recommendation:** keep them, but treat them as module-internal (not part of
the public contract) so the *public* surface stays aligned across ports — the
public surface is `BellSchedule`, `Calendars`, `validate_calendar_data`, and the
parsing/formatting helpers that exist in all three.

### 2.3 Java `resolveScheduleTimes` drops unknown fields and can NPE on null tags  **[API/ROBUSTNESS]**

- TS/Python spread all input fields onto the resolved period
  (`datetime.ts:95`, `datetimeutil.py:104`); Java copies only the known `Period`
  record fields (`DateTimes.java:122`), dropping any extra field. This is a
  consequence of static typing and is fine **if** the period schema is closed.
- Java's `p.tags().contains("optional")` (`DateTimes.java:114`) throws if `tags`
  is null; TS/Python are null-safe.

**Recommendation:** confirm the period schema is closed (no arbitrary
pass-through fields are relied on — it isn't, per the calendar core), then
null-guard `tags()` in Java (or guarantee it's never null at construction).

---

## Part 3 — API idiom: keep, or unify?

These are differences that are *defensible as idiomatic* but worth a deliberate
decision so the three APIs feel like siblings.

**Keep as-is (idiomatic, no action):**
- Accessor style: TS `get timezone()`, Python `@property timezone`, Java
  `timezone()` method — all idiomatic.
- Sync vs async loading: TS `Calendars` is `async`/Promise-based; Python/Java
  are synchronous. Inherent to JS I/O.
- Return shapes: TS objects / Python dicts / Java records for
  `scheduleFor`/`periodsForDate`/bounds. Idiomatic; same content.
- Durations as `Temporal.Duration` / `timedelta` / `Duration`.
- Java `fromJson`/`fromJsonString` factories and `Validator.validateJson(String)`
  — Java needs an explicit JSON layer; TS/Python take already-parsed data.

**Worth unifying for consistency:**
- **Bounds types:** TS has two types — `DayBounds` (non-null fields) and
  `SummerBounds` (nullable) — while Java collapses both into one `Bounds`
  record (`BellSchedule.java:191,473`) and Python uses dicts. The nullability
  distinction is meaningful (summer bounds can be null/open-ended). Decide
  whether to (a) give Java/Python two distinct shapes mirroring TS, or (b)
  document that the single shape is intentional and the nullability contract
  lives in the docs. Recommend (a) for the typed ports if cheap.
- **`role` defaulting layer:** Java's `Options` defaults a null role to
  `student` in the core (`Options.java:30`); TS/Python require `role` at the
  core and default to `student` only in the higher-level options
  (`types.ts:55`). Pick one layer for the default in all three (recommend: keep
  the default in the higher-level options/wrapper, as TS does, and let the core
  require it — or make all three default in the core; just be consistent).
- **`includeTags` normalization entry point:** TS/Python accept a flat list *or*
  a map directly into the `Calendar` constructor via `normalizeIncludeTags`
  (`calendar.ts:122`, `calendar.py:277`); Java requires the caller to pre-build
  `Options.ofFlat(...)` (`Options.java:59`). Consider a Java `Calendar`/`Options`
  path that accepts a raw flat list for parity.
- **Optional `options` argument:** Java's `Calendars.forYear`/`current` require
  an `Options`; TS/Python default it. Add no-arg / null-tolerant Java overloads.

---

## Part 4 — Test reconciliation

Coverage has drifted; several behaviors are tested in one or two languages but
not the third, which is how the divergences above survived. Two themes:

### 4.1 Fill the cross-language gaps

- **`Calendars` loader has zero tests in any language** (FS vs URL load,
  single-object normalization, summer adjacent-year prepend/append, the
  `firstDayTeachers` fallback §1.3, the `inYear` boundary, the §1.2 zone
  behavior). This is the biggest hole — every §1.2/§1.3 divergence is currently
  invisible to CI. Add a loader test suite to all three (a local fixtures
  directory of year JSON, plus the summer/boundary cases).
- **Java calendar-core gaps:** add the named-schedule date override
  (`dates: {date: "ASSEMBLY"}`), the custom `weekdaySchedules` mapping, and the
  "`seventh` passes / `ext` excluded" optional-period case — all tested in TS
  (`calendar.test.ts:188,211,348`) and Python (`test_calendar.py:130,145,237`)
  but missing in Java's `CalendarTest`.
- **`periodsForDate`** is tested only in Java (`BellScheduleTest.java:188`); add
  the mid-day and roll-to-next-day cases to TS and Python.
- **Period-shape assertion** is in TS/Python but not Java (low impact given the
  typed record).
- **Validator malformed-input tests** in all three — non-dict array element,
  wrong-type containers, empty `{}` required field, multi-id ordering,
  non-boolean `teachers`. Adding these surfaces the Python crashes (§1.4–1.6)
  and the Java edges (§1.8) as failing tests, which is exactly what we want
  before fixing them.
- **Java inline-array AM-time validation** test (TS `validate.test.ts:211`,
  Python `test_validate.py:171` exercise AM times inside a `dates` inline
  override; Java only tests a string schedule reference).

### 4.2 Broaden the thin `BellSchedule` coverage (all three)

All three suites only really exercise `nextSchoolDay`, `previousSchoolDay`,
`schoolDaysBetween`, `scheduleFor`, `nonClassDays` (+ `periodsForDate` in Java).
Untested everywhere: `currentInterval`, `periodAt`, **`isSchoolDay()` no-arg**
(the §1.1 divergence has no regression guard), `currentDayBounds`,
`summerBounds`, `nextYearStart`/`currentYearStart`/`currentYearEnd` (including
their null edges), the duration counters, and `scheduleNameFor`. Add coverage,
prioritizing the methods touched by Part 1.

### 4.3 Consider shared golden fixtures

To keep the three suites from drifting again, consider a small set of
language-neutral **golden fixtures** — input calendar JSON plus expected outputs
(periods at instant X, schedule name for date Y, validation error lists) — that
each port loads and asserts against. This makes "same semantics" a checked
invariant rather than three hand-maintained suites. Optional but high-leverage.

---

## Suggested order of work

1. **§1.4–1.6 Python validator robustness + ordering** — clear bugs (crashes /
   nondeterminism), self-contained, add the malformed-input tests (§4.1) first
   so they fail, then fix.
2. **§1.1 `isSchoolDay` + §1.2 `Calendars.current` timezone model** — decide the
   "what is today" model once (they're related), apply to all three, add the
   `Calendars` loader tests (§4.1) and the `isSchoolDay()` no-arg test (§4.2),
   then remove `DIVERGENCES.md` §1.
3. **§4.1 cross-language test gaps** (Java calendar core, `periodsForDate`) —
   cheap, and locks in the already-correct behavior.
4. **§1.3 empty-string-as-absent** + **§1.7 seconds tolerance** + **§2.1
   `noon`** — small, mechanical parity fixes.
5. **Part 3 API-idiom unification** — the optional decisions; do after behavior
   is locked.

## Decisions needed (genuine choices, not just "match TS")

- **§1.2 / §1.1 timezone model:** confirm "optional zone, default system-local"
  for `Calendars.current`, and "default to active-calendar timezone" for
  `isSchoolDay`. (Recommended above.)
- **§1.7:** do we want *lenient* time parsing (truncate seconds, match TS) or
  *strict* "H:M only" parsing enforced in all three? Recommended: lenient, to
  match the reference.
- **Part 3 Bounds:** give the typed ports two bound shapes mirroring TS, or
  document the single shape as intentional?
- **§2.2:** keep Python's extra datetime helpers as internal, or drop them for a
  strictly identical surface?

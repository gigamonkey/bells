# Plan: Temporal polyfill strategy

Analysis + a phased path for how the project should consume the Temporal API as
native support lands. Written 2026-07-21; the external facts move fast, so the
"landscape" section is dated and should be re-checked before acting on the later
phases.

**Status (2026-08-04): Phases 1 and 2 are implemented; only Phase 3 (gated on
a Node ≥ 26 floor and Safari adoption) remains.** Phase 1: everything now uses
`temporal-polyfill@^1.0.1` and `@js-temporal/polyfill` is gone (app, server,
library CLI, ambient types, peer dep). Phase 2: app modules import a
`temporal-setup.js` bootstrap that feature-detects `globalThis.Temporal` and
dynamically imports `temporal-polyfill/global` only when absent; esbuild code
splitting emits it as a fixed-name `temporal.js` chunk (precached by the
service worker, published by the Makefile). `out.js` went 476 kB → 421 kB
(Phase 1) → 240 kB (Phase 2), with the 188 kB chunk downloaded only by
browsers without native Temporal. Note: the published `@peterseibel/bells`
still declares the old peer dep until its next release, and the "stale server
deps" refresh noted below is still outstanding.

## The question

Do we still need a Temporal polyfill, and if so which one? The project currently
bundles `@js-temporal/polyfill` (~160 kB) into the browser bundle for *every*
user and also depends on it server-side — even though Node and most browsers now
ship Temporal natively.

## Current state (inventory)

Two different polyfills are in play, inconsistently:

- **App (browser), unconditional bundle** — `@js-temporal/polyfill` is imported
  at the top of `bells.js`, `calendar.js`, `timer.js`, `alarms.js`,
  `timer-routines.js`. `calendar.js` does `globalThis.Temporal = Temporal` so the
  `@peterseibel/bells` library (which reads Temporal as a global) works. esbuild
  inlines the whole polyfill into `out.js` — roughly a third of the 476 kB
  bundle — and ships it to browsers that already have native Temporal.
- **Server** — `server/index.js` imports `@js-temporal/polyfill`
  (`server/package.json` deps).
- **Library `@peterseibel/bells`** — correctly takes Temporal as a *global* (no
  bundled polyfill). But its edges reference both: `src/temporal-global.d.ts`
  imports the *type* from `@js-temporal/polyfill` (type-only, zero runtime), the
  `bells-validate` CLI (`src/bin/validate.ts`) imports `@js-temporal/polyfill` at
  runtime to install the global, and the test setup (`test/setup.ts`) uses
  `temporal-polyfill`.
- **Dead weight** — the app's root `package.json` lists `temporal-polyfill`
  (`^0.3.2`) that nothing imports. (The recent bump to `^1.0.1` was applied to
  the *library's* test devDependency, which is real; the app's entry is still
  the unused one.)

## Landscape as of 2026-07 (researched — re-verify before Phases 2–3)

- **Temporal is ES2026.** Reached TC39 Stage 4 on 2026-03-11.
- **Node:** shipped **enabled by default in Node 26.0.0 (2026-05-05)**;
  `globalThis.Temporal` with no flag (confirmed on the Node 26.5 in our dev
  container). Node 26 goes **LTS in Oct 2026**. **Node 24 does *not* have it** —
  and our CI (`.github/workflows/*.yml`) runs **Node 24**.
- **Browsers:** Chrome 144 (Jan 2026) and Firefox 139 shipped Temporal; **Safari
  has *not* shipped it yet** (in development). Global coverage was ~64% in early
  2026. For a BHS-student audience — heavy iOS Safari — the missing browser is
  exactly the one that matters most, so a browser polyfill **cannot be dropped
  yet**, only made smaller and conditional.
- **Polyfill choice, when one is needed:** both are now spec-compliant.
  `temporal-polyfill` (FullCalendar) is ~57 kB vs `@js-temporal/polyfill`'s
  ~160 kB, is tree-shakeable, actively maintained, and is at **1.0**.
  `@js-temporal/polyfill` has proposal-champion pedigree but sits at 0.5.x and
  releases less often. Verified drop-in: `temporal-polyfill` exports the same
  `{ Temporal, Intl, toTemporalInstant }` shape, and ships a
  **`temporal-polyfill/global`** subpath that installs `globalThis.Temporal`
  on import — ideal for conditional loading. Our library tests already run green
  on `temporal-polyfill@1.0.1`.

## Recommendation

Three moves, increasingly gated on adoption:

1. **Standardize on `temporal-polyfill`** as the single polyfill and retire
   `@js-temporal/polyfill` everywhere. Smaller, maintained, tree-shakeable,
   drop-in, already validated by our tests.
2. **Load the polyfill conditionally, never unconditionally.** Feature-detect
   `globalThis.Temporal` and only pull the polyfill in when it's absent, so
   native-Temporal browsers/Node pay nothing.
3. **Keep a browser polyfill until Safari ships + adoption catches up** (likely
   2027+). Server/CLI/tests can go polyfill-free sooner, once the project's Node
   floor is 26.

## Target architecture

- **One tiny bootstrap** that every entry point uses instead of a bare
  `import { Temporal } from '<polyfill>'`:

  ```js
  // temporal-setup.js  (browser + node both work)
  if (!globalThis.Temporal) {
    await import('temporal-polyfill/global'); // installs globalThis.Temporal
  }
  // after this, code uses the global `Temporal`, native or polyfilled
  ```

  App code stops importing `Temporal` from a package and just uses the global
  `Temporal` (which `calendar.js` already sets up for the library's benefit).
  With a top-level `await import(...)`, esbuild splits the polyfill into a
  separate chunk that only downloads on browsers that lack Temporal — turning a
  ~160 kB always-tax into a ~57 kB rarely-tax.

- **Library:** swap the two `@js-temporal/polyfill` references for
  `temporal-polyfill` — the type-only import in `temporal-global.d.ts` and the
  runtime global-install in the `bells-validate` CLI (`if (!globalThis.Temporal)
  await import('temporal-polyfill/global')`). No change to the library's runtime
  contract (still a consumer-supplied global).

## Risks & considerations

- **iOS Safari.** The single biggest reason not to drop the browser polyfill.
  Gate Phase 3's browser removal on caniuse coverage of the actual audience, not
  a calendar date.
- **esbuild + dynamic import.** The conditional load must be a real
  `await import()` so the polyfill lands in its own chunk; a static import gets
  inlined and defeats the purpose. Verify `out.js` shrinks and a second chunk
  appears, and that the top-level await is acceptable for the app's load (it is
  an ES-module app already).
- **Feature detection sharpness.** `!globalThis.Temporal` is fine now that
  Temporal is Stage 4 and shipping implementations are complete; no need for
  finer capability probing.
- **CI is on Node 24.** Library tests still need a polyfill there, so keep
  `temporal-polyfill` as a devDependency until CI moves to Node 26. Bumping CI +
  adding `"engines": { "node": ">=26" }` is the trigger for dropping the
  server/CLI polyfill entirely.
- **Stale server deps (out of scope but noted):** `server/package.json` pins
  `@peterseibel/bells@^0.2.0` and `@peterseibel/bhs-calendars@^2.0.0` — worth a
  separate refresh.

## Steps

**Phase 1 — unify + de-dupe (safe now, no behavior change):**

1. Add `temporal-polyfill` as a real app dependency; remove the unused/dead app
   entry confusion by making it the *only* Temporal package in the app.
2. Replace `@js-temporal/polyfill` imports in the app and server with the
   `temporal-setup.js` bootstrap (still unconditional for now if you want to
   split Phase 1 from Phase 2) and use the global `Temporal`.
3. Library: replace the two `@js-temporal/polyfill` references with
   `temporal-polyfill`; drop `@js-temporal/polyfill` from every `package.json`.
4. Rebuild, run all suites (`make test-libs`, app `npm test`), click through the
   app in a browser.

**Phase 2 — make the browser load conditional (bundle win):**

5. Convert the bootstrap to feature-detect + `await import('temporal-polyfill/global')`.
6. Confirm esbuild emits a separate polyfill chunk, `out.js` drops ~160 kB, and
   the app works both with native Temporal (Chrome/Firefox) and with the
   polyfill forced (simulate by deleting `globalThis.Temporal` before load /
   testing in Safari).

**Phase 3 — go polyfill-free where Temporal is native (gated):**

7. When adopting a **Node ≥ 26** floor (after its Oct 2026 LTS): bump CI to
   Node 26, add `engines.node >=26`, and drop the polyfill from server, the
   `bells-validate` CLI, and the library test setup (native global).
8. Keep the *browser* conditional polyfill until the audience's Safari coverage
   is high enough; then delete Phase 2's dynamic import.
```

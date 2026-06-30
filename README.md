# Berkeley High School bells app.

See it here: https://gigamonkeys.com/misc/bhs/.

Pin it to homescreen of your phone for an app-like experience.

Click the gear to configure your zero and seventh periods.

Click the clock to see the current day's schedule during school or the next day's schedule if school is over for the day.

Click the QR code icon to get a big QR code to easily share the app with your friends.

---

## Development

The repo contains:

- **The web app** (repo root) — `bells.js`, `calendar.js`, `datetime.js`, `dom.js`, `index.html`, `style.css`, bundled to `out.js` by esbuild.
- **`libs/`** — framework-agnostic ports of the schedule logic, kept in version lockstep:
  - **`libs/ts/`** — the `@peterseibel/bells` npm package (TypeScript); the reference implementation used by the web app and server.
  - **`libs/python/`** — the `bell-schedule` PyPI package (Python port; see `libs/python/DIVERGENCES.md` for where it differs from the TS reference).
  - **`libs/java/`** — a Java port built on `java.time` (not yet published to Maven Central).
- **Calendar data** — per-year BHS-area calendar JSON, published as data packages versioned independently of the library:
  - **`bhs-calendars/`** — the canonical source, and the `@peterseibel/bhs-calendars` npm package.
  - **`libs/python-calendars/`** — the `bhs-calendars` PyPI package (bundles a build-time copy of the canonical JSON; see "Working on the calendar data" below).
  - **`libs/java-bhs-calendars/`** — the `com.gigamonkeys:bhs-calendars` Maven artifact (not yet published).
- **`server/`** — an Express REST API (`@peterseibel/bells` over HTTP); has its own `package.json`.

### Running the web app locally

```sh
npm install
npm run dev           # esbuild --watch + static server on :8081
```

Open http://localhost:8081. Edits to any source file rebuild `out.js`; reload the browser to see changes.

Useful make targets (see `Makefile`):

```sh
make build     # one-shot bundle
make watch     # esbuild watch only (no HTTP server)
make pretty    # prettier + tidy
make lint      # eslint
make serve     # start the REST API server on :3000
make publish   # deploy the web app to ~/web/www.gigamonkeys.com/misc/bhs/
```

There is no test suite for the web app. To test future dates without waiting, call `setOffset()` from the browser console (defined in `bells.js`).

---

## Working on `@peterseibel/bells` (the `libs/ts/` package)

```sh
cd libs/ts
npm install
npm test                                # node --test test/*.test.js
npx bells-validate path/to/calendar.json
```

The library uses `Temporal` as a global; tests install a polyfill. Consumers must do `globalThis.Temporal = Temporal` before using it (as `calendar.js` does at the repo root).

### Publishing

The three library ports share one version. `make release-lib` bumps all three (TypeScript via `npm version`, then Python and Java via `scripts/set-version.py`), commits the version files, tags `vX.Y.Z`, and pushes:

```sh
make release-lib                 # patch bump (default)
make release-lib VERSION=minor   # or: major, or an explicit version like 1.4.2
```

The `v*` tag fires `.github/workflows/publish.yml`, which publishes **both** registries via Trusted Publisher (OIDC — no tokens): the `@peterseibel/bells` npm package and the `bell-schedule` PyPI package, each gated on its own test run. (Java/Maven Central is not yet wired up.)

Once the Action completes, bump the npm dep in the root and in `server/`:

```sh
npm install @peterseibel/bells@latest
cd server && npm install @peterseibel/bells@latest
```

---

## Working on the calendar data (`bhs-calendars`)

Each academic year is its own JSON file (e.g. `bhs-calendars/bhs-2025-2026.json`); the schema is documented in [libs/ts/README.md](libs/ts/README.md#calendar-data-format).

**`bhs-calendars/` at the repo root is the single source of truth** — both the npm package and the canonical data. The Python (`libs/python-calendars/`) and Java (`libs/java-bhs-calendars/`) data packages bundle a verbatim, build-time copy of this JSON; those copies are **gitignored, not committed**, so they can't drift from the source. Regenerate them with:

```sh
make sync-calendars        # both ports (or: sync-py-calendars / sync-java-calendars)
```

Run that once after checkout, and again after editing the source, before building or testing those packages. Validate edits with the same checker CI gates on:

```sh
make validate-calendars    # builds the TS validator, checks every year's JSON
```

### Publishing

The calendar data versions independently of the library, on its own `calendars-v*` tag line. `make release-bhs-calendars` validates the canonical JSON, bumps every port in lockstep (npm via `npm version`, then the Python and Java data packages), commits, tags `calendars-vX.Y.Z`, and pushes:

```sh
make release-bhs-calendars                 # patch bump (default)
make release-bhs-calendars VERSION=minor   # or: major, or an explicit version
```

The `calendars-v*` tag fires `.github/workflows/publish-calendars.yml`. A shared `validate` job (the canonical JSON must pass `bells-validate`) gates **both** publishes, so invalid data blocks every registry: the `@peterseibel/bhs-calendars` npm package and the `bhs-calendars` PyPI package (whose data is synced from the source at build time). Manual `workflow_dispatch` publishes PyPI only.

Once the Action completes, bump the npm dep in the root and in `server/`:

```sh
npm install @peterseibel/bhs-calendars@latest
cd server && npm install @peterseibel/bhs-calendars@latest
```

---

## Testing the web app against unpublished library changes

Both libraries are imported from the npm registry by default, so edits to `libs/ts/` or `bhs-calendars/` do not affect the web app until you publish. To test local changes before publishing, install the local directory as a file dependency:

```sh
# Test against local bhs-calendars:
npm install ./bhs-calendars

# Test against local ts library:
npm install ./libs/ts
```

esbuild picks up changes on the next rebuild (`npm run dev` is in watch mode), so edit the JSON or library source, save, and reload the browser. Validate calendar changes with `bells-validate` as you go.

**Before committing**, switch back to the registry versions so `package.json` records an actual published version:

```sh
npm install @peterseibel/bhs-calendars@latest
npm install @peterseibel/bells@latest
```

The deployed site is unaffected either way (esbuild bundles everything into `out.js`), but a `file:` dep in `package.json` hurts reproducibility and muddies `package-lock.json` diffs.

An alternative is to temporarily edit the imports at the top of [calendar.js](calendar.js) to point at `./bhs-calendars/bhs-2025-2026.json` etc. — that avoids touching `package.json`, but you have to remember to revert the imports.

---

## REST API server

```sh
cd server
npm install
npm start             # or: `make serve` from the repo root
```

Configured via env vars: `PORT` (default 3000), `CALENDARS_PATH` (directory or URL for calendar JSON).

Endpoints: `GET /api/current`, `/api/schedule`, `/api/status`. All accept `role`, `includeTags`, `time`, and `date` query params.

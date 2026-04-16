# Berkeley High School bells app.

See it here: https://gigamonkeys.com/misc/bhs/.

Pin it to homescreen of your phone for an app-like experience.

Click the gear to configure your zero and seventh periods.

Click the clock to see the current day's schedule during school or the next day's schedule if school is over for the day.

Click the QR code icon to get a big QR code to easily share the app with your friends.

---

## Development

The repo contains four things:

- **The web app** (repo root) — `bells.js`, `calendar.js`, `datetime.js`, `dom.js`, `index.html`, `style.css`, bundled to `out.js` by esbuild.
- **`lib/`** — the `@peterseibel/bells` npm package: framework-agnostic schedule logic.
- **`bhs-calendars/`** — the `@peterseibel/bhs-calendars` npm package: per-year BHS calendar JSON.
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

## Working on `@peterseibel/bells` (the `lib/` package)

```sh
cd lib
npm install
npm test                                # node --test test/*.test.js
npx bells-validate path/to/calendar.json
```

The library uses `Temporal` as a global; tests install a polyfill. Consumers must do `globalThis.Temporal = Temporal` before using it (as `calendar.js` does at the repo root).

### Publishing

Publishing is automated via GitHub Actions with npm Trusted Publisher (OIDC) — no token needed. The workflow (`.github/workflows/publish.yml`) fires on `v*` tags and runs `npm publish --provenance --access public` from `lib/`.

The `release-lib` make target does the version bump, tag, and push:

```sh
make release-lib      # patch bump; commits lib/package.json, tags vX.Y.Z, pushes
```

For a minor or major bump, run the steps manually:

```sh
cd lib
npm version minor --no-git-tag-version   # or: major
cd ..
git add lib/package.json lib/package-lock.json
git commit -m "v$(node -p "require('./lib/package.json').version")"
git tag "v$(node -p "require('./lib/package.json').version")"
git push --follow-tags
```

Once the Action completes, bump the dep in the root and in `server/`:

```sh
npm install @peterseibel/bells@latest
cd server && npm install @peterseibel/bells@latest
```

---

## Working on `@peterseibel/bhs-calendars` (the `bhs-calendars/` package)

Each academic year is its own JSON file (e.g. `bhs-calendars/2025-2026.json`). The schema is documented in [lib/README.md](lib/README.md#calendar-data-format). Validate before publishing:

```sh
cd lib && npx bells-validate ../bhs-calendars/2025-2026.json
```

### Publishing

Publishing is automated via GitHub Actions with npm Trusted Publisher (OIDC), the same as the `lib/` package. The workflow (`.github/workflows/publish-calendars.yml`) fires on `calendars-v*` tags, validates every year's JSON with `bells-validate`, and then runs `npm publish --provenance --access public` from `bhs-calendars/`.

```sh
make release-calendars    # patch bump; commits, tags calendars-vX.Y.Z, pushes
```

For a minor or major bump, run the steps manually:

```sh
cd bhs-calendars
npm version minor --no-git-tag-version    # or: major
cd ..
git add bhs-calendars/package.json
git commit -m "calendars-v$(node -p "require('./bhs-calendars/package.json').version")"
git tag "calendars-v$(node -p "require('./bhs-calendars/package.json').version")"
git push --follow-tags
```

Once the Action completes, bump the dep in the root and in `server/`:

```sh
npm install @peterseibel/bhs-calendars@latest
cd server && npm install @peterseibel/bhs-calendars@latest
```

---

## Testing the web app against unpublished library changes

Both libraries are imported from the npm registry by default, so edits to `lib/` or `bhs-calendars/` do not affect the web app until you publish. To test local changes before publishing, install the local directory as a file dependency:

```sh
# Test against local bhs-calendars:
npm install ./bhs-calendars

# Test against local lib:
npm install ./lib
```

esbuild picks up changes on the next rebuild (`npm run dev` is in watch mode), so edit the JSON or library source, save, and reload the browser. Validate calendar changes with `bells-validate` as you go.

**Before committing**, switch back to the registry versions so `package.json` records an actual published version:

```sh
npm install @peterseibel/bhs-calendars@latest
npm install @peterseibel/bells@latest
```

The deployed site is unaffected either way (esbuild bundles everything into `out.js`), but a `file:` dep in `package.json` hurts reproducibility and muddies `package-lock.json` diffs.

An alternative is to temporarily edit the imports at the top of [calendar.js](calendar.js) to point at `./bhs-calendars/2025-2026.json` etc. — that avoids touching `package.json`, but you have to remember to revert the imports.

---

## REST API server

```sh
cd server
npm install
npm start             # or: `make serve` from the repo root
```

Configured via env vars: `PORT` (default 3000), `CALENDARS_PATH` (directory or URL for calendar JSON).

Endpoints: `GET /api/current`, `/api/schedule`, `/api/status`. All accept `role`, `includeTags`, `time`, and `date` query params.

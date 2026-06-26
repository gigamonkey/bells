# Publishing the Python library to PyPI

Goal: publish `libs/python/` (the Python port of `@peterseibel/bells`) to PyPI,
using a GitHub Actions **Trusted Publisher** (OIDC) workflow — the same
token-less pattern already used for the npm package, just adapted to PyPI.

## 0. Decide on the package name (do this first — it blocks everything else)

PyPI has **no namespaces/scopes**, so the bare name `bells` (currently in
`libs/python/pyproject.toml`) is **already taken** (the JSON API returns `200`
for it). Pick a distinct, available name before anything else.

Availability checked via `https://pypi.org/pypi/<name>/json` (`404` = available):

| Candidate            | Status        |
| -------------------- | ------------- |
| `bell-schedule`      | ✅ available  |
| `school-bells`       | ✅ available  |
| `bhs-bells`          | ✅ available  |
| `peterseibel-bells`  | ✅ available  |
| `gigamonkeys-bells`  | ✅ available  |
| `bells`              | ❌ taken      |

`bell-schedule` and `school-bells` are the leading candidates (descriptive and
unscoped); the `*-bells` options are fallbacks if you'd rather keep `bells` in
the name.

- The **import name stays `bells`** (the `bells/` package directory). Only the
  *distribution* name (what you `pip install`) needs to change. So
  `pip install bell-schedule` would still be `import bells`.
- Once chosen, update `name = "..."` in `pyproject.toml` (see step 2). Note the
  `bells-validate` console script name can stay as-is regardless.

**Decided:** the distribution name is **`bell-schedule`** (set in
`pyproject.toml`), used throughout the rest of this plan.

## 1. Create PyPI account(s)

- Create an account on https://pypi.org if you don't have one.
- Strongly recommended: also create an account on https://test.pypi.org (a
  separate account/registration) for a dry-run publish before going live.
- Enable 2FA on both (required by PyPI for uploads).

## 2. Tidy up `pyproject.toml` for a real release

Current file is minimal but functional. Before publishing, fill in metadata
that makes the PyPI project page useful and the package installable cleanly:

- `name = "bell-schedule"` — the chosen available name from step 0. ✅ done
- `version` — confirm `0.5.0` is the intended first published version (or bump).
- Add `[project]` niceties: `keywords`, `classifiers` (e.g. development status,
  `License :: OSI Approved :: MIT License`, supported `Programming Language ::
  Python :: 3.9` … `3.13`), and a longer `description` if desired.
- Under `[project.urls]`, the `Repository` URL is already set; consider adding
  `Homepage` and `Bug Tracker`.
- Confirm `license = { text = "MIT" }` — modern setuptools prefers the SPDX
  string form `license = "MIT"` plus `license-files = ["LICENSE"]`. Check
  whether a `LICENSE` file exists in `libs/python/` (or repo root) and is
  included; add one if missing.
- `readme = "README.md"` is set — this becomes the PyPI long description. Verify
  the README renders standalone (its relative links like `../ts` will be broken
  on PyPI; consider absolute GitHub URLs).

## 3. Verify a clean local build

From `libs/python/`. `uv build` reads the `setuptools` build backend from
`pyproject.toml` and builds in an isolated env, so there's nothing to
pre-install; `uvx` runs a tool in a throwaway env (no global install):

```bash
uv build                 # builds sdist + wheel into dist/ (isolated build env)
uvx twine check dist/*   # validates metadata + README rendering
```

This produces `dist/bell_schedule-0.7.0-py3-none-any.whl` and the matching
`.tar.gz` (the distribution name `bell-schedule` normalizes to `bell_schedule`
in artifact filenames). Confirm the wheel contains the `bells/` package and the
`bells-validate` entry point, and that `dist/` is gitignored (it is — see
`libs/python/.gitignore`).

Run the test suite against the project the uv way (syncs an ephemeral env from
`pyproject.toml`, including the `test` extra):

```bash
uv run --extra test pytest
```

Optional sanity check that the built wheel installs and imports cleanly, in a
throwaway venv:

```bash
uv venv /tmp/pypi-test
uv pip install --python /tmp/pypi-test dist/*.whl
# bells-validate takes calendar file paths (no --help flag); point it at a real one:
/tmp/pypi-test/bin/bells-validate ../../bhs-calendars/bhs-2025-2026.json   # -> "...: valid"
/tmp/pypi-test/bin/python -c "import bells; print(bells.__file__)"
```

(Or, just to exercise the console script from the wheel without a venv:
`uvx --from dist/bell_schedule-0.7.0-py3-none-any.whl bells-validate ../../bhs-calendars/bhs-2025-2026.json`.)

## 4. (Recommended) Dry-run upload to TestPyPI

Configure a Trusted Publisher on TestPyPI (same steps as 5 below, on the
test.pypi.org pending-publisher page), or use a temporary API token, then:

```bash
uvx twine upload --repository testpypi dist/*
# Verify it resolves and installs from TestPyPI, in a throwaway env:
uv venv /tmp/testpypi
uv pip install --python /tmp/testpypi \
  --index-url https://test.pypi.org/simple/ --no-deps bell-schedule
```

This catches name/metadata/rendering problems without burning the real name.

## 5. Set up PyPI Trusted Publisher (OIDC) — no API token needed

This mirrors the npm Trusted Publisher setup already in use. On PyPI:

1. Go to your PyPI account → **Publishing** → **Add a pending publisher**
   (works even before the project exists — it's created on first upload).
2. Fill in:
   - **PyPI Project Name**: `bell-schedule`
   - **Owner**: `gigamonkey` (the GitHub account that owns the repo — your
     GitHub handle, *not* your PyPI username and not the `gigamonkeys` domain;
     it must match the `gigamonkey/bells` in the repo URL).
   - **Repository name**: `bells`
   - **Workflow name**: `publish.yml` (the combined publish workflow — step 6).
   - **Environment name**: leave **blank** for now. The workflow in step 6 sets
     no environment, and the two must match. (Optional hardening later: create a
     GitHub Environment named `pypi`, add `environment: pypi` to the `pypi` job,
     and register the same name here.)

No secrets are stored in GitHub; the workflow authenticates via OIDC.

## 6. Add the PyPI job to the publish workflow

Because the three library ports are kept in version lockstep (`make release-lib`
bumps TS + Python + Java together and tags `v*`), a single `v*` tag is one
coordinated release. So rather than a separate `publish-python.yml` on its own
tag, **add a `pypi` job to the existing `.github/workflows/publish.yml`** (the
npm publish workflow, already triggered on `v*`). Both registries' Trusted
Publishers then register the same workflow filename, `publish.yml`.

Keep the filename `publish.yml` — the npm Trusted Publisher is already bound to
it; renaming would mean reconfiguring npm on npmjs.com. The `name:` display field
can change freely.

This is already implemented in the repo. The shape:

```yaml
name: Publish library

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:          # manual run -> PyPI only (see npm job's `if`)

jobs:
  npm:
    if: github.event_name == 'push'   # tag pushes only; npm rejects re-publishes
    runs-on: ubuntu-latest
    permissions: { contents: read, id-token: write }
    steps:
      # ...existing setup-node + npm test + npm publish --provenance...

  pypi:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write          # required for OIDC Trusted Publishing
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with:
          python-version: '3.x'
      - name: Run tests
        working-directory: libs/python
        run: |
          python -m pip install -e '.[test]'
          python -m pytest
      - name: Build sdist + wheel
        working-directory: libs/python
        run: |
          python -m pip install --upgrade build
          python -m build
      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: libs/python/dist
```

Notes:

- Two independent parallel jobs share the `v*` trigger. Each carries its own
  `id-token: write`, so each gets its own OIDC token for its registry. If one
  registry fails you re-run just that job ("Re-run failed jobs").
- `workflow_dispatch` + the npm job's `if` let a **manual run publish PyPI only**,
  building whatever version is in `libs/python/pyproject.toml`. This is the path
  to a first PyPI publish at the current version (`v0.7.0` is already tagged, so
  the tag trigger won't re-fire) without forcing an npm re-publish.
- `pypa/gh-action-pypi-publish` auto-detects the OIDC token; no `password:`/token
  input needed when Trusted Publishing is configured.
- The test step keeps PyPI consistent with the npm job, which runs `npm test`
  before publishing. The golden tests run as part of pytest, so this also guards
  cross-port behavior parity.
- The job uses stock `setup-python` + `pip`/`build` (no runner setup, identical
  artifacts). To match the local `uv` flow instead, swap in `astral-sh/setup-uv@v5`
  with `uv run --extra test pytest` and `uv build`; the publish step is unchanged.
- The `bhs-calendars` data packages stay on their own `publish-calendars.yml` /
  `calendars-v*` line — they version independently of the library.

## 7. Publish

### First publish (PyPI 0.7.0, this morning)

`v0.7.0` is already tagged (npm is out), so the tag trigger won't re-fire. Use
the manual path:

1. Finish steps 1 and 5 (PyPI account + Trusted Publisher for `bell-schedule`,
   workflow `publish.yml`, no environment).
2. Make sure the updated `publish.yml` is on the default branch (`main`).
3. GitHub → **Actions** → **Publish library** → **Run workflow** (on `main`).
   Only the `pypi` job runs; it builds 0.7.0 from `libs/python/pyproject.toml`
   and publishes.
4. Confirm it appears at `https://pypi.org/project/bell-schedule/`.

### Ongoing releases (lockstep, all ports)

`make release-lib VERSION=patch|minor|major` bumps TS + Python + Java to the same
version, commits, tags `v<x>`, and pushes. The `v*` tag fires `publish.yml`,
which publishes **both** npm and PyPI at that version. Just watch the Actions run.

## 8. Follow-ups / housekeeping

- Update `CLAUDE.md` and/or `libs/python/README.md` with the published
  `pip install bell-schedule` instructions and the lockstep release convention.
- Optional hardening: add a `pypi` GitHub Environment (with required reviewers,
  if desired), set `environment: pypi` on the job, and register it in the
  Trusted Publisher.
- When ready, give the `bhs-calendars` Python/Java packages (section 9) the same
  treatment on the `publish-calendars.yml` / `calendars-v*` line.

## 9. Companion: publishing the calendar *data* (`bhs-calendars`) to PyPI

The library and the calendar data are separate concerns — mirror the npm split
(`@peterseibel/bells` + `@peterseibel/bhs-calendars`) on PyPI rather than
bundling the JSON into the `bells` package. The data changes far more often than
the library (the npm data package is already at `2.8.1` while the library is at
`0.5.0`); coupling them would force a library release for every calendar fix.

`bhs-calendars` is **available on PyPI** (as are `bell-calendars`,
`bhs-bell-calendars`).

### Expose a flat-array loader, NOT a feed for `Calendars`

This is the key design decision. There are two unrelated ways TS consumes
calendar data, and a Python data package must target the right one:

- The path-based `Calendars` loader (`libs/python/bells/calendars.py`, and its TS
  twin) only understands `` `${base_path}${year}.json` `` — bare academic-year
  filenames like `2025-2026.json`, **one school per directory**. It knows nothing
  about the `bhs-`/`king-6-`/`willard-78-` filename prefixes.
- The published multi-school package is consumed a completely different way: the
  web app imports the flat array from `index.js` and **groups by the `id` field
  inside each JSON object** (`calendar.js:buildRegistry`). Filenames are
  irrelevant on this path — the `id` field is the source of truth for which
  school a year belongs to.

So the Python data package should **mirror `index.js`**: ship the JSON as
package data and expose a function returning the flat list of year objects, e.g.

```python
# bhs_calendars/__init__.py
import json
from importlib.resources import files

def load_all() -> list[dict]:
    """All yearly calendar objects as a flat list (parallels npm index.js).

    Group by the ``id`` field to assemble per-school year sequences; a single
    BellSchedule consumes one such group.
    """
    out = []
    for entry in files(__package__).joinpath("data").iterdir():
        if entry.name.endswith(".json"):
            out.append(json.loads(entry.read_text(encoding="utf-8")))
    return out
```

Consumers then group by `id` and build a `BellSchedule` directly — exactly as
`calendar.js` does — instead of going through the path-based `Calendars` loader:

```python
from collections import defaultdict
from bells import BellSchedule
from bhs_calendars import load_all

by_id = defaultdict(list)
for y in load_all():
    by_id[y["id"]].append(y)
years = sorted(by_id["bhs"], key=lambda y: y["firstDay"])
schedule = BellSchedule(years, {})
```

The path-based `Calendars` loader stays as-is for the "point me at a directory
of `<year>.json` files" use case (single-school / custom setups, the server).

### Packaging notes

- Layout: `libs/python-calendars/` (or similar) with a `bhs_calendars/` package
  and the JSON under `bhs_calendars/data/`. Include the JSON via
  `[tool.setuptools.package-data]` (or `MANIFEST.in`) so it ships in the wheel.
- Reuse the same source JSON as the npm package (`bhs-calendars/*.json`) rather
  than duplicating it — e.g. copy at build time or symlink in the source tree —
  so the two registries never drift.
- Give it its own version line (it diverges from the library — `2.8.1` vs the
  library's `0.7.0`) on the existing `calendars-v*` tag line; a `pypi` job in
  `publish-calendars.yml` publishes it alongside npm (mirrors steps 5–6).
- Decide whether to ship a thin re-export from `bells` (e.g. `bells` lists
  `bhs-calendars` as an optional/extra dependency) so `pip install bells[bhs]`
  gets both — or keep them fully independent like the npm packages.

**Status (Python):** done. `libs/python-calendars` has full metadata + LICENSE,
builds clean (`twine check` passes, all 19 calendars bundled), and a `pypi` job
is wired into `publish-calendars.yml`. First publish of `bhs-calendars` 2.8.1
goes via manual `workflow_dispatch` (the `calendars-v2.8.1` tag already exists,
so the tag trigger won't re-fire) — same pattern as the library's 0.7.0. The
Java port is deferred.

## Decisions made

1. **Distribution name**: `bell-schedule` (set in `pyproject.toml`).
2. **Tag strategy**: shared `v*` — one combined `publish.yml` publishes npm +
   PyPI in lockstep (step 6).
3. **First version**: `0.7.0`, matching the TS line via the lockstep setup.

## Open questions for you

1. **`bells[bhs]` extra**: should the `bell-schedule` package offer `bhs-calendars`
   as an optional extra (`pip install bell-schedule[bhs]`), or keep the two fully
   independent like the npm packages? (Currently independent.)
2. **Java ports** of both `bells` and `bhs-calendars` to Maven Central —
   deferred.
</content>
</invoke>

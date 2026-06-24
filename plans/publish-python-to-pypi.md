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

Decision needed from you: **which distribution name to register** (leaning
`bell-schedule`). The rest of this plan assumes a placeholder `<DIST_NAME>`.

## 1. Create PyPI account(s)

- Create an account on https://pypi.org if you don't have one.
- Strongly recommended: also create an account on https://test.pypi.org (a
  separate account/registration) for a dry-run publish before going live.
- Enable 2FA on both (required by PyPI for uploads).

## 2. Tidy up `pyproject.toml` for a real release

Current file is minimal but functional. Before publishing, fill in metadata
that makes the PyPI project page useful and the package installable cleanly:

- `name = "<DIST_NAME>"` — the chosen available name from step 0.
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

From `libs/python/`:

```bash
python3 -m pip install --upgrade build twine
python3 -m build            # produces dist/<DIST_NAME>-0.5.0-py3-none-any.whl + .tar.gz
python3 -m twine check dist/*   # validates metadata + README rendering
```

Confirm the wheel contains the `bells/` package and the `bells-validate` entry
point, and that `dist/` is gitignored (it is — see `libs/python/.gitignore`).

Optional sanity check in a fresh virtualenv:

```bash
python3 -m venv /tmp/pypi-test && /tmp/pypi-test/bin/pip install dist/*.whl
/tmp/pypi-test/bin/bells-validate --help
/tmp/pypi-test/bin/python -c "import bells; print(bells.__file__)"
```

## 4. (Recommended) Dry-run upload to TestPyPI

Configure a Trusted Publisher on TestPyPI (same steps as 5 below, on the
test.pypi.org pending-publisher page), or use a temporary API token, then:

```bash
python3 -m twine upload --repository testpypi dist/*
pip install --index-url https://test.pypi.org/simple/ --no-deps <DIST_NAME>
```

This catches name/metadata/rendering problems without burning the real name.

## 5. Set up PyPI Trusted Publisher (OIDC) — no API token needed

This mirrors the npm Trusted Publisher setup already in use. On PyPI:

1. Go to your PyPI account → **Publishing** → **Add a pending publisher**
   (works even before the project exists — it's created on first upload).
2. Fill in:
   - **PyPI Project Name**: `<DIST_NAME>`
   - **Owner**: `gigamonkeys`
   - **Repository name**: `bells`
   - **Workflow name**: `publish-python.yml` (must match the file in step 6)
   - **Environment name**: optional but recommended, e.g. `pypi` (then also add
     a matching `environment:` to the workflow job).

No secrets are stored in GitHub; the workflow authenticates via OIDC.

## 6. Add the GitHub Actions workflow

Create `.github/workflows/publish-python.yml`, modeled on the existing
`publish.yml` (npm) but using PyPI's publish action. Key differences from the
npm workflow:

- The repo already uses tag-triggered publishing (`tags: ['v*']`) for npm. A
  single `v*` tag can't cleanly distinguish "publish npm" vs "publish PyPI". Two
  options — **decide which**:
  - **(a) Separate tag prefix** for Python, e.g. `py-v*`, so the two publish
    workflows don't both fire on one tag. Simple, explicit.
  - **(b) Shared `v*` tag** that publishes *both* npm and PyPI together, keeping
    versions in lockstep. Requires the TS and Python versions to match per
    release.

  Pick one; the example below uses `py-v*` (option a).

```yaml
name: Publish Python to PyPI

on:
  push:
    tags:
      - 'py-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: pypi          # only if you set an environment in step 5
    permissions:
      contents: read
      id-token: write          # required for OIDC Trusted Publishing
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v5
        with:
          python-version: '3.x'
      - name: Install build deps
        run: python -m pip install --upgrade build
      - name: Run tests
        working-directory: libs/python
        run: |
          python -m pip install -e '.[test]'
          python -m pytest
      - name: Build
        working-directory: libs/python
        run: python -m build
      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: libs/python/dist
```

Notes:

- `pypa/gh-action-pypi-publish` auto-detects the OIDC token; no `password:`/
  token input needed when Trusted Publishing is configured.
- The test step keeps the Python publish consistent with the npm workflow, which
  runs `npm test` before publishing. The golden tests run as part of pytest, so
  this also guards cross-port behavior parity.

## 7. Release process (per version going forward)

1. Bump `version` in `libs/python/pyproject.toml`.
2. Commit on `main`.
3. Tag and push: `git tag py-v0.5.0 && git push origin py-v0.5.0`
   (or `v*` if you chose option b in step 6).
4. Watch the Actions run; confirm the new version appears at
   `https://pypi.org/project/<DIST_NAME>/`.

## 8. Follow-ups / housekeeping

- Update `CLAUDE.md` and/or `libs/python/README.md` with the published
  `pip install <DIST_NAME>` instructions and the release/tagging convention.
- Consider whether the TS, Python, and (eventually) Java versions should be kept
  in lockstep, and document that choice.
- If you went with option (b) shared tags, update the existing npm `publish.yml`
  docs/notes so future-you remembers one tag fans out to both registries.

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
- Give it its own version line (it already diverges from the library on npm) and
  its own tag prefix / publish workflow, e.g. `cal-py-v*`, set up with a PyPI
  Trusted Publisher exactly like steps 5–6 above.
- Decide whether to ship a thin re-export from `bells` (e.g. `bells` lists
  `bhs-calendars` as an optional/extra dependency) so `pip install bells[bhs]`
  gets both — or keep them fully independent like the npm packages.

## Open questions for you

1. **Distribution name** on PyPI (`bells` is taken) — `bell-schedule` or
   `school-bells` are the front-runners; see step 0.
2. **Tag strategy**: separate `py-v*` tag, or shared `v*` that publishes npm +
   PyPI together (step 6).
3. **First version**: publish as `0.5.0` to match the current TS line, or start
   the Python package at its own `0.1.0`?
4. **Calendar data package** (section 9): publish `bhs-calendars` to PyPI as a
   separate package now, or defer? If yes, confirm the flat-array loader design
   and whether `bells` should offer it as an optional extra.
</content>
</invoke>

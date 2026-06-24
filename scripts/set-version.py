#!/usr/bin/env python3
"""Propagate a concrete version across the language ports of one library.

The three ports of each library are kept in lockstep. The npm/TypeScript port is
bumped with `npm version` (which computes the new number from major|minor|patch);
this script writes that resulting concrete version into the Python and Java ports,
which have no npm tooling of their own. The Makefile `release-*` targets call it.

The two libraries version independently of each other:

    set-version.py lib       <version>   # bells: Python pyproject + Java pom,
                                          #   and the bells dependency ref in the
                                          #   Java bhs-calendars pom.
    set-version.py calendars <version>   # bhs-calendars: Python pyproject +
                                          #   Java bhs-calendars pom.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def set_pyproject_version(path: Path, version: str) -> None:
    """Rewrite the single `version = "..."` line under [project]."""
    text = path.read_text()
    new, n = re.subn(r'(?m)^version = "[^"]*"', f'version = "{version}"', text)
    if n != 1:
        sys.exit(f"{path}: expected exactly one project version line, found {n}")
    path.write_text(new)


def set_pom_project_version(path: Path, artifact_id: str, version: str) -> None:
    """Rewrite the <version> that immediately follows the project's <artifactId>.

    Anchoring to the artifactId avoids touching plugin or dependency versions.
    """
    pattern = re.compile(
        r"(<artifactId>" + re.escape(artifact_id) + r"</artifactId>\s*<version>)[^<]*(</version>)"
    )
    text = path.read_text()
    new, n = pattern.subn(r"\g<1>" + version + r"\g<2>", text, count=1)
    if n != 1:
        sys.exit(f"{path}: could not find project <version> for artifact {artifact_id!r}")
    path.write_text(new)


def set_pom_property(path: Path, prop: str, version: str) -> None:
    """Rewrite a <prop>...</prop> Maven property value."""
    pattern = re.compile(r"(<" + re.escape(prop) + r">)[^<]*(</" + re.escape(prop) + r">)")
    text = path.read_text()
    new, n = pattern.subn(r"\g<1>" + version + r"\g<2>", text, count=1)
    if n != 1:
        sys.exit(f"{path}: could not find <{prop}> property")
    path.write_text(new)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    component, version = sys.argv[1], sys.argv[2]

    if component == "lib":
        set_pyproject_version(ROOT / "libs/python/pyproject.toml", version)
        set_pom_project_version(ROOT / "libs/java/pom.xml", "bells", version)
        # The Java bhs-calendars artifact depends on bells; track the latest.
        set_pom_property(ROOT / "libs/java-bhs-calendars/pom.xml", "bells.version", version)
    elif component == "calendars":
        set_pyproject_version(ROOT / "libs/python-calendars/pyproject.toml", version)
        set_pom_project_version(ROOT / "libs/java-bhs-calendars/pom.xml", "bhs-calendars", version)
    else:
        sys.exit(f"unknown component {component!r} (expected 'lib' or 'calendars')")

    print(f"set {component} version -> {version}")


if __name__ == "__main__":
    main()

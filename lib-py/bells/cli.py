"""CLI entry point for validating calendar JSON files.

Usage: bells-validate <file.json> [file2.json ...]

Python counterpart of ``src/bin/validate.js``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .validate import validate_calendar_data


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    if not argv:
        print("Usage: bells-validate <calendar.json> [file2.json ...]", file=sys.stderr)
        return 1

    any_errors = False

    for file_path in argv:
        try:
            data = json.loads(Path(file_path).read_text(encoding="utf-8"))
        except Exception as err:  # noqa: BLE001 - mirror JS catch-all
            print(f"Error reading {file_path}: {err}", file=sys.stderr)
            any_errors = True
            continue

        result = validate_calendar_data(data)
        valid = result["valid"]
        errors = result["errors"]
        warnings = result["warnings"]

        if valid and not warnings:
            print(f"{file_path}: valid")
        elif valid:
            plural = "" if len(warnings) == 1 else "s"
            print(f"{file_path}: valid ({len(warnings)} warning{plural})")
        else:
            any_errors = True
            plural = "" if len(errors) == 1 else "s"
            print(f"{file_path}: Found {len(errors)} error{plural}:", file=sys.stderr)
            for err in errors:
                print(f"  - {err}", file=sys.stderr)
        for w in warnings:
            print(f"  warning: {w}", file=sys.stderr)

    return 1 if any_errors else 0


if __name__ == "__main__":
    sys.exit(main())

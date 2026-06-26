# DONE

## 2026-06

- [x] Publish the Python port to PyPI as `bell-schedule`, and the bundled calendar
  data as `bhs-calendars`, via OIDC Trusted Publishing — npm and PyPI kept in
  version lockstep. (Java/Maven Central publishing deferred.) (plan:
  [publish-python-to-pypi](plans/done/publish-python-to-pypi.md))

- [x] Abstract-time API for `@peterseibel/bells`. (plan:
  [bells-abstract-times](plans/done/bells-abstract-times.md))

- [x] Multiple-calendar support. (plan:
  [multiple-calendars](plans/done/multiple-calendars.md))

- [x] Alarms. (plan: [alarms](plans/done/alarms.md))

- [x] Background alarms (Chromium / Chromebox). (plan:
  [background-alarms](plans/done/background-alarms.md))

## Before 2026-03-

- [x] Do the thing described in plans/library.md. (plan: [library-plan](plans/library-plan.md))

- [x] Implement [library-plan](plans/library-plan.md)

- [x] Publish lib to npm as version 0.0.1.

- [x] Rewrite web app to use library.

- [x] Clean up code that was replaced by library.

- [x] Convert calendars.json into a separate calendars/ directory with one file per year in the @peterseibel/bells format.

- [x] Create a node server that serves a web API that provides a REST API equivalent to the @peterseibel/bells API. The server will be deployed with calendar files.

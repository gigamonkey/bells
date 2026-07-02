# Routine JSON format

A routine is a named plan for how class time is spent: an ordered list of
labeled segments (Do Now, work time, wrap up, …) scoped to one or more
periods by name. When a scoped period is in progress, timer mode shows the
current segment, its countdown, and a chime at each segment change.

Besides configuring a routine in the editor UI, you can paste a JSON blob:
in timer mode tap **Routines… → Add routine → Paste JSON…**, paste, and tap
**Load**. The parsed routine fills the editor fields so you can review or
tweak it before hitting **Save**.

## Example

```json
{
  "name": "Block lesson",
  "periods": ["Period 1", "Period 3"],
  "chime": true,
  "segments": [
    { "label": "Do Now", "minutes": 10, "color": "#4000ff" },
    { "label": "Mini-lesson", "minutes": 15 },
    { "label": "Group work", "elastic": true },
    { "label": "Exit ticket", "minutes": 10, "from": "end" }
  ]
}
```

In a 90-minute period this yields: Do Now 9:00–9:10, Mini-lesson 9:10–9:25,
Group work 9:25–10:20, Exit ticket 10:20–10:30. In a 55-minute occurrence of
the same period, Group work shrinks to 20 minutes and everything else stays
the same size.

## Top-level fields

- `name` (string, required) — the routine's display name.

- `periods` (array of strings, optional; default `[]`) — the period names
  the routine applies to, exactly as they appear in the schedule (e.g.
  `"Period 3"`). A routine with no periods never runs, but you can also
  check periods in the editor after loading.

- `chime` (boolean, optional; default `true`) — whether to chime at segment
  changes.

- `segments` (array of segment objects, required, at least one) — the plan,
  in the order the segments happen.

## Segment fields

- `label` (string, required) — shown big while the segment is active.

- `minutes` (positive number, required unless `elastic`) — the segment's
  length. Fractions are allowed (`7.5` is seven and a half minutes).

- `elastic` (boolean, optional) — `true` marks the one segment that absorbs
  whatever time the fixed segments leave over, stretching or shrinking with
  the period. When set, `minutes` and `from` are ignored.

- `from` (`"start"` or `"end"`, optional; default `"start"`) — which end of
  the period the segment is anchored to. `"start"` segments tile forward
  from the period start; `"end"` segments tile backward from the period end
  so they hold their length even when the period runs short.

- `color` (string, optional) — a six-digit hex color like `"#008040"`, used
  as the background tint while the segment is active. Segments without a
  color get one from a default palette.

## Ordering rule

Segments must be listed in the order they happen: zero or more `"from":
"start"` segments, then at most one elastic segment, then zero or more
`"from": "end"` segments. The paste-in parser enforces this and reports a
message telling you which segment is out of place.

## Notes

- Segment boundaries are resolved against each concrete occurrence of a
  period, then clamped into it; if a period is too short for the fixed
  segments, later ones collapse to zero length rather than spilling over.

- Imported routines are enabled by default; toggle them with the checkbox
  in the Routines list. Internal ids are generated on import.

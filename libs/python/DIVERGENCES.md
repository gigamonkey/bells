# Divergences from the JavaScript library

This Python port aims to be behaviorally identical to the JavaScript
[`@peterseibel/bells`](../ts) library. This file records any places where it
intentionally differs. Each entry should eventually be reconciled — either by
backporting the change to the JS library or by reverting it here.

## None currently

There are no known intentional behavioral divergences. (The previous entry —
`is_school_day()` deriving "today" in the calendar's timezone rather than the
system-local timezone — has been reconciled: all three ports now default
"today" to the system-local date and accept an optional timezone argument to
anchor the rollover to a specific zone, e.g. the school's, when the process
runs elsewhere.)

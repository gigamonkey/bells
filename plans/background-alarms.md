# Background alarms (Chromium / Chromebox)

Follow-up to [alarms.md](alarms.md). The initial implementation only fires while
the tab is visible. The target use case is a teacher with the app pinned on a
Chromebox: Chrome is always running, but the display may be on another input
or another window. We want alarms to fire reliably in that state.

Scope: **Chromium desktop only** (which includes ChromeOS). Feature-detect and
fall back to today's foreground-only path on Safari / Firefox.

## Mechanism

Use the **Notification Triggers API**: the service worker schedules
OS-level notifications in advance with
`registration.showNotification(title, { showTrigger: new TimestampTrigger(ts), ... })`.
The OS fires them on time regardless of whether the Chrome window is focused,
backgrounded, or minimized, and plays a sound of its own. No server, no push
subscription.

Feature test at startup:
```js
'Notification' in window
  && 'showTrigger' in Notification.prototype
  && 'serviceWorker' in navigator
```

## Division of labor

- **Foreground (existing `alarms.js`)** — continues to render the in-page
  banner + repeating Web Audio chime when the page is visible. This remains
  the richer UX: the animated banner, the 15s-repeat chime, the × button.
- **Service worker (new code in [sw.js](sw.js))** — owns scheduled
  notifications. One notification per upcoming firing. On click, focuses/opens
  the app tab and passes enough context for the page to show its banner.

Only one of the two actually fires audibly per alarm. The notification is
scheduled unconditionally; when the foreground handler fires first, it posts
a message to the SW (`{type:'alarm-fired', key}`) and the SW calls
`getNotifications({tag:key})` then `notification.close()` on any still-pending
match. In practice `TimestampTrigger` fires within a few seconds of the
target, so the foreground tick (running every 1s) will usually beat it when
the tab is visible; the dedup only matters in edge cases.

## Reconciliation

Scheduled notifications live in the browser until they fire or are cancelled.
We need to keep them in sync with the user's alarm config and today's
schedule. A **reconcile** pass:

1. Compute today's firings via the same `computeFirings(date, bellSchedule)`
   used by the tick loop — except we want ones in the future relative to
   `now + small slop`.
2. `getNotifications()` on the SW registration, filter by tag prefix
   `alarm:`, compare against the computed set.
3. Cancel (`notification.close()`) any scheduled notification whose key is no
   longer in the set.
4. Schedule any computed firing that doesn't already have a matching
   notification.

Tag format: `alarm:<alarmId>:<dateStr>:<fireAtMillis>` — stable, easy to diff.

Reconcile triggers:
- App start (after SW is ready).
- Alarm add / edit / delete / enable-toggle in `alarms.js`.
- Date rollover. The simplest hook: the existing 24-hour auto-reload at
  [bells.js:627](bells.js:627) already guarantees a fresh start each day, so
  day rollover is covered implicitly. Still, reconcile whenever
  `tickAlarms` notices `dateStr` changed, as a belt-and-suspenders measure.
- Teacher mode toggle — cancel everything when leaving teacher mode.

How many to schedule ahead? Start with "today's remaining firings." No reason
to schedule into tomorrow eagerly; the 24h reload will cover it. If that
reload is ever removed, extend to ~48 hours.

## What happens when a notification fires

The notification itself is the audible/visual signal on the OS. When the user
clicks it, the SW's `notificationclick` handler:
1. Calls `clients.matchAll({type:'window', includeUncontrolled:true})`.
2. If an app client exists, `focus()` it and `postMessage` so `alarms.js`
   can render the in-page banner (nice-to-have continuity).
3. If not, `openWindow('/')`.

Notification options worth setting:
- `tag` — the key above; per-alarm so close-on-fire works cleanly.
- `requireInteraction: true` — keeps it on screen until the teacher
  dismisses, matching the "repeat chime until closed" behavior.
- `silent: false` and default sound — Notification Triggers uses the OS's
  notification sound; we don't get to pick the two-note chime here. That's
  an accepted loss for the background path.
- `body` — the alarm spec string (reuse `describeAlarm`).

## Permission flow

Ask for notification permission lazily the first time a user **saves** an
alarm in teacher mode, not on page load. If denied, show an inline note in
the alarm popup ("Background alarms disabled — grant notification
permission for alarms to fire when the window isn't visible"). Foreground
alarms keep working regardless.

## Build / bundling notes

`alarms.js` is currently bundled into `out.js`. The SW is a separate file
(see [sw.js.template](sw.js.template)-ish setup in the Makefile). The
scheduling API (`registration.showNotification` with `showTrigger`) is only
usable from the SW **or** from page code that holds a `ServiceWorkerRegistration`
— the latter works and is simpler. So: schedule from `alarms.js` via
`navigator.serviceWorker.ready.then(reg => reg.showNotification(...))`. The
SW only needs new logic for:
- `notificationclick` handler.
- A `message` handler that closes notifications by tag when the foreground
  fires first.

No new build-time wiring beyond what's already in place.

## Out of scope

- iOS / Safari support (would need server-side Web Push; covered in the
  earlier discussion and not warranted for the Chromebox use case).
- Firefox (no Notification Triggers).
- Custom notification sounds — not supported by the API.
- Snooze / actions on the notification. `actions` are supported but add UX
  complexity; skip for v1.

## Rollout order

1. Feature detect + permission request plumbing.
2. `scheduleAlarmNotification` / `cancelAlarmNotification` helpers in
   `alarms.js`.
3. Reconciliation: initial pass on load, on edit, on tick date-change.
4. `notificationclick` handler in `sw.js`.
5. Foreground-fires-first dedup via `postMessage` → SW → `notification.close()`.
6. Inline permission-status note in the alarm popup.

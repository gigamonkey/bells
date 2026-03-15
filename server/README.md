# Bells API Server

A REST API server wrapping the [@peterseibel/bells](https://www.npmjs.com/package/@peterseibel/bells) library to expose Berkeley High School bell schedule data over HTTP.

## Running

```bash
npm install
node index.js
```

The server listens on port 3000 by default.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `CALENDARS_PATH` | `./calendars/` (or `../calendars/`) | Path to directory containing per-year calendar JSON files |

## Endpoints

All endpoints accept the following query parameters:

| Parameter | Values | Default | Description |
|---|---|---|---|
| `role` | `student`, `teacher` | `student` | Which schedule to use |
| `includeTags` | `zero`, `seventh`, `ext` | _(none)_ | Optional periods to include, comma-separated |
| `time` | ISO 8601 instant | now | Override the current time (useful for testing) |

---

### `GET /api/current`

Returns the current interval — the period, passing time, break, or before/after-school window that is active right now.

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `interval` | object \| null | The current interval, or `null` if outside any tracked interval |
| `interval.name` | string | e.g. `"Period 3"`, `"Lunch"`, `"Passing to Period 4"`, `"Winter Break!"` |
| `interval.type` | string | `period`, `passing`, `before-school`, `after-school`, or `break` |
| `interval.start` | string | ISO 8601 instant |
| `interval.end` | string | ISO 8601 instant |
| `interval.secondsLeft` | number | Seconds until the interval ends |
| `interval.secondsDone` | number | Seconds since the interval started |
| `interval.duringSchool` | boolean | `true` if this interval falls within school hours |
| `interval.tags` | string[] | Period tags, e.g. `["optional", "zero"]` |

**Example:**

```
GET /api/current
```

```json
{
  "interval": {
    "name": "Period 3",
    "type": "period",
    "start": "2026-03-17T17:43:00Z",
    "end": "2026-03-17T18:41:00Z",
    "secondsLeft": 1740,
    "secondsDone": 1140,
    "duringSchool": true,
    "tags": []
  }
}
```

**Example (during a break):**

```
GET /api/current
```

```json
{
  "interval": {
    "name": "Long weekend!",
    "type": "break",
    "start": "2026-03-13T22:33:00Z",
    "end": "2026-03-17T14:26:00Z",
    "secondsLeft": 142608,
    "secondsDone": 173772,
    "duringSchool": false,
    "tags": []
  }
}
```

---

### `GET /api/schedule`

Returns the list of periods for the current school day (or the next school day if school is not in session today).

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `periods` | object[] | Ordered list of periods for the day |
| `periods[].name` | string | e.g. `"Period 1"`, `"Lunch"` |
| `periods[].start` | string | ISO 8601 instant |
| `periods[].end` | string | ISO 8601 instant |
| `periods[].tags` | string[] | e.g. `["optional", "zero"]` |

**Example:**

```
GET /api/schedule
```

```json
{
  "periods": [
    { "name": "Period 1", "start": "2026-03-17T15:30:00Z", "end": "2026-03-17T16:28:00Z", "tags": [] },
    { "name": "Period 2", "start": "2026-03-17T16:34:00Z", "end": "2026-03-17T17:37:00Z", "tags": [] },
    { "name": "Period 3", "start": "2026-03-17T17:43:00Z", "end": "2026-03-17T18:41:00Z", "tags": [] },
    { "name": "Lunch",    "start": "2026-03-17T18:41:00Z", "end": "2026-03-17T19:21:00Z", "tags": [] },
    { "name": "Period 4", "start": "2026-03-17T19:27:00Z", "end": "2026-03-17T20:25:00Z", "tags": [] },
    { "name": "Period 5", "start": "2026-03-17T20:31:00Z", "end": "2026-03-17T21:29:00Z", "tags": [] },
    { "name": "Period 6", "start": "2026-03-17T21:35:00Z", "end": "2026-03-17T22:33:00Z", "tags": [] }
  ]
}
```

**Example with optional periods:**

```
GET /api/schedule?includeTags=zero,seventh
```

```json
{
  "periods": [
    { "name": "Period 0", "start": "2026-03-17T14:26:00Z", "end": "2026-03-17T15:24:00Z", "tags": ["optional", "zero"] },
    { "name": "Period 1", "start": "2026-03-17T15:30:00Z", "end": "2026-03-17T16:28:00Z", "tags": [] },
    ...
  ]
}
```

---

### `GET /api/status`

Returns a comprehensive snapshot: current interval, today's school day bounds, and year-level counters.

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `interval` | object \| null | Current interval (same shape as `/api/current`) |
| `dayBounds` | object \| null | School day start/end, or `null` if not a school day |
| `dayBounds.start` | string | ISO 8601 instant — first bell of the day |
| `dayBounds.end` | string | ISO 8601 instant — last bell of the day |
| `schoolDaysLeft` | number | School days remaining in the year (including today if in progress) |
| `calendarDaysLeft` | number | Calendar days until the last day of school |
| `schoolTimeLeftSeconds` | number | School instruction time remaining in the year, in seconds |
| `schoolTimeDoneSeconds` | number | School instruction time elapsed so far, in seconds |
| `totalSchoolTimeSeconds` | number | Total school instruction time for the year, in seconds |

**Example:**

```
GET /api/status
```

```json
{
  "interval": {
    "name": "Period 3",
    "type": "period",
    "start": "2026-03-17T17:43:00Z",
    "end": "2026-03-17T18:41:00Z",
    "secondsLeft": 1740,
    "secondsDone": 1140,
    "duringSchool": true,
    "tags": []
  },
  "dayBounds": {
    "start": "2026-03-17T15:30:00Z",
    "end": "2026-03-17T22:33:00Z"
  },
  "schoolDaysLeft": 51,
  "calendarDaysLeft": 82,
  "schoolTimeLeftSeconds": 1407060,
  "schoolTimeDoneSeconds": 3552480,
  "totalSchoolTimeSeconds": 4959540
}
```

---

## Testing with a time override

All endpoints accept a `time` query parameter to simulate a specific moment, which is useful for testing without waiting for the real clock.

```
GET /api/current?time=2026-03-17T10:30:00-07:00
GET /api/status?time=2026-03-17T10:30:00-07:00&role=teacher
GET /api/schedule?time=2026-03-17T10:30:00-07:00&includeTags=zero
```

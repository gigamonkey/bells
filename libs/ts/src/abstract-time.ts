/**
 * Abstract times: moments described relative to the school schedule ("five
 * minutes before the end of the period", "start of school next Monday")
 * rather than as wall-clock times.
 *
 * An abstract time has three independent parts: a day spec (which date,
 * possibly relative to a base date), a time anchor (a schedule-defined point
 * in that day), and a signed HH:MM offset. Resolution happens in two phases:
 * day binding (BellSchedule.bindTime, producing a BoundTime) and time
 * resolution (BellSchedule.resolveTime, supplying the period if the anchor
 * needs one).
 *
 * This module holds the types and the string syntax (parseTime/formatTime);
 * everything that needs a calendar lives on BellSchedule.
 */

/** Schedule-defined points in a day. */
export type TimeAnchor =
  | 'start_of_period'
  | 'end_of_period'
  | 'start_of_day'
  | 'end_of_day'
  | 'midnight';

/** Which day, possibly relative to a base date supplied at bind time. */
export type DaySpec =
  | { type: 'date'; date: string }        // absolute ISO date
  | { type: 'schoolDays'; n: number }     // n school days from base
  | { type: 'weeks'; n: number }          // n calendar weeks from base
  | { type: 'weekday'; weekday: number }  // next <weekday>, ISO 1=Mon..7=Sun
  | { type: 'week'; edge: 'start' | 'end'; n: number };
    // first/last school day of the week n weeks from the base date's week
    // (n = 0: this week, n = 1: next week)

/** A fully abstract time, before day binding. */
export interface AbstractTime {
  day?: DaySpec;       // omitted = the base date
  anchor: TimeAnchor;
  offset?: string;     // '[-+]HH:MM', default '+00:00'
}

/** After day binding. Period (if the anchor needs one) still unbound. */
export interface BoundTime {
  date: string;        // ISO date
  anchor: TimeAnchor;
  offset: string;
}

const ANCHORS: TimeAnchor[] = [
  'start_of_period',
  'end_of_period',
  'start_of_day',
  'end_of_day',
  'midnight',
];

const WEEKDAY_NUMBERS: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7,
};

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday',
};

/**
 * Parse an '[-+]HH:MM' offset into signed minutes. The sign is optional here
 * (stored offsets may be unsigned, e.g. '00:00'); the string syntax requires
 * it so an offset token is unambiguous.
 */
export const parseOffsetMinutes = (offset: string): number => {
  const m = /^([+-]?)(\d{1,2}):(\d{2})$/.exec(offset);
  if (m) {
    const minutes = Number(m[3]);
    if (minutes <= 59) {
      const total = Number(m[2]) * 60 + minutes;
      return m[1] === '-' ? -total : total;
    }
  }
  throw new Error(`Invalid time offset "${offset}"`);
};

const formatOffset = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `${sign}${h}:${m}`;
};

/** A signed time-offset token: the string syntax requires the sign. */
const OFFSET_TOKEN = /^[+-]\d{1,2}:\d{2}$/;

const parseDayPart = (tokens: string[]): DaySpec => {
  const bad = () => new Error(`Unrecognized day part "${tokens.join(' ')}"`);

  if (tokens.length === 1) {
    const tok = tokens[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) {
      try {
        Temporal.PlainDate.from(tok);
      } catch {
        throw new Error(`Invalid date "${tok}"`);
      }
      return { type: 'date', date: tok };
    }
    if (tok in WEEKDAY_NUMBERS) {
      return { type: 'weekday', weekday: WEEKDAY_NUMBERS[tok] };
    }
    throw bad();
  }

  if (tokens.length === 2) {
    if (tokens[0] === 'next' && tokens[1] === 'week') {
      return { type: 'week', edge: 'start', n: 1 };
    }
    const m = /^([+-])(\d+)$/.exec(tokens[0]);
    if (m) {
      const n = Number(tokens[0]);
      if (tokens[1] === 'day' || tokens[1] === 'days') return { type: 'schoolDays', n };
      if (tokens[1] === 'week' || tokens[1] === 'weeks') return { type: 'weeks', n };
    }
    throw bad();
  }

  if ((tokens[0] === 'start' || tokens[0] === 'end') && tokens[1] === 'of') {
    if (tokens.length === 3 && tokens[2] === 'week') {
      return { type: 'week', edge: tokens[0], n: 0 };
    }
    if (tokens.length === 4 && tokens[2] === 'next' && tokens[3] === 'week') {
      return { type: 'week', edge: tokens[0], n: 1 };
    }
  }

  throw bad();
};

/**
 * Parse the compact one-line syntax: `anchor [time-offset] [day-part]`,
 * whitespace-separated, case-insensitive. E.g. 'end_of_period -00:05',
 * 'start_of_day next week', 'end_of_day +1 day'. Throws on unknown anchors,
 * malformed offsets, and unrecognized day parts.
 */
export const parseTime = (spec: string): AbstractTime => {
  const tokens = spec.trim().toLowerCase().split(/\s+/);
  if (tokens.length === 1 && tokens[0] === '') {
    throw new Error('Empty abstract-time spec');
  }

  const anchor = tokens.shift() as string;
  if (!(ANCHORS as string[]).includes(anchor)) {
    throw new Error(`Unknown anchor "${anchor}"`);
  }

  const t: AbstractTime = { anchor: anchor as TimeAnchor };

  if (tokens.length > 0 && OFFSET_TOKEN.test(tokens[0])) {
    const offset = tokens.shift() as string;
    parseOffsetMinutes(offset); // validate (e.g. minutes <= 59)
    t.offset = offset;
  }

  if (tokens.length > 0) {
    t.day = parseDayPart(tokens);
  }

  return t;
};

const formatDayPart = (day: DaySpec): string => {
  switch (day.type) {
    case 'date':
      return day.date;
    case 'schoolDays':
    case 'weeks': {
      if (!Number.isInteger(day.n)) {
        throw new Error(`Cannot format non-integer day spec ${day.n}`);
      }
      const abs = Math.abs(day.n);
      const unit = day.type === 'schoolDays' ? 'day' : 'week';
      return `${day.n < 0 ? '-' : '+'}${abs} ${unit}${abs === 1 ? '' : 's'}`;
    }
    case 'weekday': {
      const name = WEEKDAY_NAMES[day.weekday];
      if (!name) throw new Error(`Invalid weekday ${day.weekday} (must be 1=Monday..7=Sunday)`);
      return name;
    }
    case 'week': {
      if (day.n === 0) return `${day.edge} of week`;
      if (day.n === 1) return `${day.edge} of next week`;
      throw new Error(`Cannot format week spec with n=${day.n} (string syntax covers n=0 and n=1)`);
    }
  }
};

/** Canonical string form of an AbstractTime; round-trips through parseTime. */
export const formatTime = (t: AbstractTime): string => {
  if (!ANCHORS.includes(t.anchor)) {
    throw new Error(`Unknown anchor "${t.anchor}"`);
  }
  const parts: string[] = [t.anchor];
  const offset = parseOffsetMinutes(t.offset ?? '+00:00');
  if (offset !== 0) parts.push(formatOffset(offset));
  if (t.day) parts.push(formatDayPart(t.day));
  return parts.join(' ');
};

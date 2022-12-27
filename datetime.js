const datestring = (t) => {
  return t.getFullYear() + '-' + xx(t.getMonth() + 1) + '-' + xx(t.getDate());
};

const timestring = (t) => {
  return oneToTwelve(t.getHours()) + ':' + xx(t.getMinutes());
};

const hhmmss = (millis) => {
  const seconds = Math.round(millis / 1000);
  const minutes = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const mm = minutes % 60;
  const hh = Math.floor(minutes / 60);
  return xx(hh) + ':' + xx(mm) + ':' + xx(ss);
};

const ddhhmmss = (millis) => {
  const seconds = Math.floor(millis / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const ss = seconds % 60;
  const mm = minutes % 60;
  const hh = hours % 24;
  const dd = Math.floor(hours / 24);
  return [dd, hh, mm, ss];
};

const oneToTwelve = (h) => {
  // Render 12 as 12, not 0 as a simple h % 12 would.
  return ((h + 11) % 12) + 1;
};

/*
 * Parse a simple date string into a Date object.
 */
const parseDate = (x) => {
  const [year, month, date] = x.split('-').map(Number);
  return new Date(year, month - 1, date, 12, 0, 0, 0);
};

/*
 * Parse a time string into a Date object on the same day as the given date.
 */
const parseTime = (x, date) => {
  const [h, m] = x.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h);
  d.setMinutes(m);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
};

const xx = (n) => String(n).padStart(2, '0');

// Adapted from https://stackoverflow.com/a/17727953
const daysBetween = (start, end) => {
  // A day in UTC always lasts 24 hours (unlike in other time formats)
  const s = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const e = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());

  // so it's safe to divide by 24 hours
  return (s - e) / (1000 * 60 * 60 * 24);
};

const hours = (millis) => millis / (1000 * 60 * 60);

const noon = (date) => {
  const d = new Date(date);
  d.setHours(12);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
};

/*
 * Does the span of days from start to end (inclusive) include a Saturday or Sunday?
 */
const includesWeekend = (start, end) => {
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    if ([0, 6].includes(d.getDay())) {
      return true;
    }
  }
  return false;
};

export {
  datestring,
  daysBetween,
  ddhhmmss,
  hhmmss,
  hours,
  includesWeekend,
  noon,
  parseDate,
  parseTime,
  timestring,
};

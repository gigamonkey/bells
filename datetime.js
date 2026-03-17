const plural = (n, w) => (n === 1 ? w : `${w}s`);

const oneToTwelve = (h) => ((h + 11) % 12) + 1;

const xx = (n) => String(n).padStart(2, '0');

const timestring = (instant, timezone) => {
  const { hour, minute } = instant.toZonedDateTimeISO(timezone);
  return oneToTwelve(hour) + ':' + xx(minute);
};

const hhmmss = (duration) => {
  const { hours, minutes, seconds } = duration.round({ largestUnit: 'hours', smallestUnit: 'seconds' });
  return xx(hours) + ':' + xx(minutes) + ':' + xx(seconds);
};

const timeCountdown = (duration) => {
  const { hours: h, minutes: m, seconds: s } = duration.round({ largestUnit: 'hours', smallestUnit: 'seconds' });
  return `${h} ${plural(h, 'hour')} ${m} ${plural(m, 'minute')} ${s} ${plural(s, 'second')}`;
};

export { hhmmss, timestring, timeCountdown };

const plural = (n, w) => (n === 1 ? w : `${w}s`);

const oneToTwelve = (h) => ((h + 11) % 12) + 1;

const xx = (n) => String(n).padStart(2, '0');

const timestring = (instant, timezone) => {
  const { hour, minute } = instant.toZonedDateTimeISO(timezone);
  return oneToTwelve(hour) + ':' + xx(minute);
};

const hhmmss = (duration) => {
  const { hours, minutes, seconds } = duration.round({ largestUnit: 'hours', smallestUnit: 'seconds', roundingMode: 'trunc' });
  return xx(hours) + ':' + xx(minutes) + ':' + xx(seconds);
};

const timeCountdown = (duration) => {
  const { hours: h, minutes: m, seconds: s } = duration.round({ largestUnit: 'hours', smallestUnit: 'seconds', roundingMode: 'trunc' });
  const parts = [[h, 'hour'], [m, 'minute'], [s, 'second']];
  while (parts.length > 1 && parts[parts.length - 1][0] === 0) parts.pop();
  while (parts.length > 1 && parts[0][0] === 0) parts.shift();
  return parts.map(([n, w]) => `${n} ${plural(n, w)}`).join(' ');
};

export { hhmmss, timestring, timeCountdown };

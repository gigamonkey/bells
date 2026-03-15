const plural = (n, w) => {
  return n === 1 ? w : `${w}s`;
};

const timestring = (t) => {
  return oneToTwelve(t.getHours()) + ':' + xx(t.getMinutes());
};

const millisToHMS = (millis) => {
  const seconds = Math.round(millis / 1000);
  const minutes = Math.floor(seconds / 60);
  return [Math.floor(minutes / 60), minutes % 60, seconds % 60];
};

const hhmmss = (millis) => {
  const [h, m, s] = millisToHMS(millis);
  return xx(h) + ':' + xx(m) + ':' + xx(s);
};

const timeCountdown = (millis) => {
  const [h, m, s] = millisToHMS(millis);
  return `${h} ${plural(h, 'hour')} ${m} ${plural(m, 'minute')} ${s} ${plural(s, 'second')}`;
};

const oneToTwelve = (h) => {
  // Render 12 as 12, not 0 as a simple h % 12 would.
  return ((h + 11) % 12) + 1;
};

const xx = (n) => String(n).padStart(2, '0');

const hours = (millis) => millis / (1000 * 60 * 60);

export { hhmmss, hours, timestring, timeCountdown };

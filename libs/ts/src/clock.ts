/**
 * The library's notion of "now".
 *
 * By default this is just the real system clock. For debugging, consumers can
 * set a simulated current time (or a raw offset) via the public API below; the
 * offset is a fixed delta added to the live clock, so time keeps ticking
 * forward from the simulated moment rather than freezing.
 *
 * The offset is process-global: it affects every time-defaulting method in the
 * library. That makes it a debugging affordance, not something to rely on in a
 * concurrent multi-tenant server.
 */

let debugOffset: Temporal.Duration | null = null;

/** Internal: the library's current instant, offset-adjusted. */
export const now = (): Temporal.Instant => {
  const real = Temporal.Now.instant();
  return debugOffset ? real.add(debugOffset) : real;
};

/** Internal: the offset-adjusted local date in a timezone (defaults to system-local). */
export const today = (timeZone?: string): Temporal.PlainDate =>
  now().toZonedDateTimeISO(timeZone ?? Temporal.Now.timeZoneId()).toPlainDate();

/**
 * Debug: pretend "now" is `instant`. Time keeps ticking forward from there.
 * Equivalent to setting the offset to `instant - realNow`.
 */
export const setDebugTime = (instant: Temporal.Instant): void => {
  debugOffset = Temporal.Now.instant().until(instant);
};

/** Debug: set the offset added to the real clock directly. */
export const setDebugOffset = (offset: Temporal.Duration): void => {
  debugOffset = offset;
};

/** Debug: drop any simulated time and go back to the real clock. */
export const clearDebugTime = (): void => {
  debugOffset = null;
};

/** The current debug offset, or null if using the real clock. */
export const getDebugOffset = (): Temporal.Duration | null => debugOffset;

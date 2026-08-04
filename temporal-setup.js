// Ensure `Temporal` exists as a global before any module that uses it is
// evaluated. On runtimes with native Temporal this imports nothing; elsewhere
// the polyfill arrives as a separate chunk (see build.mjs) that only those
// browsers download. The top-level await means modules importing this file
// don't run until the global is in place.
if (!globalThis.Temporal) {
  await import('temporal-polyfill/global');
}

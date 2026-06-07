/**
 * Ambient declaration of the global `Temporal` namespace.
 *
 * The bells library does not import a Temporal implementation. Instead the
 * consumer installs one as a global (e.g. `globalThis.Temporal = Temporal`),
 * which lets callers supply the `@js-temporal/polyfill` peer dependency or, on
 * runtimes with native Temporal, use the built-in implementation. This file
 * gives that global both its value and its types by aliasing the polyfill's
 * `Temporal` namespace. Being a `.d.ts`, it emits no runtime code, so importing
 * the polyfill here never pulls it into the bundle.
 */
import { Temporal as TemporalNamespace } from '@js-temporal/polyfill';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export import Temporal = TemporalNamespace;
}

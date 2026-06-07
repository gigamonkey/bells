/**
 * Test setup: install Temporal as a global for all test files.
 * Import this as the very first import in each test file so that
 * the global is set before any src/ modules are evaluated.
 */
import { Temporal } from 'temporal-polyfill';
globalThis.Temporal = Temporal;

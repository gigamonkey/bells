#!/usr/bin/env node
/**
 * CLI entry point for validating calendar JSON files.
 * Usage: bells-validate <file.json> [file2.json ...]
 */

import { Temporal } from '@js-temporal/polyfill';
globalThis.Temporal = Temporal;
import { readFile } from 'node:fs/promises';
import { validateCalendarData } from '../validate.js';

const filePaths = process.argv.slice(2);

if (filePaths.length === 0) {
  console.error('Usage: bells-validate <calendar.json> [file2.json ...]');
  process.exit(1);
}

let anyErrors = false;

for (const filePath of filePaths) {
  let data;
  try {
    const text = await readFile(filePath, 'utf8');
    data = JSON.parse(text);
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}`);
    anyErrors = true;
    continue;
  }

  const { valid, errors, warnings } = validateCalendarData(data);

  if (valid && warnings.length === 0) {
    console.log(`${filePath}: valid`);
  } else if (valid) {
    console.log(`${filePath}: valid (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`);
  } else {
    anyErrors = true;
    console.error(`${filePath}: Found ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
  }
  for (const w of warnings) {
    console.warn(`  warning: ${w}`);
  }
}

process.exit(anyErrors ? 1 : 0);

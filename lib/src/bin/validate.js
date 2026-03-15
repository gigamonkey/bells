#!/usr/bin/env node
/**
 * CLI entry point for validating calendar JSON files.
 * Usage: bells-validate <file.json>
 */

import { readFile } from 'node:fs/promises';
import { validateCalendarData } from '../validate.js';

const [,, filePath] = process.argv;

if (!filePath) {
  console.error('Usage: bells-validate <calendar.json>');
  process.exit(1);
}

let data;
try {
  const text = await readFile(filePath, 'utf8');
  data = JSON.parse(text);
} catch (err) {
  console.error(`Error reading file: ${err.message}`);
  process.exit(1);
}

const { valid, errors } = validateCalendarData(data);

if (valid) {
  console.log('Calendar data is valid.');
  process.exit(0);
} else {
  console.error(`Found ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

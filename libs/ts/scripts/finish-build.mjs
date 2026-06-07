/**
 * Post-`tsc` build step.
 *
 * The library references a consumer-supplied global `Temporal` (see
 * src/temporal-global.d.ts). `tsc` neither copies that ambient declaration into
 * `dist/` nor preserves a reference to it in the generated entry declarations,
 * so we do both here: copy the ambient file and prepend a triple-slash
 * reference to each public `.d.ts` entry point so consumers resolve the global.
 */
import { readFile, writeFile, copyFile } from 'node:fs/promises';

const REFERENCE = '/// <reference path="./temporal-global.d.ts" />\n';
const ENTRY_DECLARATIONS = ['index.d.ts', 'calendars.d.ts', 'validate.d.ts'];

await copyFile('src/temporal-global.d.ts', 'dist/temporal-global.d.ts');

for (const name of ENTRY_DECLARATIONS) {
  const path = `dist/${name}`;
  const content = await readFile(path, 'utf8');
  if (!content.startsWith(REFERENCE)) {
    await writeFile(path, REFERENCE + content);
  }
}

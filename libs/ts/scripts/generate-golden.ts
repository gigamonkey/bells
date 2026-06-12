/**
 * Regenerate libs/golden/expected/ from the case files, using this
 * TypeScript port as the reference implementation.
 *
 *   npm run golden:generate
 *
 * Review the resulting diff before committing — a change in expected/ is a
 * semantic change to the library. See libs/golden/README.md.
 */
import '../test/setup.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  GOLDEN_DIR,
  loadCases,
  makeBellSchedule,
  runQuery,
} from '../test/golden/harness.js';

for (const { name, def } of await loadCases()) {
  const bells = await makeBellSchedule(def);
  const expected: Record<string, unknown> = {};
  for (const q of def.queries) {
    if (q.id in expected) throw new Error(`${name}: duplicate query id '${q.id}'`);
    expected[q.id] = runQuery(bells, q);
  }
  const file = path.join(GOLDEN_DIR, 'expected', `${name}.json`);
  await writeFile(file, JSON.stringify(expected, null, 2) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), file)} (${def.queries.length} queries)`);
}

/**
 * Cross-implementation golden tests. The Python and Java ports run the same
 * cases against the same expected files; see libs/golden/README.md.
 */
import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, loadExpected, makeBellSchedule, runQuery } from './golden/harness.js';

for (const { name, def } of await loadCases()) {
  const bells = await makeBellSchedule(def);
  const expected = await loadExpected(name);

  describe(`golden: ${name}`, () => {
    for (const q of def.queries) {
      it(q.id, () => {
        assert.ok(q.id in expected, `no expected value — regenerate with npm run golden:generate`);
        assert.deepStrictEqual(runQuery(bells, q), expected[q.id]);
      });
    }
  });
}

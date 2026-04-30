import bhs20222023 from './2022-2023.json' with { type: 'json' };
import bhs20232024 from './2023-2024.json' with { type: 'json' };
import bhs20242025 from './2024-2025.json' with { type: 'json' };
import bhs20252026 from './2025-2026.json' with { type: 'json' };
import bhs20262027 from './2026-2027.json' with { type: 'json' };
import king6 from './king-6.json' with { type: 'json' };
import king7 from './king-7.json' with { type: 'json' };
import king8 from './king-8.json' with { type: 'json' };
import longfellow6 from './longfellow-6.json' with { type: 'json' };
import longfellow78 from './longfellow-78.json' with { type: 'json' };
import willard6 from './willard-6.json' with { type: 'json' };
import willard78 from './willard-78.json' with { type: 'json' };

/**
 * All yearly calendar JSON files in the package as a flat array.
 *
 * Each entry is one yearly calendar object. Group by `id` to assemble the
 * year sequence for a particular school (a single `BellSchedule` consumes
 * one such group).
 */
export default [
  bhs20222023,
  bhs20232024,
  bhs20242025,
  bhs20252026,
  bhs20262027,
  king6,
  king7,
  king8,
  longfellow6,
  longfellow78,
  willard6,
  willard78,
];

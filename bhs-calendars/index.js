import bhs20222023 from './bhs-2022-2023.json' with { type: 'json' };
import bhs20232024 from './bhs-2023-2024.json' with { type: 'json' };
import bhs20242025 from './bhs-2024-2025.json' with { type: 'json' };
import bhs20252026 from './bhs-2025-2026.json' with { type: 'json' };
import bhs20262027 from './bhs-2026-2027.json' with { type: 'json' };
import king6_20252026 from './king-6-2025-2026.json' with { type: 'json' };
import king7_20252026 from './king-7-2025-2026.json' with { type: 'json' };
import king8_20252026 from './king-8-2025-2026.json' with { type: 'json' };
import king6_20262027 from './king-6-2026-2027.json' with { type: 'json' };
import king7_20262027 from './king-7-2026-2027.json' with { type: 'json' };
import king8_20262027 from './king-8-2026-2027.json' with { type: 'json' };
import longfellow6_20252026 from './longfellow-6-2025-2026.json' with { type: 'json' };
import longfellow78_20252026 from './longfellow-78-2025-2026.json' with { type: 'json' };
import longfellow6_20262027 from './longfellow-6-2026-2027.json' with { type: 'json' };
import longfellow78_20262027 from './longfellow-78-2026-2027.json' with { type: 'json' };
import willard6_20252026 from './willard-6-2025-2026.json' with { type: 'json' };
import willard78_20252026 from './willard-78-2025-2026.json' with { type: 'json' };
import willard6_20262027 from './willard-6-2026-2027.json' with { type: 'json' };
import willard78_20262027 from './willard-78-2026-2027.json' with { type: 'json' };

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
  king6_20252026,
  king7_20252026,
  king8_20252026,
  king6_20262027,
  king7_20262027,
  king8_20262027,
  longfellow6_20252026,
  longfellow78_20252026,
  longfellow6_20262027,
  longfellow78_20262027,
  willard6_20252026,
  willard78_20252026,
  willard6_20262027,
  willard78_20262027,
];

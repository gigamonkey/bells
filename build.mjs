// Build script shared by `make build` and `make watch` (and the npm `dev`
// script). Bundles bells.js → out.js and stamps sw.js from sw.js.template
// with a content-derived cache name, so the two can never drift: every
// rebuild — one-shot or watch — regenerates both.
//
// Usage: node build.mjs [--watch]

import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, watchFile } from 'node:fs';

const watch = process.argv.includes('--watch');

// Files whose bytes determine the service-worker cache name. Must match what
// the deployed app serves; hashed in this order (same as the old Makefile
// `cat ... | shasum` step, so the cache name is stable across the migration).
const HASHED_FILES = ['out.js', 'style.css', 'index.html', 'manifest.json'];

function stampServiceWorker() {
  const hash = createHash('sha1');
  for (const file of HASHED_FILES) hash.update(readFileSync(file));
  const cacheName = `bells-${hash.digest('hex').slice(0, 12)}`;
  const template = readFileSync('sw.js.template', 'utf8');
  writeFileSync('sw.js', template.replaceAll('__CACHE_NAME__', cacheName));
  console.log(`Generated sw.js with cache_name ${cacheName}`);
}

const stampPlugin = {
  name: 'stamp-sw',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) stampServiceWorker();
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ['bells.js'],
  bundle: true,
  sourcemap: true,
  format: 'esm',
  outfile: 'out.js',
  plugins: [stampPlugin],
});

if (watch) {
  await ctx.watch();
  // esbuild only rebuilds (and thus re-stamps) when files in the bundle graph
  // change. The other hashed inputs live outside it, so watch them directly.
  // watchFile polls, which survives editors that replace files on save.
  for (const file of [...HASHED_FILES.slice(1), 'sw.js.template']) {
    watchFile(file, { interval: 500 }, () => stampServiceWorker());
  }
  console.log('Watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

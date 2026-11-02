// Transpiles src/**/*.ts (not specs) to CommonJS in dist/, one file per input.
// No bundling: overlay.ts reads runtime.browser.js from its own __dirname, and
// playwright-core must stay external anyway. Declarations come from
// `tsc -b tsconfig.lib.json`, run before this script.
import { build } from 'esbuild'
import { copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const entryPoints = readdirSync('src', { recursive: true })
  .map((file) => join('src', file))
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => !/\.(spec|test|d)\.ts$/.test(file))

await build({
  entryPoints,
  outdir: 'dist',
  outbase: 'src',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
})

copyFileSync(
  'src/lib/overlay/runtime.browser.js',
  'dist/lib/overlay/runtime.browser.js',
)

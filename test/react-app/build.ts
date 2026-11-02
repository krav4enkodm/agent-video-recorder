import * as path from 'path'
import { pathToFileURL } from 'url'

import { build } from 'esbuild'

/** Bundles the test app into dist/app.js and returns the file:// URL of its page. */
export async function buildTestApp(): Promise<string> {
  await build({
    entryPoints: [path.join(__dirname, 'main.tsx')],
    outfile: path.join(__dirname, 'dist/app.js'),
    bundle: true,
    minify: true,
    jsx: 'automatic',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  return pathToFileURL(path.join(__dirname, 'index.html')).href
}

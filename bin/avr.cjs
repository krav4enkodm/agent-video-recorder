#!/usr/bin/env node
// The package ships TypeScript sources (it is not built), so tsx compiles the
// CLI and scenario files on load. A global registration, unlike tsx.require(),
// leaves resolved paths untouched: its ?namespace= suffix broke packages that
// locate files with require.resolve (e.g. esbuild's binary).
require('tsx/cjs/api').register()

const { main } = require('../src/cli/main.ts')

main(process.argv).then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    process.stderr.write(
      `error: ${error instanceof Error ? error.stack : error}\n`,
    )
    process.exitCode = 1
  },
)

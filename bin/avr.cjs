#!/usr/bin/env node
const { main } = require('../dist/cli/main.js')

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

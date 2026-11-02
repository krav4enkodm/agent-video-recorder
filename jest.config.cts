const { readFileSync } = require('fs')
const { join } = require('path')

const swcJestConfig = {
  ...JSON.parse(readFileSync(join(__dirname, '.spec.swcrc'), 'utf-8')),
  swcrc: false,
}

module.exports = {
  displayName: 'agent-video-recorder',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'html'],
  // Integration specs need Chromium and ffmpeg; they run via `pnpm test:integration`.
  // dist/ holds the build output. src/test.ts is the Playwright fixture module, not a test file.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/dist/',
    '\\.int\\.spec\\.ts$',
    '/src/test\\.ts$',
  ],
  coverageDirectory: 'test-output/jest/coverage',
}

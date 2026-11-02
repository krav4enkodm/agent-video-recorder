const base = require('./jest.config.cts')

// Launches Chromium and runs ffmpeg/ffprobe, so it stays out of the CI `test` target.
module.exports = {
  ...base,
  displayName: 'agent-video-recorder:integration',
  testMatch: ['**/*.int.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/src/test\\.ts$'],
  testTimeout: 60_000,
}

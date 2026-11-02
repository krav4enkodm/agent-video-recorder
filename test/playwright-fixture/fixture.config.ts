import { defineConfig } from '@playwright/test'

// Not named playwright.config.ts, so the Nx Playwright plugin doesn't infer an
// e2e target for this package; the integration spec runs it explicitly.
export default defineConfig({
  testDir: '.',
  testMatch: 'recorder-fixture.pw.ts',
  outputDir: process.env['AVR_FIXTURE_OUTPUT_DIR'] ?? 'test-output',
  reporter: 'line',
  workers: 1,
  use: { viewport: { width: 1920, height: 1080 } },
})

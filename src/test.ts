import { test as base, expect } from '@playwright/test'

import { Recorder } from './lib/recorder'

/**
 * Playwright test with a `recorder` fixture writing to the test's output
 * directory as `recording.mp4`. Call `recorder.start()` once setup is done;
 * the fixture stops it after the test if needed.
 */
export const test = base.extend<{ recorder: Recorder }>({
  recorder: async ({ page }, use, testInfo) => {
    const recorder = new Recorder(page, {
      output: testInfo.outputPath('recording.mp4'),
    })
    await use(recorder)
    if (recorder.isRecording) await recorder.stop()
  },
})

export { expect }

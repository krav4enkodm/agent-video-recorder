import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { chromium, type Browser } from 'playwright-core'

import { Recorder } from './recorder'

const FIXTURE_URL = `file://${path.resolve(__dirname, '../../test/fixtures/demo-app.html')}`
const LAYOUT = { width: 640, height: 360 }

function videoSize(file: string): string {
  return execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    file,
  ])
    .toString()
    .trim()
}

describe('Recorder at scale 2', () => {
  let outDir: string

  beforeAll(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-scale-'))
  })

  afterAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  async function withBrowser(
    args: string[],
    run: (browser: Browser) => Promise<void>,
  ): Promise<void> {
    const browser = await chromium.launch({ args })
    try {
      await run(browser)
    } finally {
      await browser.close()
    }
  }

  it('records a double-size video with the same page layout', async () => {
    await withBrowser(['--force-device-scale-factor=2'], async (browser) => {
      const page = await browser.newPage({
        viewport: LAYOUT,
        deviceScaleFactor: 2,
      })
      await page.goto(FIXTURE_URL)
      const output = path.join(outDir, 'scale2.mp4')
      const recorder = new Recorder(page, {
        resolution: LAYOUT,
        scale: 2,
        output,
      })
      await recorder.start()
      const result = await recorder.stop({ holdMs: 300 })

      expect(page.viewportSize()).toEqual(LAYOUT)
      expect(await page.evaluate(() => innerWidth)).toBe(640)
      expect(result).toMatchObject({ width: 1280, height: 720 })
      expect(videoSize(output)).toBe('1280x720')
    })
  })

  it('fails with a launch hint when the browser renders at 1x', async () => {
    await withBrowser([], async (browser) => {
      const page = await browser.newPage({ viewport: LAYOUT })
      await page.goto(FIXTURE_URL)
      const recorder = new Recorder(page, {
        resolution: LAYOUT,
        scale: 2,
        output: path.join(outDir, 'wrong.mp4'),
      })
      await expect(recorder.start()).rejects.toMatchObject({
        code: 'INVALID_OPTIONS',
        message: expect.stringContaining('--force-device-scale-factor=2'),
      })
      expect(recorder.isRecording).toBe(false)
    })
  })
})

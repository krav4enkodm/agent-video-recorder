import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { chromium, type Browser, type Page } from 'playwright-core'

import { Recorder } from './recorder'
import type { NarrationPosition } from './narration'

const FIXTURE_URL = `file://${path.resolve(__dirname, '../../test/fixtures/demo-app.html')}`
const VIEWPORT = { width: 1920, height: 1080 }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Recorder narration (Chromium + ffmpeg)', () => {
  let browser: Browser
  let page: Page
  let outDir: string
  let recorder: Recorder

  const narration = async () =>
    (await page.evaluate(() => window.__agentVideoRecorder.inspect())).narration

  beforeAll(async () => {
    browser = await chromium.launch()
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-narration-'))
  })

  afterAll(async () => {
    await browser.close()
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    page = await browser.newPage()
    await page.goto(FIXTURE_URL)
    recorder = new Recorder(page, {
      output: path.join(outDir, `${Date.now()}.mp4`),
    })
    await recorder.start()
  })

  afterEach(async () => {
    if (recorder.isRecording) await recorder.stop({ holdMs: 0 })
    await page.close()
  })

  it.each<[NarrationPosition, (r: DOMRectLike) => boolean]>([
    ['top', (r) => r.top < 100 && isCentred(r)],
    ['bottom', (r) => bottom(r) > VIEWPORT.height - 100 && isCentred(r)],
    ['top-left', (r) => r.top < 100 && r.left < 100],
    ['top-right', (r) => r.top < 100 && right(r) > VIEWPORT.width - 100],
    ['bottom-left', (r) => bottom(r) > VIEWPORT.height - 100 && r.left < 100],
    [
      'bottom-right',
      (r) =>
        bottom(r) > VIEWPORT.height - 100 && right(r) > VIEWPORT.width - 100,
    ],
  ])('places the caption at %s', async (position, isPlaced) => {
    await recorder.narrate('Creating a new project', { position })
    const shown = await narration()
    expect(shown?.text).toBe('Creating a new project')
    expect(shown && isPlaced(shown.rect)).toBe(true)
  })

  it('renders markup as literal text', async () => {
    await recorder.narrate('<b>x</b>')
    expect((await narration())?.text).toBe('<b>x</b>')
  })

  it('keeps the caption across a navigation', async () => {
    await recorder.narrate('Still here', { animation: 'slide' })
    await recorder.goto(`${FIXTURE_URL}?second`)
    expect((await narration())?.text).toBe('Still here')
  })

  it('hides the step caption after the step, also when it throws', async () => {
    const result = await recorder.step('Fill the form', async () => {
      expect((await narration())?.text).toBe('Fill the form')
      return 42
    })
    expect(result).toBe(42)
    await sleep(300)
    expect(await narration()).toBeNull()

    await expect(
      recorder.step('This step fails', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await sleep(300)
    expect(await narration()).toBeNull()
  })

  it('keeps a step caption up long enough to read', async () => {
    const started = Date.now()
    await recorder.step('Short', async () => undefined)
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500)
  })

  it('auto-hides a caption with durationMs', async () => {
    await recorder.narrate('Brief', { durationMs: 1000 })
    expect((await narration())?.text).toBe('Brief')
    await sleep(1300)
    expect(await narration()).toBeNull()
  })

  it('does nothing before start()', async () => {
    await recorder.stop({ holdMs: 0 })
    await recorder.narrate('Not recording')
    const inspected = await page.evaluate(() =>
      window.__agentVideoRecorder.inspect(),
    )
    expect(inspected.narration).toBeNull()
  })
})

interface DOMRectLike {
  left: number
  top: number
  width: number
  height: number
}

const right = (r: DOMRectLike) => r.left + r.width
const bottom = (r: DOMRectLike) => r.top + r.height
const isCentred = (r: DOMRectLike) =>
  Math.abs(r.left + r.width / 2 - VIEWPORT.width / 2) < 2

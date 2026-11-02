import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  chromium,
  type Browser,
  type Locator,
  type Page,
} from 'playwright-core'

import { eventually } from '../../test/poll'
import { Recorder } from './recorder'
import type { RecorderOptions } from './options'

const FIXTURE_URL = `file://${path.resolve(__dirname, '../../test/fixtures/demo-app.html')}`
const PAD = 4

describe('Recorder highlights (Chromium + ffmpeg)', () => {
  let browser: Browser
  let page: Page
  let outDir: string
  let recorder: Recorder | undefined

  async function startRecording(options: RecorderOptions = {}) {
    recorder = new Recorder(page, {
      output: path.join(outDir, `${Date.now()}.mp4`),
      ...options,
    })
    await recorder.start()
    return recorder
  }

  const highlights = async () =>
    (await page.evaluate(() => window.__agentVideoRecorder.inspect()))
      .highlights

  async function expectFramed(target: Locator) {
    const box = await target.boundingBox()
    const [rect] = await highlights()
    expect(rect).toBeDefined()
    expect(rect?.left).toBeCloseTo((box?.x ?? 0) - PAD, 0)
    expect(rect?.top).toBeCloseTo((box?.y ?? 0) - PAD, 0)
    expect(rect?.width).toBeCloseTo((box?.width ?? 0) + PAD * 2, 0)
    expect(rect?.height).toBeCloseTo((box?.height ?? 0) + PAD * 2, 0)
  }

  beforeAll(async () => {
    browser = await chromium.launch()
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-highlight-'))
  })

  afterAll(async () => {
    await browser.close()
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    page = await browser.newPage()
    await page.goto(FIXTURE_URL)
  })

  afterEach(async () => {
    if (recorder?.isRecording) await recorder.stop({ holdMs: 0 })
    recorder = undefined
    await page.close()
  })

  it('frames the element and follows it when the page scrolls', async () => {
    const rec = await startRecording()
    const input = page.getByLabel('Project name')
    const showing = rec.highlight(input, { durationMs: 1000 })

    await eventually(() => expectFramed(input))

    await page.evaluate(() => window.scrollBy(0, 200))
    await eventually(() => expectFramed(input))
    await showing
  })

  it('does not block the click or touch the element styles', async () => {
    const rec = await startRecording({ highlights: 'strong' })
    const button = page.getByRole('button', { name: 'Next step' })
    const styleBefore = await button.getAttribute('style')

    const clicking = rec.click(button)
    await eventually(async () => expect(await highlights()).toHaveLength(1))
    const hitId = await button.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        ?.id
    })
    expect(hitId).toBe('next-step')
    await clicking

    const clicked = await page.evaluate(
      (): Array<{ type: string }> => Reflect.get(window, '__events'),
    )
    expect(clicked.map((e) => e.type)).toContain('next-click')
    expect(await button.getAttribute('style')).toBe(styleBefore)
  })

  it('removes the highlight shortly after the action', async () => {
    const rec = await startRecording({
      pacing: { preset: 'fast', betweenActionsMs: 0 },
    })
    await rec.click(page.getByRole('button', { name: 'Next step' }))
    await eventually(async () => expect(await highlights()).toHaveLength(0))
  })

  it('draws nothing when highlights are off', async () => {
    const rec = await startRecording({ highlights: false })
    let done = false
    const clicking = rec
      .click(page.getByRole('button', { name: 'Next step' }))
      .finally(() => (done = true))
    // Samples for the whole click, so a highlight drawn at any point fails.
    const drawn: number[] = []
    while (!done) {
      drawn.push((await highlights()).length)
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    await clicking
    expect(drawn.length).toBeGreaterThan(0)
    expect(Math.max(...drawn)).toBe(0)
  })
})

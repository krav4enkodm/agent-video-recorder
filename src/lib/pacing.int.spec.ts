import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { chromium, type Browser, type Page } from 'playwright-core'

import { Recorder } from './recorder'
import type { RecorderOptions } from './options'
import type { Pacing } from './timing'

const FIXTURE_URL = `file://${path.resolve(__dirname, '../../test/fixtures/demo-app.html')}`

// Only the settle wait remains, so elapsed time measures it alone.
const NO_PAUSES: Pacing = {
  cursorBaseMs: 0,
  cursorMsPerPx: 0,
  cursorMinMs: 0,
  cursorMaxMs: 0,
  preClickMs: 0,
  postClickMs: 0,
  typingDelayMs: 0,
  betweenActionsMs: 0,
  endHoldMs: 0,
}

interface PageEvent {
  type: string
  t: number
}

describe('Recorder pacing (Chromium + ffmpeg)', () => {
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

  const events = () =>
    page.evaluate((): PageEvent[] => Reflect.get(window, '__events'))

  beforeAll(async () => {
    browser = await chromium.launch()
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-pacing-'))
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

  it('starts the next action only after the UI transition has finished', async () => {
    const rec = await startRecording({ pacing: NO_PAUSES })
    await rec.click(page.getByRole('button', { name: 'Show details' }))
    await rec.click(page.getByRole('button', { name: 'Next step' }))

    const log = await events()
    const ended = log.find((e) => e.type === 'details-transitionend')
    const next = log.find((e) => e.type === 'next-click')
    expect(ended).toBeDefined()
    expect(next?.t).toBeGreaterThanOrEqual(ended?.t ?? Infinity)
  })

  it('does not wait for infinite animations', async () => {
    // The fixture's ticker bar animates forever.
    const rec = await startRecording({
      pacing: { ...NO_PAUSES, settleTimeoutMs: 5000 },
    })
    const started = Date.now()
    await rec.click(page.getByRole('button', { name: 'Next step' }))
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('applies per-action pauses', async () => {
    const rec = await startRecording({ pacing: NO_PAUSES })
    const started = Date.now()
    await rec.click(page.getByRole('button', { name: 'Next step' }), {
      pauseBefore: 300,
      pauseAfter: 300,
    })
    await rec.click(page.getByRole('button', { name: 'Next step' }), {
      important: true,
    })
    // 300 + 300 + importantPauseMs (normal preset: 800)
    expect(Date.now() - started).toBeGreaterThanOrEqual(1400)
  })

  it('takes longer the slower the preset', async () => {
    const elapsed: Record<string, number> = {}
    for (const pacing of ['fast', 'normal', 'slow'] as const) {
      await page.goto(FIXTURE_URL)
      const rec = await startRecording({ pacing })
      const started = Date.now()
      await rec.hover(page.getByLabel('Project name'))
      await rec.type(page.getByLabel('Project name'), 'Ab')
      await rec.selectOption(page.getByLabel('Template'), 'roadmap')
      await rec.click(page.getByRole('button', { name: 'Show details' }))
      await rec.press('Tab')
      elapsed[pacing] = Date.now() - started
      await rec.stop({ holdMs: 0 })
    }
    expect(elapsed['fast']).toBeLessThan(elapsed['normal'] ?? 0)
    expect(elapsed['normal']).toBeLessThan(elapsed['slow'] ?? 0)
  }, 120_000)

  it('holds the final frame for endHoldMs on stop()', async () => {
    const output = path.join(outDir, 'hold.mp4')
    const rec = await startRecording({ output })
    await rec.stop()

    const duration = Number(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        output,
      ]).toString(),
    )
    // normal preset: 1500 ms
    expect(duration).toBeGreaterThan(1.2)
    expect(duration).toBeLessThan(1.8)
  })

  it('waitFor waits for the result to appear and finish animating', async () => {
    const rec = await startRecording({ pacing: NO_PAUSES })
    await rec.click(page.getByRole('button', { name: 'Create project' }))
    await rec.waitFor(page.getByRole('status'))

    const opacity = await page
      .getByRole('status')
      .evaluate((el) => getComputedStyle(el).opacity)
    expect(opacity).toBe('1')
  })
})

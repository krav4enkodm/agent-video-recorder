import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { chromium, type Browser, type Page } from 'playwright-core'

import { Recorder } from './recorder'
import type { RecorderOptions } from './options'

const FIXTURE = path.resolve(__dirname, '../../test/fixtures/demo-app.html')
const FIXTURE_URL = `file://${FIXTURE}`

describe('Recorder actions (Chromium + ffmpeg)', () => {
  let browser: Browser
  let page: Page
  let outDir: string
  let recorder: Recorder | undefined

  const inspect = () =>
    page.evaluate(() => window.__agentVideoRecorder.inspect())

  async function startRecording(options: RecorderOptions = {}) {
    recorder = new Recorder(page, {
      output: path.join(outDir, `${expect.getState().currentTestName}.mp4`),
      ...options,
    })
    await recorder.start()
    return recorder
  }

  beforeAll(async () => {
    browser = await chromium.launch()
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-actions-'))
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
    if (recorder?.isRecording) await recorder.stop()
    recorder = undefined
    await page.close()
  })

  it('clicks, types and selects through the page as a user would', async () => {
    const rec = await startRecording()
    await rec.type(page.getByLabel('Project name'), 'Apollo')
    await rec.selectOption(page.getByLabel('Template'), 'kanban')
    await rec.click(page.getByRole('button', { name: 'Create project' }))

    await page
      .getByText('Project "Apollo" created from the kanban template.')
      .waitFor()
  })

  it('leaves the cursor on the target without covering it', async () => {
    const rec = await startRecording()
    const input = page.getByLabel('Project name')
    await rec.hover(input)

    const state = await inspect()
    const box = await input.boundingBox()
    expect(state.visible).toBe(true)
    expect(state.cursor).toEqual({
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
    })
    const hitId = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.id,
      state.cursor ?? { x: 0, y: 0 },
    )
    expect(hitId).toBe('name')
  })

  it('restores the layer at the same cursor position after a navigation', async () => {
    const rec = await startRecording()
    await rec.hover(page.getByLabel('Project name'))
    const before = (await inspect()).cursor

    await rec.goto(`${FIXTURE_URL}?second`)
    const after = await inspect()
    expect(after).toMatchObject({ visible: true, attached: true })
    expect(after.cursor).toEqual(before)

    await rec.click(page.getByRole('button', { name: 'Create project' }))
    await page.getByRole('status').waitFor()
  })

  it('renders nothing when cursor and click effect are off', async () => {
    const rec = await startRecording({ cursor: false, clickEffect: false })
    await rec.click(page.getByRole('button', { name: 'Create project' }))

    expect(await inspect()).toMatchObject({ cursor: null, ripples: 0 })
  })

  it('still performs the action when the overlay is broken', async () => {
    const rec = await startRecording()
    await page.evaluate(() => {
      Reflect.deleteProperty(window, '__agentVideoRecorder')
    })

    await rec.click(page.getByRole('button', { name: 'Create project' }))
    await page.getByRole('status').waitFor()
  })

  it('hides the layer on stop and does not reinstall it on later pages', async () => {
    const rec = await startRecording()
    await rec.stop()
    expect((await inspect()).visible).toBe(false)

    await page.goto(`${FIXTURE_URL}?after-stop`)
    expect(await page.evaluate(() => '__agentVideoRecorder' in window)).toBe(
      false,
    )
  })

  it('runs plain Playwright actions before start()', async () => {
    const rec = new Recorder(page)
    await rec.type(page.getByLabel('Project name'), 'Setup')
    await expect(page.getByLabel('Project name').inputValue()).resolves.toBe(
      'Setup',
    )
    expect(await page.evaluate(() => '__agentVideoRecorder' in window)).toBe(
      false,
    )
  })
})

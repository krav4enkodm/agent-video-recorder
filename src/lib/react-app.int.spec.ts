import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { chromium, type Browser } from 'playwright-core'

import { buildTestApp } from '../../test/react-app/build'
import { Recorder } from './recorder'

describe('Recorder on a single-page React app (Chromium + ffmpeg)', () => {
  let browser: Browser
  let outDir: string
  let appUrl: string

  beforeAll(async () => {
    appUrl = await buildTestApp()
    browser = await chromium.launch()
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-react-'))
  })

  afterAll(async () => {
    await browser.close()
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  it('records a dialog flow without any page navigation', async () => {
    const page = await browser.newPage()
    await page.goto(appUrl)
    let navigations = 0
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations++
    })

    const recorder = new Recorder(page, {
      output: path.join(outDir, 'react.mp4'),
      pacing: 'fast',
    })
    await recorder.start()
    await recorder.click(page.getByRole('button', { name: '+ New project' }))
    const dialog = page.getByRole('dialog', { name: 'New project' })
    await recorder.waitFor(dialog)
    await recorder.type(dialog.getByLabel('Project name'), 'Recorded')
    await recorder.click(dialog.getByRole('button', { name: 'Create project' }))
    await recorder.waitFor(page.getByRole('status'))
    await recorder.stop({ holdMs: 0 })

    await expect(page.getByRole('status').textContent()).resolves.toContain(
      'Project “Recorded” created',
    )
    await expect(dialog.count()).resolves.toBe(0)
    expect(navigations).toBe(0)
    await page.close()
  })
})

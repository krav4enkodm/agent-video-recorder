import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { chromium, type Browser, type Page } from 'playwright-core'

import { RecorderError } from './errors'
import { Recorder } from './recorder'

const FIXTURE_URL = `file://${path.resolve(__dirname, '../../test/fixtures/demo-app.html')}`

interface ProbedVideo {
  codec: string
  width: number
  height: number
  pixFmt: string
  colorRange: string
  avgFrameRate: string
  durationSec: number
}

function probe(file: string): ProbedVideo {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    file,
  ])
  const { streams, format } = JSON.parse(out.toString())
  const stream = streams[0]
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    pixFmt: stream.pix_fmt,
    colorRange: stream.color_range,
    avgFrameRate: stream.avg_frame_rate,
    durationSec: Number(format.duration),
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Recorder (Chromium + ffmpeg)', () => {
  let browser: Browser
  let page: Page
  let outDir: string

  beforeAll(async () => {
    browser = await chromium.launch()
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-int-'))
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
    await page.close().catch(() => undefined)
  })

  it.each([30, 60] as const)(
    'records a 1080p H.264 MP4 at %i fps',
    async (fps) => {
      const output = path.join(outDir, `1080p-${fps}.mp4`)
      const recorder = new Recorder(page, { fps, output })
      await recorder.start()
      await sleep(3000)
      const result = await recorder.stop({ holdMs: 0 })

      const video = probe(output)
      expect(video).toMatchObject({
        codec: 'h264',
        width: 1920,
        height: 1080,
        pixFmt: 'yuv420p',
        colorRange: 'tv',
        avgFrameRate: `${fps}/1`,
      })
      // The file matches what stop() reports, to the frame.
      expect(video.durationSec).toBeCloseTo(result.durationMs / 1000, 1)
      // Loose wall-clock bounds: a loaded runner delivers the first frame late.
      expect(video.durationSec).toBeGreaterThan(2.5)
      expect(video.durationSec).toBeLessThan(3.3)
      expect(result).toMatchObject({
        path: output,
        width: 1920,
        height: 1080,
        fps,
      })
      expect(result.framesWritten).toBe(
        Math.round((result.durationMs * fps) / 1000),
      )
    },
  )

  it('records 720p and resizes the viewport to match', async () => {
    const output = path.join(outDir, '720p.mp4')
    const recorder = new Recorder(page, { resolution: '720p', output })
    await recorder.start()
    expect(page.viewportSize()).toEqual({ width: 1280, height: 720 })
    await sleep(1000)
    await recorder.stop()

    expect(probe(output)).toMatchObject({
      codec: 'h264',
      width: 1280,
      height: 720,
    })
  })

  it('still writes a playable file when the page closes before stop()', async () => {
    const output = path.join(outDir, 'closed.mp4')
    const recorder = new Recorder(page, { output })
    await recorder.start()
    await sleep(1000)
    await page.close()
    const result = await recorder.stop()

    expect(result.durationMs).toBeGreaterThan(900)
    expect(probe(output).codec).toBe('h264')
  })

  it('rejects start() twice and stop() before start()', async () => {
    const recorder = new Recorder(page, {
      output: path.join(outDir, 'twice.mp4'),
    })
    await expect(recorder.stop()).rejects.toMatchObject({ code: 'NOT_STARTED' })
    await recorder.start()
    await expect(recorder.start()).rejects.toBeInstanceOf(RecorderError)
    await recorder.stop()
  })

  it('removes the overlay even when ffmpeg fails at stop()', async () => {
    // Passes the libx264 check, then fails the encode.
    const fakeFfmpeg = path.join(outDir, 'failing-ffmpeg')
    fs.writeFileSync(
      fakeFfmpeg,
      '#!/bin/sh\n' +
        'if [ "$2" = "-encoders" ]; then echo " V..... libx264"; exit 0; fi\n' +
        'cat >/dev/null\necho "encode failed on purpose" >&2\nexit 1\n',
      { mode: 0o755 },
    )
    const recorder = new Recorder(page, {
      ffmpegPath: fakeFfmpeg,
      output: path.join(outDir, 'failing-ffmpeg.mp4'),
    })
    await recorder.start()

    await expect(recorder.stop({ holdMs: 0 })).rejects.toMatchObject({
      code: 'FFMPEG_FAILED',
    })
    expect(recorder.isRecording).toBe(false)
    const state = await page.evaluate(() =>
      window.__agentVideoRecorder.inspect(),
    )
    expect(state.visible).toBe(false)
    // The init script is gone too: a reload doesn't bring the runtime back.
    await page.reload()
    expect(await page.evaluate(() => '__agentVideoRecorder' in window)).toBe(
      false,
    )
  })

  it('fails start() with a clear error when ffmpeg is missing', async () => {
    const recorder = new Recorder(page, {
      ffmpegPath: '/nonexistent/ffmpeg',
      output: path.join(outDir, 'none.mp4'),
    })
    await expect(recorder.start()).rejects.toMatchObject({
      code: 'FFMPEG_NOT_FOUND',
    })
    expect(recorder.isRecording).toBe(false)
  })
})

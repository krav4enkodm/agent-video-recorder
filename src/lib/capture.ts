import { performance } from 'perf_hooks'

import { debug } from './debug'
import { FfmpegEncoder } from './encoder/ffmpeg'
import { FrameScheduler } from './encoder/frame-scheduler'
import { jpegSize } from './encoder/jpeg'
import { RecorderError } from './errors'
import type { Fps, Size } from './options'
import type { Page } from 'playwright-core'

export interface RecordingResult {
  path: string
  width: number
  height: number
  fps: number
  durationMs: number
  framesCaptured: number
  framesWritten: number
  /**
   * Distinct frames Chromium delivered per second of video. Chromium only sends
   * a frame when the page changes, so pauses and static pages lower it.
   */
  captureFps: number
  /**
   * Frames replaced by a repeat of the previous one because ffmpeg fell too far
   * behind (see `MAX_BACKLOG_BYTES`). Above 0, motion in the video stutters.
   */
  framesDropped: number
}

export interface CaptureOptions {
  output: string
  size: Size
  fps: Fps
  quality: number
  ffmpegPath: string
  /** Overrides `MAX_BACKLOG_BYTES`; for tests. */
  maxBacklogBytes?: number
}

const FIRST_FRAME_TIMEOUT_MS = 5_000

/** Streams the page's screencast frames into an H.264 MP4 at a constant frame rate. */
export class Capture {
  private readonly scheduler: FrameScheduler
  private framesCaptured = 0
  private framesDropped = 0
  /** The last frame handed to the scheduler. */
  private lastData: Buffer | undefined
  private lastFrame: { timestampMs: number; receivedAt: number } | undefined

  private constructor(
    private readonly page: Page,
    private readonly encoder: FfmpegEncoder,
    private readonly options: CaptureOptions,
  ) {
    this.scheduler = new FrameScheduler(options.fps, (data) =>
      encoder.write(data),
    )
  }

  /** Resolves once the first frame has arrived, so the video starts at a known point. */
  static async start(page: Page, options: CaptureOptions): Promise<Capture> {
    const encoder = new FfmpegEncoder(
      options.ffmpegPath,
      options.fps,
      options.output,
      options.maxBacklogBytes,
    )
    const capture = new Capture(page, encoder, options)
    try {
      await capture.waitForFirstFrame()
    } catch (error) {
      await page.screencast.stop().catch(() => undefined)
      await encoder.close().catch(() => undefined)
      throw error
    }
    return capture
  }

  async stop(): Promise<RecordingResult> {
    // Fails when the page or browser is already closed; the frames received so far are still encoded.
    await this.page.screencast.stop().catch(() => undefined)
    const { lastFrame } = this
    if (lastFrame) {
      // Frame timestamps use Chromium's clock, so extend from the last frame by local elapsed time.
      this.scheduler.finish(
        lastFrame.timestampMs + (performance.now() - lastFrame.receivedAt),
      )
    }
    await this.encoder.close()

    const { size, fps, output } = this.options
    const framesWritten = this.scheduler.framesWritten
    const durationMs = (framesWritten * 1000) / fps
    const captureFps =
      durationMs > 0 ? this.framesCaptured / (durationMs / 1000) : 0
    return {
      path: output,
      width: size.width,
      height: size.height,
      fps,
      durationMs,
      framesCaptured: this.framesCaptured,
      framesWritten,
      captureFps,
      framesDropped: this.framesDropped,
    }
  }

  /**
   * The frame to encode. While ffmpeg is backlogged it is the previous frame
   * again: the video keeps its timing and memory stops growing, at the cost of
   * stutter.
   */
  private accept(data: Buffer): Buffer {
    if (!this.lastData || !this.encoder.backlogged) {
      this.lastData = data
      return data
    }
    if (this.framesDropped++ === 0) {
      debug('ffmpeg is falling behind; repeating frames until it catches up.')
    }
    return this.lastData
  }

  private async waitForFirstFrame(): Promise<void> {
    let onFirstFrame: (data: Buffer) => void = () => undefined
    const firstFrame = new Promise<Buffer | undefined>((resolve) => {
      onFirstFrame = resolve
      setTimeout(() => resolve(undefined), FIRST_FRAME_TIMEOUT_MS).unref()
    })
    await this.page.screencast.start({
      size: this.options.size,
      quality: this.options.quality,
      // Playwright acks a frame only after this returns, and Chromium waits for
      // the ack before sending the next one, so this must stay synchronous.
      onFrame: ({ data, timestamp }) => {
        if (!this.lastFrame) onFirstFrame(data)
        this.framesCaptured++
        this.lastFrame = {
          timestampMs: timestamp,
          receivedAt: performance.now(),
        }
        this.scheduler.push({ data: this.accept(data), timestampMs: timestamp })
      },
    })
    const first = await firstFrame
    if (!first) {
      throw new RecorderError(
        'NO_FRAMES',
        `Chromium delivered no frame within ${FIRST_FRAME_TIMEOUT_MS} ms of start().`,
      )
    }
    // Chromium caps screencast frames at the viewport's CSS size unless the
    // whole browser renders at a higher density, so a scale-2 recording in a
    // normally launched browser would silently come out at half size.
    const { width, height } = this.options.size
    const actual = jpegSize(first)
    if (actual && (actual.width !== width || actual.height !== height)) {
      throw new RecorderError(
        'INVALID_OPTIONS',
        `Expected ${width}x${height} frames, Chromium sent ${actual.width}x${actual.height}. ` +
          'For scale 2, launch Chromium with args ["--force-device-scale-factor=2"] ' +
          'and create the context with deviceScaleFactor: 2.',
      )
    }
  }
}

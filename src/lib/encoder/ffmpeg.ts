import { execFile, spawn, type ChildProcess } from 'child_process'

import { RecorderError } from '../errors'

const STDERR_TAIL_LINES = 20
const STDERR_MAX_CHARS = 64 * 1024

/** Unencoded frame data the encoder may hold before Capture starts dropping frames. */
export const MAX_BACKLOG_BYTES = 256 * 1024 * 1024

export function buildFfmpegArgs(fps: number, output: string): string[] {
  return [
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-c:v',
    'mjpeg',
    '-framerate',
    String(fps),
    '-i',
    'pipe:0',
    '-an',
    '-c:v',
    'libx264',
    // On UI footage veryfast matches medium's quality (SSIM 0.999) at a
    // smaller size, and encodes ~2.5x faster with few cores, which keeps
    // scale-2 recordings closer to real time.
    '-preset',
    'veryfast',
    '-crf',
    '18',
    // Chromium's JPEGs decode as full-range yuvj420p; convert to the limited
    // range players expect, or colours look washed out.
    '-vf',
    'scale=in_range=full:out_range=limited,format=yuv420p',
    '-color_range',
    'tv',
    '-movflags',
    '+faststart',
    '-y',
    output,
  ]
}

export const FFMPEG_INSTALL_HINT =
  'Install ffmpeg with libx264 (e.g. `apt install ffmpeg`, `pacman -S ffmpeg`, ' +
  '`brew install ffmpeg`) or set AVR_FFMPEG_PATH / the ffmpegPath option.'

export async function checkFfmpeg(ffmpegPath: string): Promise<void> {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(ffmpegPath, ['-hide_banner', '-encoders'], (error, out) => {
      if (error) reject(error)
      else resolve(out)
    })
  }).catch((error: NodeJS.ErrnoException) => {
    throw new RecorderError(
      'FFMPEG_NOT_FOUND',
      `Could not run ffmpeg at "${ffmpegPath}" (${error.code ?? error.message}). ` +
        FFMPEG_INSTALL_HINT,
    )
  })
  if (!/\blibx264\b/.test(stdout)) {
    throw new RecorderError(
      'FFMPEG_NO_H264',
      `ffmpeg at "${ffmpegPath}" has no libx264 encoder, which MP4 export needs. ` +
        "Playwright's bundled ffmpeg only supports VP8; point AVR_FFMPEG_PATH at a full ffmpeg build.",
    )
  }
}

/** Pipes JPEG frames into ffmpeg and encodes them to an H.264 MP4. */
export class FfmpegEncoder {
  private readonly process: ChildProcess
  private readonly exited: Promise<number | null>
  private stderr = ''
  private spawnError: Error | undefined
  /** Frames queued but not yet taken by ffmpeg, with their pending write count. */
  private readonly queued = new Map<Buffer, number>()
  private queuedBytes = 0

  constructor(
    ffmpegPath: string,
    fps: number,
    output: string,
    private readonly maxBacklogBytes = MAX_BACKLOG_BYTES,
  ) {
    this.process = spawn(ffmpegPath, buildFfmpegArgs(fps, output), {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    this.process.stderr?.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-STDERR_MAX_CHARS)
    })
    // A dead ffmpeg surfaces as EPIPE on stdin; close() reports it via the exit code.
    this.process.stdin?.on('error', () => undefined)
    this.exited = new Promise((resolve) => {
      this.process.on('error', (error) => {
        this.spawnError = error
        resolve(null)
      })
      this.process.on('close', (code) => resolve(code))
    })
  }

  /**
   * Queues a frame. Node's stream buffers it, so this never blocks the caller;
   * `backlogged` says when ffmpeg is falling too far behind.
   */
  write(frame: Buffer): void {
    const stdin = this.process.stdin
    if (!stdin?.writable) return
    // Repeated frames share one Buffer, so memory grows only with distinct ones.
    const pending = this.queued.get(frame) ?? 0
    if (pending === 0) this.queuedBytes += frame.length
    this.queued.set(frame, pending + 1)
    stdin.write(frame, () => this.taken(frame))
  }

  /** True while the unencoded frames ffmpeg hasn't taken exceed the limit. */
  get backlogged(): boolean {
    return this.queuedBytes > this.maxBacklogBytes
  }

  private taken(frame: Buffer): void {
    const pending = (this.queued.get(frame) ?? 1) - 1
    if (pending > 0) {
      this.queued.set(frame, pending)
      return
    }
    this.queued.delete(frame)
    this.queuedBytes -= frame.length
  }

  async close(): Promise<void> {
    this.process.stdin?.end()
    const code = await this.exited
    if (code === 0) return
    const tail = this.stderr
      .trim()
      .split('\n')
      .slice(-STDERR_TAIL_LINES)
      .join('\n')
    throw new RecorderError(
      'FFMPEG_FAILED',
      `ffmpeg exited with code ${code}` +
        (this.spawnError ? ` (${this.spawnError.message})` : '') +
        (tail ? `:\n${tail}` : ''),
    )
  }
}

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { buildFfmpegArgs, checkFfmpeg, FfmpegEncoder } from './ffmpeg'

describe('buildFfmpegArgs', () => {
  it('reads MJPEG from stdin at the target rate and writes H.264 MP4', () => {
    const args = buildFfmpegArgs(60, '/tmp/out.mp4')
    const after = (flag: string) => args[args.indexOf(flag) + 1]
    expect(after('-framerate')).toBe('60')
    expect(after('-i')).toBe('pipe:0')
    expect(after('-preset')).toBe('veryfast')
    expect(args).toEqual(
      expect.arrayContaining([
        '-c:v',
        'libx264',
        '-color_range',
        'tv',
        '-movflags',
        '+faststart',
      ]),
    )
    expect(args.at(-1)).toBe('/tmp/out.mp4')
  })
})

describe('checkFfmpeg', () => {
  it('reports a missing binary', async () => {
    await expect(checkFfmpeg('/nonexistent/ffmpeg')).rejects.toMatchObject({
      code: 'FFMPEG_NOT_FOUND',
    })
  })

  it('reports a binary without libx264', async () => {
    // `echo` prints its arguments, so the "encoder list" lacks libx264.
    await expect(checkFfmpeg('echo')).rejects.toMatchObject({
      code: 'FFMPEG_NO_H264',
    })
  })
})

describe('FfmpegEncoder backlog', () => {
  const MB = 1024 * 1024
  let dir: string
  let stalling: string

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-encoder-'))
    // Reads nothing for a while (frames queue up in Node), then drains stdin.
    stalling = path.join(dir, 'stalling-ffmpeg')
    fs.writeFileSync(stalling, '#!/bin/sh\nsleep 1\nexec cat >/dev/null\n', {
      mode: 0o755,
    })
  })

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('counts each distinct frame once, however often it repeats', async () => {
    const encoder = new FfmpegEncoder(stalling, 60, '/dev/null', 2.5 * MB)
    const a = Buffer.alloc(MB, 1)
    const b = Buffer.alloc(MB, 2)
    encoder.write(a)
    for (let i = 0; i < 100; i++) encoder.write(b)
    expect(encoder.backlogged).toBe(false)

    encoder.write(Buffer.alloc(MB, 3))
    expect(encoder.backlogged).toBe(true)

    await encoder.close()
    expect(encoder.backlogged).toBe(false)
  })
})

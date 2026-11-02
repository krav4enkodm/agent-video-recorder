import { createHash } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { gzipSync } from 'zlib'

import {
  bundledFfmpegPath,
  cacheDir,
  resolveFfmpeg,
  staticBuildFor,
  type StaticBuild,
} from './resolve-ffmpeg'

// A stand-in ffmpeg that passes the real checkFfmpeg (it greps -encoders for libx264).
const GOOD_FFMPEG = '#!/bin/sh\necho " V....D libx264  libx264 H.264"\n'
const NO_H264_FFMPEG = '#!/bin/sh\necho " V....D libvpx  VP8"\n'

let tmp: string
let cache: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-resolve-ffmpeg-'))
  cache = path.join(tmp, 'cache')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function script(file: string, body: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body, { mode: 0o755 })
  return file
}

/** A PATH directory holding an `ffmpeg`. */
function pathDir(name: string, body = GOOD_FFMPEG): string {
  const dir = path.join(tmp, name)
  script(path.join(dir, 'ffmpeg'), body)
  return dir
}

const sha256 = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex')

function build(body = GOOD_FFMPEG): StaticBuild {
  return {
    url: 'https://example.invalid/ffmpeg.gz',
    sha256: sha256(body),
    gzBytes: 3_000_000,
  }
}

function fakeFetch(payload: Buffer, status = 200) {
  return jest.fn(
    async () => new Response(status === 200 ? new Uint8Array(payload) : null, { status }),
  ) as unknown as jest.MockedFunction<typeof fetch>
}

function env(extra: Record<string, string | undefined> = {}) {
  return { PATH: path.join(tmp, 'empty'), AVR_CACHE_DIR: cache, ...extra }
}

const bundled = () => bundledFfmpegPath({ AVR_CACHE_DIR: cache })

describe('resolveFfmpeg source order', () => {
  it('uses the ffmpegPath option before $AVR_FFMPEG_PATH and PATH', async () => {
    const option = script(path.join(tmp, 'option/ffmpeg'), GOOD_FFMPEG)
    const fromEnv = script(path.join(tmp, 'env/ffmpeg'), GOOD_FFMPEG)
    await expect(
      resolveFfmpeg({
        explicit: option,
        env: env({ AVR_FFMPEG_PATH: fromEnv, PATH: pathDir('bin') }),
        allowDownload: true,
      }),
    ).resolves.toEqual({ path: option, source: 'option' })
  })

  it('uses $AVR_FFMPEG_PATH before PATH', async () => {
    const fromEnv = script(path.join(tmp, 'env/ffmpeg'), GOOD_FFMPEG)
    await expect(
      resolveFfmpeg({
        env: env({ AVR_FFMPEG_PATH: fromEnv, PATH: pathDir('bin') }),
        allowDownload: true,
      }),
    ).resolves.toEqual({ path: fromEnv, source: 'env' })
  })

  it('uses ffmpeg on PATH before the cached static build', async () => {
    script(bundled(), GOOD_FFMPEG)
    const dir = pathDir('bin')
    const fetch = fakeFetch(Buffer.alloc(0))
    await expect(
      resolveFfmpeg(
        { env: env({ PATH: `${path.join(tmp, 'nope')}${path.delimiter}${dir}` }), allowDownload: true },
        { fetch },
      ),
    ).resolves.toEqual({ path: path.join(dir, 'ffmpeg'), source: 'path' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips a PATH ffmpeg without libx264 and uses the cached build without downloading', async () => {
    script(bundled(), GOOD_FFMPEG)
    const fetch = fakeFetch(Buffer.alloc(0))
    await expect(
      resolveFfmpeg(
        { env: env({ PATH: pathDir('bin', NO_H264_FFMPEG) }), allowDownload: false },
        { fetch },
      ),
    ).resolves.toEqual({ path: bundled(), source: 'bundled' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('resolveFfmpeg with an explicit binary', () => {
  it('throws for a bad ffmpegPath instead of falling back', async () => {
    await expect(
      resolveFfmpeg({
        explicit: path.join(tmp, 'missing/ffmpeg'),
        env: env({ PATH: pathDir('bin') }),
        allowDownload: true,
      }),
    ).rejects.toMatchObject({ code: 'FFMPEG_NOT_FOUND' })
  })

  it('throws for a bad $AVR_FFMPEG_PATH instead of falling back', async () => {
    script(bundled(), GOOD_FFMPEG)
    await expect(
      resolveFfmpeg({
        env: env({
          AVR_FFMPEG_PATH: path.join(tmp, 'missing/ffmpeg'),
          PATH: pathDir('bin'),
        }),
        allowDownload: true,
      }),
    ).rejects.toMatchObject({ code: 'FFMPEG_NOT_FOUND' })
  })

  it('throws FFMPEG_NO_H264 for a chosen binary without libx264', async () => {
    const option = script(path.join(tmp, 'option/ffmpeg'), NO_H264_FFMPEG)
    await expect(
      resolveFfmpeg({ explicit: option, env: env(), allowDownload: true }),
    ).rejects.toMatchObject({ code: 'FFMPEG_NO_H264' })
  })
})

describe('resolveFfmpeg download', () => {
  it('downloads, verifies and caches the static build, logging to the given stream', async () => {
    const fetch = fakeFetch(gzipSync(GOOD_FFMPEG))
    const log = jest.fn()
    await expect(
      resolveFfmpeg(
        { env: env(), allowDownload: true },
        { fetch, log, build: build() },
      ),
    ).resolves.toEqual({ path: bundled(), source: 'bundled' })

    expect(fetch).toHaveBeenCalledWith('https://example.invalid/ffmpeg.gz')
    expect(fs.readFileSync(bundled(), 'utf8')).toBe(GOOD_FFMPEG)
    expect(fs.statSync(bundled()).mode & 0o777).toBe(0o755)
    expect(fs.readdirSync(cache)).toEqual([path.basename(bundled())])
    expect(log).toHaveBeenCalledWith('Downloading ffmpeg (one-time, ~3 MB)…\n')
  })

  it('throws on a checksum mismatch and leaves no cache file', async () => {
    const fetch = fakeFetch(gzipSync('#!/bin/sh\necho tampered libx264\n'))
    await expect(
      resolveFfmpeg(
        { env: env(), allowDownload: true },
        { fetch, log: () => undefined, build: build() },
      ),
    ).rejects.toMatchObject({
      code: 'FFMPEG_DOWNLOAD_FAILED',
      message: expect.stringContaining('SHA-256 mismatch'),
    })
    expect(fs.readdirSync(cache)).toEqual([])
  })

  it('throws on an HTTP error and leaves no cache file', async () => {
    const fetch = fakeFetch(Buffer.alloc(0), 404)
    await expect(
      resolveFfmpeg(
        { env: env(), allowDownload: true },
        { fetch, log: () => undefined, build: build() },
      ),
    ).rejects.toMatchObject({
      code: 'FFMPEG_DOWNLOAD_FAILED',
      message: expect.stringContaining('HTTP 404'),
    })
    expect(fs.readdirSync(cache)).toEqual([])
  })

  it('skips the download when AVR_NO_DOWNLOAD=1', async () => {
    const fetch = fakeFetch(gzipSync(GOOD_FFMPEG))
    await expect(
      resolveFfmpeg(
        { env: env({ AVR_NO_DOWNLOAD: '1' }), allowDownload: true },
        { fetch, build: build() },
      ),
    ).rejects.toMatchObject({
      code: 'FFMPEG_NOT_FOUND',
      message: expect.stringContaining('AVR_NO_DOWNLOAD=1'),
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(fs.existsSync(bundled())).toBe(false)
  })

  it('skips the download when allowDownload is false', async () => {
    const fetch = fakeFetch(gzipSync(GOOD_FFMPEG))
    await expect(
      resolveFfmpeg(
        { env: env(), allowDownload: false },
        { fetch, build: build() },
      ),
    ).rejects.toMatchObject({ code: 'FFMPEG_NOT_FOUND' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws FFMPEG_NOT_FOUND on a platform without a prebuilt binary', async () => {
    const fetch = fakeFetch(gzipSync(GOOD_FFMPEG))
    await expect(
      resolveFfmpeg(
        { env: env(), allowDownload: true },
        { fetch, platform: 'win32', arch: 'x64' },
      ),
    ).rejects.toMatchObject({ code: 'FFMPEG_NOT_FOUND' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('survives two concurrent downloads into the same cache', async () => {
    const run = () =>
      resolveFfmpeg(
        { env: env(), allowDownload: true },
        { fetch: fakeFetch(gzipSync(GOOD_FFMPEG)), log: () => undefined, build: build() },
      )
    const results = await Promise.all([run(), run()])
    expect(results.map((r) => r.source)).toEqual(['bundled', 'bundled'])
    expect(fs.readFileSync(bundled(), 'utf8')).toBe(GOOD_FFMPEG)
    expect(fs.readdirSync(cache)).toEqual([path.basename(bundled())])
  })
})

describe('cache location', () => {
  it('follows XDG_CACHE_HOME on Linux, ~/Library/Caches on macOS, and AVR_CACHE_DIR everywhere', () => {
    expect(cacheDir({ HOME: '/h' }, 'linux')).toBe('/h/.cache/agent-video-recorder')
    expect(cacheDir({ HOME: '/h', XDG_CACHE_HOME: '/x' }, 'linux')).toBe(
      '/x/agent-video-recorder',
    )
    expect(cacheDir({ HOME: '/h' }, 'darwin')).toBe(
      '/h/Library/Caches/agent-video-recorder',
    )
    expect(cacheDir({ HOME: '/h', AVR_CACHE_DIR: '/c' }, 'darwin')).toBe('/c')
    expect(bundledFfmpegPath({ HOME: '/h' }, 'linux', 'arm64')).toBe(
      '/h/.cache/agent-video-recorder/ffmpeg-b6.1.1-linux-arm64',
    )
  })
})

describe('staticBuildFor', () => {
  it.each(['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'])(
    'pins the b6.1.1 build for %s',
    (key) => {
      const [platform, arch] = key.split('-') as [NodeJS.Platform, string]
      expect(staticBuildFor(platform, arch)).toEqual({
        url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-${key}.gz`,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        gzBytes: expect.any(Number),
      })
    },
  )

  it('has no build for Windows', () => {
    expect(staticBuildFor('win32', 'x64')).toBeUndefined()
  })
})

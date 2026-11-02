import { createHash, randomBytes } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'

import { RecorderError } from '../errors'
import { checkFfmpeg, FFMPEG_INSTALL_HINT } from './ffmpeg'

export type FfmpegSource = 'option' | 'env' | 'path' | 'bundled'

export interface ResolvedFfmpeg {
  path: string
  source: FfmpegSource
}

export interface ResolveFfmpegOptions {
  /** The `ffmpegPath` option. Used as given; a failing binary is an error. */
  explicit?: string
  env: Record<string, string | undefined>
  /** Download the static build when nothing else works. `AVR_NO_DOWNLOAD=1` turns it off. */
  allowDownload: boolean
}

export interface StaticBuild {
  url: string
  /** SHA-256 of the decompressed binary. */
  sha256: string
  /** Size of the `.gz` download in bytes, for the progress message. */
  gzBytes: number
}

/** Test seams. Production code passes none of these. */
export interface ResolveFfmpegDeps {
  fetch?: typeof fetch
  check?: (ffmpegPath: string) => Promise<void>
  platform?: NodeJS.Platform
  arch?: string
  /** Replaces the pinned build table entry for the current platform. */
  build?: StaticBuild
  log?: (message: string) => void
}

export const STATIC_FFMPEG_TAG = 'b6.1.1'

const RELEASE_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/${STATIC_FFMPEG_TAG}`

/**
 * GPL ffmpeg 6.1.1 builds with libx264 from eugeneware/ffmpeg-static. They are
 * downloaded to the user's cache, never shipped in the package. The hashes are
 * of the decompressed binary (what ends up on disk), computed from the release
 * assets on 2026-11-02.
 */
const STATIC_BUILDS: Record<string, Omit<StaticBuild, 'url'>> = {
  'linux-x64': {
    sha256: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
    gzBytes: 29_354_986,
  },
  'linux-arm64': {
    sha256: '6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce',
    gzBytes: 25_568_691,
  },
  'darwin-x64': {
    sha256: 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
    gzBytes: 25_296_431,
  },
  'darwin-arm64': {
    sha256: 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
    gzBytes: 19_246_198,
  },
}

/** The pinned static build for this platform, or undefined when there is none (e.g. Windows). */
export function staticBuildFor(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): StaticBuild | undefined {
  const key = `${platform}-${arch}`
  const build = STATIC_BUILDS[key]
  return build && { ...build, url: `${RELEASE_URL}/ffmpeg-${key}.gz` }
}

/** `$AVR_CACHE_DIR`, else the OS cache dir + `agent-video-recorder`. */
export function cacheDir(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env['AVR_CACHE_DIR']) return env['AVR_CACHE_DIR']
  const home = env['HOME'] || os.homedir()
  const base =
    platform === 'darwin'
      ? path.join(home, 'Library', 'Caches')
      : env['XDG_CACHE_HOME'] || path.join(home, '.cache')
  return path.join(base, 'agent-video-recorder')
}

export function bundledFfmpegPath(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return path.join(
    cacheDir(env, platform),
    `ffmpeg-${STATIC_FFMPEG_TAG}-${platform}-${arch}`,
  )
}

export function downloadsDisabled(
  env: Record<string, string | undefined>,
): boolean {
  return env['AVR_NO_DOWNLOAD'] === '1'
}

/**
 * Finds an ffmpeg with libx264: the `ffmpegPath` option, `$AVR_FFMPEG_PATH`,
 * `ffmpeg` on PATH, then a static build cached (and if needed downloaded) by avr.
 */
export async function resolveFfmpeg(
  { explicit, env, allowDownload }: ResolveFfmpegOptions,
  deps: ResolveFfmpegDeps = {},
): Promise<ResolvedFfmpeg> {
  const check = deps.check ?? checkFfmpeg
  const platform = deps.platform ?? process.platform
  const arch = deps.arch ?? process.arch

  // A binary the user chose is never silently replaced.
  if (explicit) {
    await check(explicit)
    return { path: explicit, source: 'option' }
  }
  const fromEnv = env['AVR_FFMPEG_PATH']
  if (fromEnv) {
    await check(fromEnv)
    return { path: fromEnv, source: 'env' }
  }

  const onPath = findOnPath('ffmpeg', env['PATH'], platform)
  if (onPath && (await passes(check, onPath))) {
    return { path: onPath, source: 'path' }
  }

  const bundled = bundledFfmpegPath(env, platform, arch)
  if (fs.existsSync(bundled) && (await passes(check, bundled))) {
    return { path: bundled, source: 'bundled' }
  }

  const build = deps.build ?? staticBuildFor(platform, arch)
  if (!build || !allowDownload || downloadsDisabled(env)) {
    throw new RecorderError(
      'FFMPEG_NOT_FOUND',
      'No ffmpeg with libx264 found on PATH' +
        (!build
          ? ` and there is no prebuilt one for ${platform}-${arch}. `
          : downloadsDisabled(env)
            ? ' and AVR_NO_DOWNLOAD=1 turns off the automatic download. '
            : '. ') +
        FFMPEG_INSTALL_HINT,
    )
  }

  await downloadStaticFfmpeg(build, bundled, {
    fetch: deps.fetch ?? fetch,
    log: deps.log ?? ((message) => process.stderr.write(message)),
  })
  try {
    await check(bundled)
  } catch (error) {
    fs.rmSync(bundled, { force: true })
    throw error
  }
  return { path: bundled, source: 'bundled' }
}

async function passes(
  check: (ffmpegPath: string) => Promise<void>,
  ffmpegPath: string,
): Promise<boolean> {
  return check(ffmpegPath).then(
    () => true,
    () => false,
  )
}

function findOnPath(
  name: string,
  searchPath: string | undefined,
  platform: NodeJS.Platform,
): string | undefined {
  const exts = platform === 'win32' ? ['.exe', ''] : ['']
  for (const dir of (searchPath ?? '').split(path.delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        if (fs.statSync(candidate).isFile()) return candidate
      } catch {
        // not here
      }
    }
  }
  return undefined
}

/**
 * Downloads and gunzips `build` to a temp file next to `target`, checks its
 * SHA-256, then renames it into place, so concurrent runs never see a partial file.
 */
async function downloadStaticFfmpeg(
  build: StaticBuild,
  target: string,
  { fetch, log }: { fetch: typeof globalThis.fetch; log: (m: string) => void },
): Promise<void> {
  function fail(reason: string): never {
    throw new RecorderError(
      'FFMPEG_DOWNLOAD_FAILED',
      `Could not download ffmpeg from ${build.url}: ${reason}. ${FFMPEG_INSTALL_HINT}`,
    )
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`
  const mb = Math.round(build.gzBytes / 1_000_000)
  log(`Downloading ffmpeg (one-time, ~${mb} MB)…\n`)
  try {
    const response = await fetch(build.url).catch((error: Error) =>
      fail(error.message),
    )
    if (!response.ok || !response.body) fail(`HTTP ${response.status}`)

    const total = Number(response.headers.get('content-length')) || build.gzBytes
    let received = 0
    let reported = 0
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        const percent = Math.floor((received / total) * 100)
        if (percent >= reported + 10) {
          reported = percent - (percent % 10)
          log(`  ${Math.min(reported, 100)}%\n`)
        }
        callback(null, chunk)
      },
    })
    const hash = createHash('sha256')
    const hasher = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk)
        callback(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(response.body as import('stream/web').ReadableStream),
      progress,
      createGunzip(),
      hasher,
      fs.createWriteStream(tmp, { mode: 0o755 }),
    ).catch((error: Error) => fail(error.message))

    const actual = hash.digest('hex')
    if (actual !== build.sha256) {
      fail(`SHA-256 mismatch (expected ${build.sha256}, got ${actual})`)
    }
    fs.chmodSync(tmp, 0o755)
    fs.renameSync(tmp, target)
    log(`Saved ffmpeg to ${target}\n`)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

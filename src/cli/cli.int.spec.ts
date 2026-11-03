import { execFile, execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const PACKAGE_ROOT = path.resolve(__dirname, '../..')
const BIN = path.join(PACKAGE_ROOT, 'bin/avr.cjs')
const FIXTURES = path.join(PACKAGE_ROOT, 'test/fixtures')

interface Run {
  code: number
  stdout: string
  stderr: string
}

function avr(
  args: string[],
  env: NodeJS.ProcessEnv = {},
  timeout = 90_000,
): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [BIN, ...args],
      { cwd: PACKAGE_ROOT, env: { ...process.env, ...env }, timeout },
      (error, stdout, stderr) => {
        const code = error ? Number(error.code ?? 1) : 0
        resolve({ code, stdout, stderr })
      },
    )
  })
}

function probe(file: string) {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height',
    '-of',
    'json',
    file,
  ])
  return JSON.parse(out.toString()).streams[0]
}

describe('avr CLI', () => {
  let outDir: string

  beforeAll(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-cli-'))
  })

  afterAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  it('records a scenario and prints the result as JSON', async () => {
    const out = path.join(outDir, 'demo.mp4')
    const run = await avr([
      'record',
      path.join(FIXTURES, 'demo.scenario.ts'),
      '--out',
      out,
    ])

    expect(run.code).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      path: out,
      width: 1920,
      height: 1080,
    })
    expect(probe(out)).toEqual({
      codec_name: 'h264',
      width: 1920,
      height: 1080,
    })
  })

  it('keeps scenario logs and skipped-effect diagnostics off stdout', async () => {
    const out = path.join(outDir, 'noisy.mp4')
    const run = await avr(
      ['record', path.join(FIXTURES, 'noisy.scenario.ts'), '--out', out],
      { AVR_DEBUG: '1' },
    )

    expect(run.code).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ path: out })
    expect(run.stderr).toContain('log from the scenario')
    expect(run.stderr).toContain(
      '[agent-video-recorder] overlay effect skipped:',
    )
  })

  it('exits 1 with the error and keeps the partial video when the scenario fails', async () => {
    // Exiting at all shows the browser was closed: an open one keeps Node alive.
    const out = path.join(outDir, 'failing.mp4')
    const run = await avr([
      'record',
      path.join(FIXTURES, 'failing.scenario.ts'),
      '--out',
      out,
    ])

    expect(run.code).toBe(1)
    expect(run.stderr).toContain(
      'error: SCENARIO_FAILED: scenario step failed on purpose',
    )
    expect(run.stderr).toContain(`partial recording: ${out}`)
    expect(probe(out).codec_name).toBe('h264')
  })

  it('rejects a file that does not export a scenario', async () => {
    const run = await avr(['record', path.join(FIXTURES, 'demo-app.html')])
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('error: SCENARIO_INVALID')
  })

  it('reports a missing ffmpeg from doctor', async () => {
    const run = await avr(['doctor'], { AVR_FFMPEG_PATH: '/nonexistent' })
    expect(run.code).toBe(1)
    expect(run.stdout).toContain('fail  ffmpeg with libx264: FFMPEG_NOT_FOUND')
    expect(run.stdout).toContain('ok    Chromium for Playwright')
  })

  it('downloads a static ffmpeg when PATH has none, then records with it', async () => {
    // A PATH with no ffmpeg, and a temp cache so the real ~/.cache is untouched.
    const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-nopath-'))
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-cache-'))
    const env = { PATH: emptyBin, AVR_CACHE_DIR: cache, AVR_FFMPEG_PATH: '' }
    try {
      const before = await avr(['doctor'], env)
      expect(before.stdout).toContain(
        'ok    ffmpeg with libx264 (bundled, will download on first record',
      )

      const out = path.join(outDir, 'fallback.mp4')
      const run = await avr(
        ['record', path.join(FIXTURES, 'demo.scenario.ts'), '--out', out],
        env,
        240_000,
      )
      expect(run.stderr).toContain('Downloading ffmpeg (one-time, ~')
      expect(run.code).toBe(0)
      // stdout is only the result JSON; download progress went to stderr.
      expect(run.stdout.trim().split('\n')).toHaveLength(1)
      expect(JSON.parse(run.stdout)).toMatchObject({ path: out })
      expect(probe(out).codec_name).toBe('h264')

      const after = await avr(['doctor'], env)
      expect(after.stdout).toContain(
        `ok    ffmpeg with libx264 (bundled, ${path.join(cache, 'ffmpeg-b6.1.1-')}`,
      )
    } finally {
      fs.rmSync(emptyBin, { recursive: true, force: true })
      fs.rmSync(cache, { recursive: true, force: true })
    }
  }, 300_000)

  it('makes a contact sheet PNG of a video and prints its path', async () => {
    // 12 s at 1280x720: one frame every 2 s gives 6 tiles on a 3x5 grid.
    const video = path.join(outDir, 'sheet-src.mp4')
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=12:size=1280x720:rate=30',
      '-pix_fmt',
      'yuv420p',
      video,
    ])
    const out = path.join(outDir, 'sheets', 'sheet.png')

    const run = await avr(['contact-sheet', video, '--out', out])

    expect(run.code).toBe(0)
    expect(run.stdout.trim()).toBe(out)
    expect(fs.readFileSync(out).subarray(1, 4).toString()).toBe('PNG')
    // 3 columns of 640 px; 5 rows of 360 px (scale=640:-1 keeps 16:9).
    expect(probe(out)).toMatchObject({ width: 1920, height: 1800 })
  })

  it('fails contact-sheet for a missing video', async () => {
    const run = await avr([
      'contact-sheet',
      path.join(outDir, 'nope.mp4'),
      '--out',
      path.join(outDir, 'nope.png'),
    ])
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('error: INVALID_OPTIONS: Video not found')
  })

  it('records through the Playwright test fixture', () => {
    const fixtureOut = path.join(outDir, 'fixture')
    execFileSync(
      path.join(PACKAGE_ROOT, 'node_modules/.bin/playwright'),
      ['test', '--config', 'test/playwright-fixture/fixture.config.ts'],
      {
        cwd: PACKAGE_ROOT,
        env: withoutJestWorkerId({ AVR_FIXTURE_OUTPUT_DIR: fixtureOut }),
        stdio: 'pipe',
      },
    )
    const [testDir] = fs
      .readdirSync(fixtureOut, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    const video = path.join(fixtureOut, testDir ?? '', 'recording.mp4')
    expect(probe(video).codec_name).toBe('h264')
  })
})

// Each test points PLAYWRIGHT_BROWSERS_PATH at an empty temp dir, so Chromium
// looks uninstalled. SLOW: the first test downloads Chromium (~170 MB).
describe('avr record on a machine without Chromium', () => {
  let browsersDir: string
  let outDir: string

  beforeEach(() => {
    browsersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-browsers-'))
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-first-run-'))
  })

  afterEach(() => {
    fs.rmSync(browsersDir, { recursive: true, force: true })
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  it('downloads Chromium, records, and prints only the result JSON on stdout (slow: ~170 MB download)', async () => {
    const out = path.join(outDir, 'first-run.mp4')
    const run = await avr(
      ['record', path.join(FIXTURES, 'demo.scenario.ts'), '--out', out],
      { PLAYWRIGHT_BROWSERS_PATH: browsersDir, AVR_NO_DOWNLOAD: '' },
      540_000,
    )

    expect(run.stderr).toContain('Downloading Chromium for Playwright')
    expect(run.code).toBe(0)
    const lines = run.stdout.split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ path: out })
    expect(probe(out).codec_name).toBe('h264')
  }, 600_000)

  it('doctor reports Chromium as downloading on first record, without downloading', async () => {
    const run = await avr(['doctor'], {
      PLAYWRIGHT_BROWSERS_PATH: browsersDir,
      AVR_NO_DOWNLOAD: '',
    })

    expect(run.stdout).toContain(
      `ok    Chromium for Playwright (will download on first record to ${browsersDir}`,
    )
    expect(fs.readdirSync(browsersDir)).toEqual([])
  })

  it('doctor fails naming `avr install` when AVR_NO_DOWNLOAD=1', async () => {
    const run = await avr(['doctor'], {
      PLAYWRIGHT_BROWSERS_PATH: browsersDir,
      AVR_NO_DOWNLOAD: '1',
    })

    expect(run.code).toBe(1)
    expect(run.stdout).toMatch(
      /fail {2}Chromium for Playwright: Not installed at .*Run `avr install`\./,
    )
  })

  it('reports a Chromium that fails to launch as CHROMIUM_LAUNCH_FAILED', async () => {
    const env = { PLAYWRIGHT_BROWSERS_PATH: browsersDir, AVR_NO_DOWNLOAD: '1' }
    // A fake `chrome` passes the "is it installed" check; launch() then runs
    // the headless shell, which is missing.
    const chrome = execFileSync(
      process.execPath,
      ['-p', "require('playwright-core').chromium.executablePath()"],
      { cwd: PACKAGE_ROOT, env: { ...process.env, ...env } },
    )
      .toString()
      .trim()
    fs.mkdirSync(path.dirname(chrome), { recursive: true })
    fs.writeFileSync(chrome, '#!/bin/sh\nexit 1\n', { mode: 0o755 })

    const run = await avr(
      ['record', path.join(FIXTURES, 'demo.scenario.ts')],
      env,
    )

    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/^error: CHROMIUM_LAUNCH_FAILED: \S/m)
    // One line from launchFailureMessage, not Playwright's banner or a stack.
    expect(run.stderr).not.toMatch(/^\s+at /m)
    expect(run.stderr).not.toContain('╔')
    expect(run.stdout).toBe('')
  })

  it('fails naming `avr install` when AVR_NO_DOWNLOAD=1', async () => {
    const run = await avr(
      ['record', path.join(FIXTURES, 'demo.scenario.ts')],
      { PLAYWRIGHT_BROWSERS_PATH: browsersDir, AVR_NO_DOWNLOAD: '1' },
    )

    expect(run.code).toBe(1)
    expect(run.stderr).toContain('avr install')
    expect(run.stderr).not.toContain('Downloading Chromium')
    expect(run.stdout).toBe('')
    expect(fs.readdirSync(browsersDir)).toEqual([])
  })
})

/** Playwright Test refuses to run when it sees Jest's worker variable. */
function withoutJestWorkerId(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra }
  delete env['JEST_WORKER_ID']
  return env
}

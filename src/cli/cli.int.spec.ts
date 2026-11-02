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

function avr(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      'node',
      [BIN, ...args],
      { cwd: PACKAGE_ROOT, env: { ...process.env, ...env }, timeout: 90_000 },
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
    const result = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '')
    expect(result).toMatchObject({ path: out, width: 1920, height: 1080 })
    expect(probe(out)).toEqual({
      codec_name: 'h264',
      width: 1920,
      height: 1080,
    })
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

/** Playwright Test refuses to run when it sees Jest's worker variable. */
function withoutJestWorkerId(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra }
  delete env['JEST_WORKER_ID']
  return env
}

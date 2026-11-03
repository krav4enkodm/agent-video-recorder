import { spawnSync } from 'child_process'
import { Console } from 'console'
import * as fs from 'fs'
import { createRequire } from 'module'
import * as os from 'os'
import * as path from 'path'

import { Command } from 'commander'
import { chromium, type Browser } from 'playwright-core'

import {
  bundledFfmpegPath,
  downloadsDisabled,
  resolveFfmpeg,
  staticBuildFor,
} from '../lib/encoder/resolve-ffmpeg'
import { RecorderError } from '../lib/errors'
import { resolveSize } from '../lib/options'
import { Recorder } from '../lib/recorder'
import { isScenario, type Scenario } from '../lib/scenario'
import { VERSION } from '../lib/version'
import {
  doctorChromium,
  ensureChromium,
  launchFailureMessage,
} from './chromium'
import {
  type ContactSheetFlags,
  makeContactSheet,
  parseContactSheetFlags,
} from './contact-sheet'
import { planRecording, type RecordFlags } from './options'

/** Runs the CLI and resolves to the process exit code. */
export async function main(argv: string[]): Promise<number> {
  let exitCode = 0
  const program = new Command('avr')
    .description('Record polished demo videos of web apps with Playwright.')
    .version(VERSION)

  program
    .command('record')
    .description(
      'Run a scenario file in headless Chromium and save an MP4. Prints the result as JSON.',
    )
    .argument(
      '<scenario>',
      'scenario file (.ts or .js) default-exporting defineScenario(...)',
    )
    .option(
      '--out <file>',
      'MP4 path (default: ./recordings/<name>-<timestamp>.mp4)',
    )
    .option('--resolution <res>', '720p, 1080p or 1440p')
    .option('--fps <fps>', '30 or 60')
    .option(
      '--scale <n>',
      '1, or 2 for a video twice the resolution with the same page layout',
    )
    .option('--pacing <preset>', 'fast, normal or slow')
    .option('--base-url <url>', 'base URL for relative navigation')
    .action(async (scenarioPath: string, flags: RecordFlags) => {
      exitCode = await record(scenarioPath, flags)
    })

  program
    .command('contact-sheet')
    .description(
      'Save a PNG grid of frames from a video, to check a recording at a glance. Prints the PNG path.',
    )
    .argument('<video>', 'video file, e.g. the MP4 from `avr record`')
    .requiredOption('--out <png>', 'PNG path to write')
    .option('--every <seconds>', 'seconds between frames', '2')
    .option('--cols <n>', 'frames per row (5 rows at most)', '3')
    .action(async (video: string, flags: ContactSheetFlags) => {
      exitCode = await contactSheet(video, flags)
    })

  program
    .command('install')
    .description(
      'Download the Chromium build that matches the bundled Playwright version, and a static ffmpeg if no system one has libx264.',
    )
    .option(
      '--with-deps',
      'also install the Linux system libraries Chromium needs (runs sudo)',
    )
    .action(async (flags: { withDeps?: boolean }) => {
      const chromiumCode = install({ withDeps: flags.withDeps === true })
      const ffmpegCode = await installFfmpeg()
      exitCode = chromiumCode || ffmpegCode
    })

  program
    .command('doctor')
    .description('Check that ffmpeg with libx264 and Chromium are available.')
    .action(async () => {
      exitCode = await doctor()
    })

  await program.parseAsync(argv)
  return exitCode
}

async function record(
  scenarioPath: string,
  flags: RecordFlags,
): Promise<number> {
  // stdout carries only the result JSON, so the scenario's own console output
  // (and any library logging) goes to stderr.
  globalThis.console = new Console({
    stdout: process.stderr,
    stderr: process.stderr,
  })

  let scenario: Scenario
  let plan: ReturnType<typeof planRecording>
  try {
    scenario = await loadScenario(path.resolve(scenarioPath))
    plan = planRecording(
      scenario,
      scenarioPath,
      flags,
      new Date(),
      process.cwd(),
    )
  } catch (error) {
    reportError(error, 'SCENARIO_INVALID')
    return 1
  }

  try {
    ensureChromium({
      executablePath: chromium.executablePath(),
      allowDownload: process.env['AVR_NO_DOWNLOAD'] !== '1',
      install: () => install({ withDeps: false }),
      log: (line) => process.stderr.write(`${line}\n`),
    })
  } catch (error) {
    reportError(error, 'CHROMIUM_NOT_FOUND')
    return 1
  }

  const scale = plan.recorder.scale ?? 1
  // Chromium caps screencast frames at CSS pixels unless the whole browser
  // renders at the higher density.
  let browser: Browser
  try {
    browser = await chromium.launch({
      args: scale === 1 ? [] : [`--force-device-scale-factor=${scale}`],
    })
  } catch (error) {
    // Same message as `avr doctor`, e.g. the command for missing Linux libraries.
    reportError(
      new Error(launchFailureMessage(error)),
      'CHROMIUM_LAUNCH_FAILED',
    )
    return 1
  }
  let recorder: Recorder | undefined
  try {
    const context = await browser.newContext({
      viewport: resolveSize(plan.recorder.resolution ?? '1080p'),
      deviceScaleFactor: scale,
      baseURL: plan.baseURL,
    })
    const page = await context.newPage()
    await scenario.setup?.({ page })
    recorder = new Recorder(page, plan.recorder)
    await recorder.start()
    await scenario.run({ page, recorder })
    const result = await recorder.stop()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return 0
  } catch (error) {
    reportError(error, 'SCENARIO_FAILED')
    if (recorder?.isRecording) {
      const partial = await recorder.stop({ holdMs: 0 }).catch(() => undefined)
      if (partial) process.stderr.write(`partial recording: ${partial.path}\n`)
    }
    return 1
  } finally {
    await browser.close()
  }
}

async function contactSheet(
  video: string,
  flags: ContactSheetFlags,
): Promise<number> {
  try {
    const sheet = await makeContactSheet(
      video,
      flags.out,
      parseContactSheetFlags(flags),
    )
    process.stdout.write(`${sheet}\n`)
    return 0
  } catch (error) {
    reportError(error, 'FFMPEG_FAILED')
    return 1
  }
}

async function loadScenario(file: string): Promise<Scenario> {
  if (!fs.existsSync(file)) {
    throw new Error(`Scenario file not found: ${file}`)
  }
  // tsx compiles scenario files (the package itself ships compiled JS). A
  // global registration, unlike tsx.require(), leaves resolved paths
  // untouched: its ?namespace= suffix broke packages that locate files with
  // require.resolve (e.g. esbuild's binary). CommonJS loading keeps
  // extensionless and directory imports working, which ESM resolution rejects.
  registerTsx()
  const mod = createRequire(__filename)(file)
  const exported = mod?.default ?? mod
  if (!isScenario(exported)) {
    throw new Error(
      `${file} must default-export a scenario: export default defineScenario({ run: async ({ page, recorder }) => { ... } })`,
    )
  }
  return exported
}

let tsxRegistered = false

function registerTsx(): void {
  if (tsxRegistered) return
  require('tsx/cjs/api').register()
  tsxRegistered = true
}

// Uses the bundled playwright-core's own installer: `npx playwright install`
// can fetch a different Playwright version whose Chromium build doesn't match.
// Installer output goes to stderr: `avr record` keeps stdout for its result JSON.
function install({ withDeps }: { withDeps: boolean }): number {
  const cli = path.join(
    path.dirname(require.resolve('playwright-core/package.json')),
    'cli.js',
  )
  const args = [cli, 'install', ...(withDeps ? ['--with-deps'] : []), 'chromium']
  if (withDeps) {
    process.stderr.write(
      'Installing Chromium and its system libraries (Linux). This runs sudo and may ask for your password.\n',
    )
  }
  const result = spawnSync(process.execPath, args, {
    stdio: ['ignore', process.stderr, process.stderr],
  })
  return result.status ?? 1
}

// `avr install` is an explicit request to download, so AVR_NO_DOWNLOAD doesn't apply.
async function installFfmpeg(): Promise<number> {
  const env = { ...process.env, AVR_NO_DOWNLOAD: undefined }
  try {
    const ffmpeg = await resolveFfmpeg({ env, allowDownload: true })
    process.stderr.write(`ffmpeg: ${describeFfmpeg(ffmpeg)}\n`)
    return 0
  } catch (error) {
    reportError(error, 'FFMPEG_NOT_FOUND')
    return 1
  }
}

/** Never downloads: reports the static build as pending when it's the only option. */
async function doctorFfmpeg(): Promise<string> {
  const env = process.env
  try {
    return describeFfmpeg(await resolveFfmpeg({ env, allowDownload: false }))
  } catch (error) {
    const canDownload =
      error instanceof RecorderError &&
      error.code === 'FFMPEG_NOT_FOUND' &&
      !env['AVR_FFMPEG_PATH'] &&
      !downloadsDisabled(env) &&
      staticBuildFor() !== undefined
    if (!canDownload) throw error
    return `bundled, will download on first record to ${tildify(bundledFfmpegPath(env))}`
  }
}

function describeFfmpeg(ffmpeg: { path: string; source: string }): string {
  return `${ffmpeg.source}, ${tildify(ffmpeg.path)}`
}

function tildify(file: string): string {
  const home = os.homedir()
  return file.startsWith(home + path.sep) ? `~${file.slice(home.length)}` : file
}

async function doctor(): Promise<number> {
  const checks: Array<[string, () => Promise<string | void>]> = [
    ['ffmpeg with libx264', doctorFfmpeg],
    [
      'Chromium for Playwright',
      () =>
        doctorChromium({
          executablePath: chromium.executablePath(),
          allowDownload: !downloadsDisabled(process.env),
          launch: () => chromium.launch({ headless: true }),
          displayPath: tildify,
        }),
    ],
  ]
  let failed = 0
  for (const [name, check] of checks) {
    try {
      const detail = await check()
      process.stdout.write(`ok    ${name}${detail ? ` (${detail})` : ''}\n`)
    } catch (error) {
      failed++
      process.stdout.write(`fail  ${name}: ${messageOf(error)}\n`)
    }
  }
  return failed ? 1 : 0
}

function reportError(error: unknown, fallbackCode: string): void {
  const message =
    error instanceof RecorderError
      ? error.message
      : `${fallbackCode}: ${messageOf(error)}`
  process.stderr.write(`error: ${message}\n`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

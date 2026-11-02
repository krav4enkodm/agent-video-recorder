import { spawnSync } from 'child_process'
import * as fs from 'fs'
import { createRequire } from 'module'
import * as path from 'path'

import { Command } from 'commander'
import { chromium } from 'playwright-core'

import { checkFfmpeg } from '../lib/encoder/ffmpeg'
import { RecorderError } from '../lib/errors'
import { resolveOptions, resolveSize } from '../lib/options'
import { Recorder } from '../lib/recorder'
import { isScenario, type Scenario } from '../lib/scenario'
import { VERSION } from '../lib/version'
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
    .command('install')
    .description(
      'Download the Chromium build that matches the bundled Playwright version.',
    )
    .action(() => {
      exitCode = install()
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

  const scale = plan.recorder.scale ?? 1
  // Chromium caps screencast frames at CSS pixels unless the whole browser
  // renders at the higher density.
  const browser = await chromium.launch({
    args: scale === 1 ? [] : [`--force-device-scale-factor=${scale}`],
  })
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
function install(): number {
  const cli = path.join(
    path.dirname(require.resolve('playwright-core/package.json')),
    'cli.js',
  )
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
    stdio: 'inherit',
  })
  return result.status ?? 1
}

async function doctor(): Promise<number> {
  const { ffmpegPath } = resolveOptions({})
  const checks: Array<[string, () => Promise<void>]> = [
    ['ffmpeg with libx264', () => checkFfmpeg(ffmpegPath)],
    [
      'Chromium for Playwright',
      async () => {
        const executable = chromium.executablePath()
        if (!fs.existsSync(executable)) {
          throw new Error(
            `Not installed at ${executable}. Run \`avr install\`.`,
          )
        }
      },
    ],
  ]
  let failed = 0
  for (const [name, check] of checks) {
    try {
      await check()
      process.stdout.write(`ok    ${name}\n`)
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

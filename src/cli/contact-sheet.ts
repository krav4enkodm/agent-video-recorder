import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { resolveFfmpeg } from '../lib/encoder/resolve-ffmpeg'
import { RecorderError } from '../lib/errors'

export interface ContactSheetFlags {
  /** Required by commander (`requiredOption`). */
  out: string
  every?: string
  cols?: string
}

export interface ContactSheetPlan {
  /** Seconds between sampled frames. */
  every: number
  cols: number
}

/** Rows on the sheet; frames past `cols × ROWS` are left out. */
const ROWS = 5

export function parseContactSheetFlags(
  flags: Omit<ContactSheetFlags, 'out'>,
): ContactSheetPlan {
  const every = Number(flags.every ?? '2')
  if (!Number.isFinite(every) || every <= 0) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `--every must be a number of seconds above 0, got "${flags.every}"`,
    )
  }
  const cols = Number(flags.cols ?? '3')
  if (!Number.isInteger(cols) || cols < 1) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `--cols must be a whole number of 1 or more, got "${flags.cols}"`,
    )
  }
  return { every, cols }
}

export function contactSheetArgs(
  video: string,
  out: string,
  { every, cols }: ContactSheetPlan,
): string[] {
  return [
    '-v',
    'error',
    '-y',
    '-i',
    video,
    '-vf',
    `fps=1/${every},scale=640:-1,tile=${cols}x${ROWS}`,
    '-frames:v',
    '1',
    out,
  ]
}

/** Writes a PNG grid of frames from `video` with the resolved ffmpeg, and returns its absolute path. */
export async function makeContactSheet(
  video: string,
  out: string,
  plan: ContactSheetPlan,
): Promise<string> {
  const input = path.resolve(video)
  if (!fs.existsSync(input)) {
    throw new RecorderError('INVALID_OPTIONS', `Video not found: ${input}`)
  }
  const output = path.resolve(out)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const ffmpeg = await resolveFfmpeg({ env: process.env, allowDownload: true })
  const { code, stderr } = await run(
    ffmpeg.path,
    contactSheetArgs(input, output, plan),
  )
  if (code !== 0 || !fs.existsSync(output)) {
    throw new RecorderError(
      'FFMPEG_FAILED',
      `ffmpeg exited with code ${code} making the contact sheet: ${stderr.trim()}`,
    )
  }
  return output
}

function run(
  command: string,
  args: string[],
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stderr }))
  })
}

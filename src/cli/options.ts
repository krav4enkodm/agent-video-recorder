import * as path from 'path'

import { RecorderError } from '../lib/errors'
import {
  defaultOutputPath,
  type RecorderOptions,
  type ResolutionPreset,
  type Scale,
} from '../lib/options'
import type { Scenario } from '../lib/scenario'
import type { PacingPreset } from '../lib/timing'

export interface RecordFlags {
  out?: string
  resolution?: string
  fps?: string
  scale?: string
  pacing?: string
  baseUrl?: string
}

export interface RecordPlan {
  recorder: RecorderOptions
  baseURL: string | undefined
}

const PACING_PRESETS: readonly PacingPreset[] = ['fast', 'normal', 'slow']

/** CLI flags win over the scenario's own recorder options. */
export function planRecording(
  scenario: Scenario,
  scenarioPath: string,
  flags: RecordFlags,
  now: Date,
  cwd: string,
): RecordPlan {
  const base = scenario.recorder ?? {}
  const recorder: RecorderOptions = { ...base }
  if (flags.resolution !== undefined) {
    recorder.resolution = parseResolution(flags.resolution)
  }
  if (flags.fps !== undefined) recorder.fps = parseFps(flags.fps)
  if (flags.scale !== undefined) recorder.scale = parseScale(flags.scale)
  if (flags.pacing !== undefined) recorder.pacing = parsePacing(flags.pacing)
  recorder.output = path.resolve(
    cwd,
    flags.out ??
      base.output ??
      defaultOutputPath(now, cwd, scenarioName(scenario, scenarioPath)),
  )
  return { recorder, baseURL: flags.baseUrl ?? scenario.baseURL }
}

export function scenarioName(scenario: Scenario, scenarioPath: string): string {
  const raw =
    scenario.name ??
    path.basename(scenarioPath).replace(/(\.scenario)?\.[cm]?[jt]s$/, '')
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'recording'
  )
}

const RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  '720p',
  '1080p',
  '1440p',
]

function parseScale(value: string): Scale {
  if (value === '1') return 1
  if (value === '2') return 2
  throw invalid('--scale', value, '1 or 2')
}

function parseResolution(value: string): ResolutionPreset {
  const preset = RESOLUTION_PRESETS.find((p) => p === value)
  if (preset) return preset
  throw invalid('--resolution', value, '720p, 1080p or 1440p')
}

function parseFps(value: string): 30 | 60 {
  if (value === '30') return 30
  if (value === '60') return 60
  throw invalid('--fps', value, '30 or 60')
}

function parsePacing(value: string): PacingPreset {
  const preset = PACING_PRESETS.find((p) => p === value)
  if (preset) return preset
  throw invalid('--pacing', value, 'fast, normal or slow')
}

function invalid(flag: string, value: string, expected: string) {
  return new RecorderError(
    'INVALID_OPTIONS',
    `${flag} must be ${expected}, got "${value}".`,
  )
}

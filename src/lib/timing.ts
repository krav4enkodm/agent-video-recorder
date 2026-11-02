import { RecorderError } from './errors'

export interface Timing {
  /** Cursor travel time = base + distance × perPx, clamped to [min, max]. */
  cursorBaseMs: number
  cursorMsPerPx: number
  cursorMinMs: number
  cursorMaxMs: number
  /** Pause after the cursor arrives, before the click. */
  preClickMs: number
  /** Pause after the click, before the next step. */
  postClickMs: number
  /** Delay between typed keys. */
  typingDelayMs: number
  /** Gap after every action. */
  betweenActionsMs: number
  /** Extra pause before an action marked `important`. */
  importantPauseMs: number
  /** Longest wait for navigation and UI animations to finish after an action. */
  settleTimeoutMs: number
  /** How long stop() keeps recording the final state. */
  endHoldMs: number
}

export type PacingPreset = 'fast' | 'normal' | 'slow'

/** A preset, or a preset (default `'normal'`) with individual overrides. */
export type Pacing =
  | PacingPreset
  | (Partial<Timing> & { preset?: PacingPreset })

export const PACING_PRESETS: Record<PacingPreset, Timing> = {
  fast: {
    cursorBaseMs: 150,
    cursorMsPerPx: 0.25,
    cursorMinMs: 200,
    cursorMaxMs: 500,
    preClickMs: 80,
    postClickMs: 150,
    typingDelayMs: 30,
    betweenActionsMs: 200,
    importantPauseMs: 400,
    settleTimeoutMs: 2000,
    endHoldMs: 800,
  },
  normal: {
    cursorBaseMs: 250,
    cursorMsPerPx: 0.4,
    cursorMinMs: 300,
    cursorMaxMs: 900,
    preClickMs: 150,
    postClickMs: 300,
    typingDelayMs: 60,
    betweenActionsMs: 400,
    importantPauseMs: 800,
    settleTimeoutMs: 2000,
    endHoldMs: 1500,
  },
  slow: {
    cursorBaseMs: 400,
    cursorMsPerPx: 0.6,
    cursorMinMs: 500,
    cursorMaxMs: 1400,
    preClickMs: 300,
    postClickMs: 600,
    typingDelayMs: 100,
    betweenActionsMs: 800,
    importantPauseMs: 1500,
    settleTimeoutMs: 3000,
    endHoldMs: 2500,
  },
}

export const NORMAL_TIMING = PACING_PRESETS.normal

export function resolvePacing(pacing: Pacing): Timing {
  const { preset = 'normal', ...overrides } =
    typeof pacing === 'string' ? { preset: pacing } : pacing
  const base = PACING_PRESETS[preset]
  if (!base) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `Unknown pacing preset "${preset}". Use "fast", "normal" or "slow".`,
    )
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RecorderError(
        'INVALID_OPTIONS',
        `pacing.${key} must be a non-negative number, got ${value}.`,
      )
    }
  }
  return { ...base, ...overrides }
}

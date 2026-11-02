export { VERSION } from './lib/version'
export { Recorder, type ActionOptions, type StopOptions } from './lib/recorder'
export type { RecordingResult } from './lib/capture'
export {
  PACING_PRESETS,
  type Pacing,
  type PacingPreset,
  type Timing,
} from './lib/timing'
export { RecorderError, type RecorderErrorCode } from './lib/errors'
export { defineScenario, type Scenario } from './lib/scenario'
export type {
  NarrationOptions,
  NarrationPosition,
  NarrationStyle,
} from './lib/narration'
export type {
  ClickEffectStyle,
  CursorStyle,
  Fps,
  HighlightPreset,
  HighlightStyle,
  RecorderOptions,
  ResolutionPreset,
  Scale,
  Size,
} from './lib/options'

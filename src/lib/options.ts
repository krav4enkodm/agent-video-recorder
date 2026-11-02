import * as path from 'path'

import { RecorderError } from './errors'
import { resolvePacing, type Pacing, type Timing } from './timing'
import type { NarrationStyle } from './narration'

export type ResolutionPreset = '720p' | '1080p' | '1440p'
export type Fps = 30 | 60
export type Scale = 1 | 2

export interface Size {
  width: number
  height: number
}

export interface CursorStyle {
  /** Arrow width in px. Defaults to 24. */
  size?: number
  /** Fill colour. Defaults to `'#111'`. */
  color?: string
  /** Outline colour. Defaults to `'#fff'`. */
  outline?: string
}

export interface ClickEffectStyle {
  /** Ring colour. Defaults to `'rgb(37,99,235)'`. */
  color?: string
  /** Defaults to 500. */
  durationMs?: number
  /** Final ring diameter in px. Defaults to 56. */
  sizePx?: number
  /** Starting opacity, 0–1. Defaults to 0.9. */
  intensity?: number
}

export interface HighlightStyle {
  /** `glow` (soft halo), `outline` (solid border) or `background` (tint). */
  kind: 'outline' | 'background' | 'glow'
  color?: string
  /** Border width for `outline`, glow spread for `glow`. */
  widthPx?: number
  /** Opacity once faded in, 0–1. */
  opacity?: number
}

export type HighlightPreset = 'subtle' | 'strong'
export type ResolvedHighlightStyle = Required<HighlightStyle>

export interface OverlayConfig {
  cursor: Required<CursorStyle> | false
  clickEffect: Required<ClickEffectStyle> | false
  highlight: ResolvedHighlightStyle | false
}

export interface RecorderOptions {
  /** Viewport size, and the video size at scale 1. Defaults to `'1080p'` (1920×1080). */
  resolution?: ResolutionPreset | Size
  /**
   * Pixel density. 2 keeps the `resolution` layout but records a video twice as
   * wide and tall with sharper text. The browser must be launched with
   * `--force-device-scale-factor=2` (and the context with `deviceScaleFactor: 2`).
   * Defaults to 1.
   */
  scale?: Scale
  /** Output frame rate. Defaults to 60. */
  fps?: Fps
  /** MP4 path. Defaults to `./recordings/recording-<YYYYMMDD-HHmmss>.mp4`. */
  output?: string
  /** JPEG quality (1–100) of the captured frames. Defaults to 90. */
  quality?: number
  /**
   * ffmpeg binary with libx264. Defaults to `$AVR_FFMPEG_PATH`, then `ffmpeg`
   * on PATH, then a static build avr downloads to its cache. A path set here or
   * in `$AVR_FFMPEG_PATH` that fails the libx264 check is an error, not a fallback.
   */
  ffmpegPath?: string
  /**
   * Download a static ffmpeg build when no other one works. Defaults to `true`;
   * `AVR_NO_DOWNLOAD=1` turns it off.
   */
  ffmpegDownload?: boolean
  /** Animated cursor. `false` hides it. Defaults to `'smooth'`. */
  cursor?: 'smooth' | false | CursorStyle
  /** Ripple shown on clicks. `false` disables it. On by default. */
  clickEffect?: false | ClickEffectStyle
  /** Frame around the element being acted on. Defaults to `'subtle'`. */
  highlights?: HighlightPreset | false | HighlightStyle
  /** Default caption style for narrate() and step(). */
  narration?: NarrationStyle
  /** Speed of cursor moves, pauses and typing. Defaults to `'normal'`. */
  pacing?: Pacing
}

export interface ResolvedRecorderOptions {
  /** Viewport size in CSS pixels. */
  size: Size
  /** Video size: `size` × scale. */
  videoSize: Size
  fps: Fps
  output: string | undefined
  quality: number
  /** The `ffmpegPath` option; `$AVR_FFMPEG_PATH` and fallbacks are resolved at `start()`. */
  ffmpegPath?: string
  ffmpegDownload: boolean
  overlay: OverlayConfig
  timing: Timing
  narration: NarrationStyle
}

const DEFAULT_CURSOR: Required<CursorStyle> = {
  size: 24,
  color: '#111',
  outline: '#fff',
}

const DEFAULT_CLICK_EFFECT: Required<ClickEffectStyle> = {
  color: 'rgb(37,99,235)',
  durationMs: 500,
  sizePx: 56,
  intensity: 0.9,
}

const PRESETS: Record<ResolutionPreset, Size> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
}

export const DEFAULT_FPS: Fps = 60

export function resolveSize(resolution: ResolutionPreset | Size): Size {
  if (typeof resolution === 'string') {
    const preset = PRESETS[resolution]
    if (!preset) {
      throw new RecorderError(
        'INVALID_OPTIONS',
        `Unknown resolution "${resolution}". Use "720p", "1080p", "1440p" or { width, height }.`,
      )
    }
    return preset
  }
  const { width, height } = resolution
  // libx264 with yuv420p needs even dimensions.
  if (!isEvenPositiveInt(width) || !isEvenPositiveInt(height)) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `Resolution ${width}x${height} is invalid: width and height must be positive even integers.`,
    )
  }
  return { width, height }
}

export function resolveOptions(
  options: RecorderOptions,
): ResolvedRecorderOptions {
  const fps = options.fps ?? DEFAULT_FPS
  if (fps !== 30 && fps !== 60) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `fps must be 30 or 60, got ${fps}.`,
    )
  }
  const scale = options.scale ?? 1
  if (scale !== 1 && scale !== 2) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `scale must be 1 or 2, got ${scale}.`,
    )
  }
  const quality = options.quality ?? 90
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `quality must be an integer from 1 to 100, got ${quality}.`,
    )
  }
  const size = resolveSize(options.resolution ?? '1080p')
  return {
    size,
    videoSize: { width: size.width * scale, height: size.height * scale },
    fps,
    output: options.output,
    quality,
    ffmpegPath: options.ffmpegPath,
    ffmpegDownload: options.ffmpegDownload ?? true,
    overlay: {
      cursor: resolveCursor(options.cursor ?? 'smooth'),
      clickEffect:
        options.clickEffect === false
          ? false
          : { ...DEFAULT_CLICK_EFFECT, ...options.clickEffect },
      highlight: resolveHighlight(options.highlights ?? 'subtle'),
    },
    timing: resolvePacing(options.pacing ?? 'normal'),
    narration: options.narration ?? {},
  }
}

/** `<cwd>/recordings/<name>-<YYYYMMDD-HHmmss>.mp4`, in local time. */
export function defaultOutputPath(
  now: Date,
  cwd: string,
  name = 'recording',
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return path.resolve(cwd, 'recordings', `${name}-${stamp}.mp4`)
}

const HIGHLIGHT_DEFAULTS: Record<
  HighlightStyle['kind'],
  ResolvedHighlightStyle
> = {
  glow: {
    kind: 'glow',
    color: 'rgba(59,130,246,.55)',
    widthPx: 8,
    opacity: 0.9,
  },
  outline: { kind: 'outline', color: '#3b82f6', widthPx: 3, opacity: 1 },
  background: {
    kind: 'background',
    color: 'rgba(59,130,246,.18)',
    widthPx: 0,
    opacity: 1,
  },
}

export function resolveHighlight(
  highlight: HighlightPreset | false | HighlightStyle,
): ResolvedHighlightStyle | false {
  if (highlight === false) return false
  if (highlight === 'subtle') return HIGHLIGHT_DEFAULTS.glow
  if (highlight === 'strong') return HIGHLIGHT_DEFAULTS.outline
  const base = HIGHLIGHT_DEFAULTS[highlight.kind]
  if (!base) {
    throw new RecorderError(
      'INVALID_OPTIONS',
      `Unknown highlight kind "${highlight.kind}". Use "glow", "outline" or "background".`,
    )
  }
  return { ...base, ...highlight }
}

function resolveCursor(
  cursor: 'smooth' | false | CursorStyle,
): Required<CursorStyle> | false {
  if (cursor === false) return false
  if (cursor === 'smooth') return DEFAULT_CURSOR
  return { ...DEFAULT_CURSOR, ...cursor }
}

function isEvenPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n % 2 === 0
}

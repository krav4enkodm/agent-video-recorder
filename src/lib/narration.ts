import type { Size } from './options'

export type NarrationPosition =
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface NarrationStyle {
  /** Defaults to `'bottom'`. */
  position?: NarrationPosition
  /** Defaults to `'fade'`. */
  animation?: 'fade' | 'slide'
  /** Defaults to 36 at 1080p, scaled with the video height. */
  fontSizePx?: number
  /** Widest the caption gets, as a percentage of the viewport. Defaults to 64. */
  maxWidthPct?: number
  /** Defaults to `'#fff'`. */
  color?: string
  /** Defaults to a translucent dark pill, `'rgba(17,17,17,.6)'`. */
  background?: string
}

export interface NarrationOptions extends NarrationStyle {
  /** Hides the caption after this long. By default it stays until the next one. */
  durationMs?: number
}

export type ResolvedNarrationStyle = Required<NarrationStyle>

const BASE_FONT_SIZE_PX = 36
const BASE_HEIGHT_PX = 1080

/** Per-call options win over the recorder's defaults, which win over the built-ins. */
export function resolveNarrationStyle(
  size: Size,
  defaults: NarrationStyle = {},
  call: NarrationStyle = {},
): ResolvedNarrationStyle {
  return {
    position: 'bottom',
    animation: 'fade',
    fontSizePx: Math.round((BASE_FONT_SIZE_PX * size.height) / BASE_HEIGHT_PX),
    maxWidthPct: 64,
    color: '#fff',
    background: 'rgba(17,17,17,.6)',
    ...withoutUndefined(defaults),
    ...withoutUndefined(call),
  }
}

/** How long a caption should stay up so viewers can read it. */
export function readingTimeMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(6000, Math.max(1500, 250 * words))
}

function withoutUndefined(style: NarrationStyle): NarrationStyle {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  )
}

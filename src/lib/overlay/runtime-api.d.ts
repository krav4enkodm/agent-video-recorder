import type { Point } from '../motion/path'
import type { ResolvedNarrationStyle } from '../narration'
import type { OverlayConfig, ResolvedHighlightStyle } from '../options'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface OverlayState {
  visible: boolean
  attached: boolean
  cursor: Point | null
  ripples: number
  highlights: Rect[]
  narration: { text: string; rect: Rect } | null
}

/** What runtime.browser.js installs on `window`. */
export interface RuntimeApi {
  show(config: OverlayConfig, point: Point): void
  hide(): void
  moveCursor(keyframes: Point[], durationMs: number): Promise<void>
  click(point: Point): Promise<void>
  highlight(el: Element, style: ResolvedHighlightStyle): number
  unhighlight(id: number): Promise<void>
  narrate(
    text: string,
    style: ResolvedNarrationStyle,
    animate: boolean,
  ): Promise<void>
  clearNarration(): Promise<void>
  waitForAnimations(timeoutMs: number): Promise<boolean>
  inspect(): OverlayState
}

declare global {
  interface Window {
    __agentVideoRecorder: RuntimeApi
  }
}

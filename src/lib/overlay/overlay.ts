import * as fs from 'fs'
import * as path from 'path'

import { debug } from '../debug'
import {
  cursorDuration,
  cursorPath,
  distance,
  type Point,
} from '../motion/path'
import type { ResolvedNarrationStyle } from '../narration'
import type { OverlayConfig, ResolvedHighlightStyle } from '../options'
import type { Timing } from '../timing'
import type { Disposable, Frame, Locator, Page } from 'playwright-core'

const RUNTIME_SOURCE = fs.readFileSync(
  path.join(__dirname, 'runtime.browser.js'),
  'utf-8',
)

/** Node-side handle on the in-page effects layer. Effect failures are logged, never thrown. */
export class Overlay {
  private initScript: Disposable | undefined
  private cursorAt: Point = { x: 0, y: 0 }
  private needsSync = false
  private narration: { text: string; style: ResolvedNarrationStyle } | undefined
  private narrationTimer: NodeJS.Timeout | undefined
  private readonly onNavigated = (frame: Frame) => {
    if (frame === this.page.mainFrame()) this.needsSync = true
  }

  constructor(
    private readonly page: Page,
    private readonly config: OverlayConfig,
  ) {}

  async attach(start: Point): Promise<void> {
    this.cursorAt = start
    // addInitScript and evaluate both bypass the page's CSP, unlike a <script> tag.
    this.initScript = await this.page.addInitScript({ content: RUNTIME_SOURCE })
    this.page.on('framenavigated', this.onNavigated)
    await this.safely(() => this.page.evaluate(RUNTIME_SOURCE))
    this.needsSync = true
    await this.sync()
  }

  async detach(): Promise<void> {
    clearTimeout(this.narrationTimer)
    this.narration = undefined
    this.page.off('framenavigated', this.onNavigated)
    await this.initScript?.dispose().catch(() => undefined)
    this.initScript = undefined
    await this.safely(() =>
      this.page.evaluate(() => window.__agentVideoRecorder.hide()),
    )
  }

  /** Re-shows the layer, and any caption, after a navigation replaced the document. */
  async sync(): Promise<void> {
    if (!this.needsSync) return
    this.needsSync = false
    await this.safely(() =>
      this.page.evaluate(
        ({ config, point }) => window.__agentVideoRecorder.show(config, point),
        { config: this.config, point: this.cursorAt },
      ),
    )
    const { narration } = this
    if (!narration) return
    await this.safely(() =>
      this.page.evaluate(
        ({ text, style }) =>
          window.__agentVideoRecorder.narrate(text, style, false),
        narration,
      ),
    )
  }

  /** Resolves once the caption has faded in. With `durationMs`, hides it afterwards. */
  async narrate(
    text: string,
    style: ResolvedNarrationStyle,
    durationMs?: number,
  ): Promise<void> {
    clearTimeout(this.narrationTimer)
    const narration = { text, style }
    this.narration = narration
    await this.sync()
    await this.safely(() =>
      this.page.evaluate(
        ({ text, style }) =>
          window.__agentVideoRecorder.narrate(text, style, true),
        narration,
      ),
    )
    if (durationMs === undefined) return
    this.narrationTimer = setTimeout(() => {
      if (this.narration === narration) void this.clearNarration()
    }, durationMs)
    this.narrationTimer.unref()
  }

  async clearNarration(): Promise<void> {
    clearTimeout(this.narrationTimer)
    if (!this.narration) return
    this.narration = undefined
    await this.safely(() =>
      this.page.evaluate(() => window.__agentVideoRecorder.clearNarration()),
    )
  }

  async moveCursor(to: Point, timing: Timing): Promise<void> {
    await this.sync()
    const from = this.cursorAt
    this.cursorAt = to
    const travel = distance(from, to)
    if (!this.config.cursor || travel < 1) return
    await this.safely(() =>
      this.page.evaluate(
        ({ keyframes, durationMs }) =>
          window.__agentVideoRecorder.moveCursor(keyframes, durationMs),
        {
          keyframes: cursorPath(from, to),
          durationMs: cursorDuration(travel, timing),
        },
      ),
    )
  }

  /** Starts the click ripple without waiting for it to finish. */
  click(point: Point): void {
    if (!this.config.clickEffect) return
    void this.safely(() =>
      this.page.evaluate((p) => window.__agentVideoRecorder.click(p), point),
    )
  }

  /**
   * Frames the element until unhighlight(). Returns undefined when highlights
   * are off, the element is inside an iframe, or the overlay failed.
   */
  async highlight(
    target: Locator,
    style: ResolvedHighlightStyle | false = this.config.highlight,
  ): Promise<number | undefined> {
    if (!style) return undefined
    await this.sync()
    // Only the top document's layer is shown, so iframe elements are skipped.
    const id = await this.safely(() =>
      target.evaluate(
        (el, s) =>
          window === window.top
            ? window.__agentVideoRecorder.highlight(el, s)
            : 0,
        style,
      ),
    )
    return id || undefined
  }

  async unhighlight(id: number | undefined): Promise<void> {
    if (id === undefined) return
    await this.safely(() =>
      this.page.evaluate((i) => window.__agentVideoRecorder.unhighlight(i), id),
    )
  }

  private async safely<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (error) {
      debug('overlay effect skipped:', error)
      return undefined
    }
  }
}

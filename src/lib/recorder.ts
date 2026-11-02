import * as fs from 'fs'
import * as path from 'path'

import { Capture, type RecordingResult } from './capture'
import { checkFfmpeg } from './encoder/ffmpeg'
import { RecorderError } from './errors'
import { type Point } from './motion/path'
import {
  readingTimeMs,
  resolveNarrationStyle,
  type NarrationOptions,
} from './narration'
import {
  defaultOutputPath,
  resolveHighlight,
  resolveOptions,
  type HighlightPreset,
  type HighlightStyle,
  type RecorderOptions,
  type ResolvedRecorderOptions,
} from './options'
import { Overlay } from './overlay/overlay'
import { settle } from './settle'
import { type Timing } from './timing'
import type { Frame, Locator, Page } from 'playwright-core'

export interface ActionOptions {
  /** Extra wait before the action starts. */
  pauseBefore?: number
  /** Gap after the action, instead of the pacing's `betweenActionsMs`. */
  pauseAfter?: number
  /** Adds the pacing's `importantPauseMs` before the action so viewers can focus. */
  important?: boolean
}

export interface HighlightOptions {
  /** How long the highlight stays before fading out. Defaults to 1500. */
  durationMs?: number
  /** Defaults to the recorder's `highlights` style, or `'subtle'` when that is off. */
  style?: HighlightPreset | HighlightStyle
}

export interface StopOptions {
  /** How long to keep recording the final state. Defaults to the pacing's `endHoldMs`. */
  holdMs?: number
}

export class Recorder {
  private readonly options: ResolvedRecorderOptions
  private readonly overlay: Overlay
  private readonly timing: Timing
  private capture: Capture | undefined
  private mainFrameNavigations = 0
  private readonly onNavigated = (frame: Frame) => {
    if (frame === this.page.mainFrame()) this.mainFrameNavigations++
  }

  constructor(
    private readonly page: Page,
    options: RecorderOptions = {},
  ) {
    this.options = resolveOptions(options)
    this.overlay = new Overlay(page, this.options.overlay)
    this.timing = this.options.timing
  }

  get isRecording(): boolean {
    return this.capture !== undefined
  }

  async start(): Promise<void> {
    if (this.capture) {
      throw new RecorderError(
        'ALREADY_STARTED',
        'start() was called while already recording; call stop() first.',
      )
    }
    this.assertChromium()
    const { size, videoSize, fps, quality, ffmpegPath } = this.options
    await checkFfmpeg(ffmpegPath)

    const viewport = this.page.viewportSize()
    if (viewport?.width !== size.width || viewport?.height !== size.height) {
      await this.page.setViewportSize(size)
    }

    await this.overlay.attach({ x: size.width / 2, y: size.height / 2 })
    this.page.on('framenavigated', this.onNavigated)

    const output = path.resolve(
      this.options.output ?? defaultOutputPath(new Date(), process.cwd()),
    )
    fs.mkdirSync(path.dirname(output), { recursive: true })

    try {
      this.capture = await Capture.start(this.page, {
        output,
        size: videoSize,
        fps,
        quality,
        ffmpegPath,
      })
    } catch (error) {
      this.page.off('framenavigated', this.onNavigated)
      await this.overlay.detach()
      throw error
    }
  }

  async stop({ holdMs }: StopOptions = {}): Promise<RecordingResult> {
    const capture = this.capture
    if (!capture) {
      throw new RecorderError(
        'NOT_STARTED',
        'stop() was called before start().',
      )
    }
    this.capture = undefined
    this.page.off('framenavigated', this.onNavigated)

    if (!this.page.isClosed()) await sleep(holdMs ?? this.timing.endHoldMs)
    const result = await capture.stop()
    await this.overlay.detach()
    return result
  }

  /** Glides the cursor to the element, then clicks it with a ripple. */
  async click(target: Locator, options: ActionOptions = {}): Promise<void> {
    if (!this.capture) return target.click()
    await this.pointerAction(target, options, () => target.click())
  }

  async hover(target: Locator, options: ActionOptions = {}): Promise<void> {
    if (!this.capture) return target.hover()
    await this.pointerAction(target, options)
  }

  /** Clicks the field, then types key by key like a person. */
  async type(
    target: Locator,
    text: string,
    options: ActionOptions = {},
  ): Promise<void> {
    if (!this.capture) {
      await target.click()
      return target.pressSequentially(text)
    }
    await this.pointerAction(target, options, async () => {
      await target.click()
      await target.pressSequentially(text, { delay: this.timing.typingDelayMs })
    })
  }

  async press(key: string, options: ActionOptions = {}): Promise<void> {
    if (!this.capture) return this.page.keyboard.press(key)
    const navigations = await this.beforeAction(options)
    await this.page.keyboard.press(key)
    await this.afterAction(navigations, options)
  }

  async selectOption(
    target: Locator,
    values: string | string[],
    options: ActionOptions = {},
  ): Promise<void> {
    const select = async () => {
      await target.selectOption(values)
    }
    if (!this.capture) return select()
    await this.pointerAction(target, options, select)
  }

  async goto(url: string): Promise<void> {
    const navigations = this.mainFrameNavigations
    await this.page.goto(url)
    if (this.capture) await this.afterAction(navigations, {})
  }

  /**
   * Shows a caption that stays until the next narrate(), clearNarration(),
   * the end of the enclosing step(), stop(), or `options.durationMs`.
   * Does nothing before start().
   */
  async narrate(text: string, options: NarrationOptions = {}): Promise<void> {
    if (!this.capture) return
    const { durationMs, ...style } = options
    await this.overlay.narrate(
      text,
      resolveNarrationStyle(this.options.size, this.options.narration, style),
      durationMs,
    )
  }

  async clearNarration(): Promise<void> {
    await this.overlay.clearNarration()
  }

  /**
   * Captions a stage of the scenario: shows `text`, runs `fn`, keeps the caption
   * up long enough to read, then hides it. Returns what `fn` returns.
   */
  async step<T>(
    text: string,
    fn: () => Promise<T>,
    options: Omit<NarrationOptions, 'durationMs'> = {},
  ): Promise<T> {
    if (!this.capture) return fn()
    const shownAt = Date.now()
    await this.narrate(text, options)
    try {
      const result = await fn()
      const unread = readingTimeMs(text) - (Date.now() - shownAt)
      if (unread > 0 && this.capture) await sleep(unread)
      return result
    } finally {
      await this.clearNarration()
    }
  }

  /** Frames an element for a while to draw attention to it, without acting on it. */
  async highlight(
    target: Locator,
    { durationMs = 1500, style }: HighlightOptions = {},
  ): Promise<void> {
    if (!this.capture) return
    await target.scrollIntoViewIfNeeded()
    const id = await this.overlay.highlight(
      target,
      resolveHighlight(style ?? (this.options.overlay.highlight || 'subtle')),
    )
    await sleep(durationMs)
    await this.overlay.unhighlight(id)
  }

  /** Holds the current frame, e.g. to let viewers read a result. */
  async pause(ms: number): Promise<void> {
    await sleep(ms)
  }

  /** Waits for a result to appear, then for the UI to finish animating. */
  async waitFor(
    target: Locator,
    options: Parameters<Locator['waitFor']>[0] = {},
  ): Promise<void> {
    const navigations = this.mainFrameNavigations
    await target.waitFor({ state: 'visible', ...options })
    if (!this.capture) return
    await this.overlay.sync()
    await this.settle(navigations)
  }

  /** Highlights the target and glides the cursor to it; with `act`, also clicks with a ripple. */
  private async pointerAction(
    target: Locator,
    options: ActionOptions,
    act?: () => Promise<void>,
  ): Promise<void> {
    const navigations = await this.beforeAction(options)
    await target.scrollIntoViewIfNeeded()
    const highlight = await this.overlay.highlight(target)
    const point = await this.moveTo(target)
    if (act) {
      await sleep(this.timing.preClickMs)
      if (point) this.overlay.click(point)
      await act()
    }
    await sleep(this.timing.postClickMs)
    void this.overlay.unhighlight(highlight)
    await this.afterAction(navigations, options)
  }

  private async moveTo(target: Locator): Promise<Point | undefined> {
    const box = await target.boundingBox()
    if (!box) return undefined
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await this.overlay.moveCursor(point, this.timing)
    // Moves the real mouse too, so the page shows its hover state.
    await this.page.mouse.move(point.x, point.y)
    return point
  }

  /** Returns the navigation count, so afterAction can tell whether the action navigated. */
  private async beforeAction(options: ActionOptions): Promise<number> {
    const pause =
      (options.important ? this.timing.importantPauseMs : 0) +
      (options.pauseBefore ?? 0)
    if (pause > 0) await sleep(pause)
    return this.mainFrameNavigations
  }

  private async afterAction(
    navigationsBefore: number,
    options: ActionOptions,
  ): Promise<void> {
    await this.overlay.sync()
    await this.settle(navigationsBefore)
    await sleep(options.pauseAfter ?? this.timing.betweenActionsMs)
  }

  private settle(navigationsBefore: number): Promise<void> {
    return settle(this.page, {
      navigated: this.mainFrameNavigations !== navigationsBefore,
      timeoutMs: this.timing.settleTimeoutMs,
    })
  }

  private assertChromium(): void {
    const name = this.page.context().browser()?.browserType().name()
    if (name !== undefined && name !== 'chromium') {
      throw new RecorderError(
        'UNSUPPORTED_BROWSER',
        `Recording needs Chromium, got ${name}. Launch the page with chromium.launch().`,
      )
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

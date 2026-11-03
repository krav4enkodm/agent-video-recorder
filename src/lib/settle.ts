import { debug } from './debug'
import type { Page } from 'playwright-core'

/**
 * Waits, at most `timeoutMs` in total, for a navigation to load and for the
 * page's own finite animations to finish. Never throws: hitting the cap just
 * means the video moves on.
 */
export async function settle(
  page: Page,
  { navigated, timeoutMs }: { navigated: boolean; timeoutMs: number },
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  try {
    if (navigated) await page.waitForLoadState('load', { timeout: timeoutMs })
    const remaining = deadline - Date.now()
    const finished =
      remaining > 0 &&
      (await page.evaluate(
        (ms) => window.__agentVideoRecorder.waitForAnimations(ms),
        remaining,
      ))
    if (!finished) {
      debug(`UI still animating after ${timeoutMs} ms; continuing.`)
    }
  } catch (error) {
    debug('settle wait cut short:', error)
  }
}

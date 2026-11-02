import * as fs from 'fs'

/** The bundled playwright-core version; its Chromium build is the one `avr` launches. */
export const PLAYWRIGHT_VERSION: string =
  require('playwright-core/package.json').version

export interface EnsureChromiumDeps {
  executablePath: string
  /** False when `AVR_NO_DOWNLOAD=1`. */
  allowDownload: boolean
  /** Runs the bundled installer and returns its exit code. */
  install: () => number
  log: (line: string) => void
  exists?: (file: string) => boolean
}

/**
 * Downloads Chromium on first use, so `avr record` works without a separate
 * `avr install`. Throws when it is missing and can't be downloaded.
 */
export function ensureChromium(deps: EnsureChromiumDeps): void {
  const exists = deps.exists ?? fs.existsSync
  if (exists(deps.executablePath)) return
  if (!deps.allowDownload) {
    throw new Error(
      `Chromium for Playwright ${PLAYWRIGHT_VERSION} is not installed at ${deps.executablePath} and AVR_NO_DOWNLOAD=1 blocks the download. Run \`avr install\`.`,
    )
  }
  deps.log(
    `Downloading Chromium for Playwright ${PLAYWRIGHT_VERSION} (one-time)…`,
  )
  const code = deps.install()
  if (code !== 0) {
    throw new Error(
      `Chromium download failed (exit code ${code}). Run \`avr install\` to retry.`,
    )
  }
}

/**
 * Launches headless Chromium and closes it. Rewrites the failure Playwright
 * reports for missing Linux libraries into the command that installs them.
 */
export async function checkChromiumLaunch(
  launch: () => Promise<{ close: () => Promise<void> }>,
): Promise<void> {
  let browser: { close: () => Promise<void> }
  try {
    browser = await launch()
  } catch (error) {
    throw new Error(launchFailureMessage(error))
  }
  await browser.close()
}

export function launchFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Playwright 1.64's own check looks in chrome-linux/ while the build ships
  // chrome-linux64/, so it never fires. Then the only trace of a missing
  // library is the dynamic loader's error in the browser log.
  if (
    message.includes('Host system is missing dependencies') ||
    message.includes('error while loading shared libraries')
  ) {
    return `Missing system libraries. Run: sudo npx playwright-core@${PLAYWRIGHT_VERSION} install-deps chromium`
  }
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  return firstLine ?? 'Chromium failed to launch'
}

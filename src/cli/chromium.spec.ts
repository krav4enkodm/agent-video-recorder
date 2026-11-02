import {
  PLAYWRIGHT_VERSION,
  checkChromiumLaunch,
  ensureChromium,
} from './chromium'

const MISSING_DEPS = `browserType.launch:
╔══════════════════════════════════════════════════════╗
║ Host system is missing dependencies to run browsers. ║
║ Please install them with the following command:      ║
║                                                      ║
║     sudo npx playwright install-deps                 ║
╚══════════════════════════════════════════════════════╝`

describe('checkChromiumLaunch (doctor)', () => {
  it('maps the missing-dependencies error to the install-deps hint', async () => {
    const launch = jest.fn().mockRejectedValue(new Error(MISSING_DEPS))
    await expect(checkChromiumLaunch(launch)).rejects.toThrow(
      `Missing system libraries. Run: sudo npx playwright-core@${PLAYWRIGHT_VERSION} install-deps chromium`,
    )
  })

  it('maps a shared-library load failure in the browser log to the same hint', async () => {
    const launch = jest.fn().mockRejectedValue(
      new Error(`browserType.launch: Target page, context or browser has been closed
Browser logs:

<launched> pid=105
[pid=105][err] /root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell: error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory`),
    )
    await expect(checkChromiumLaunch(launch)).rejects.toThrow(
      `Missing system libraries. Run: sudo npx playwright-core@${PLAYWRIGHT_VERSION} install-deps chromium`,
    )
  })

  it('reports only the first line of other launch errors', async () => {
    const launch = jest
      .fn()
      .mockRejectedValue(
        new Error('browserType.launch: Failed to launch\nCall log:\n  - stuff'),
      )
    await expect(checkChromiumLaunch(launch)).rejects.toThrow(
      /^browserType\.launch: Failed to launch$/,
    )
  })

  it('closes the browser when the launch succeeds', async () => {
    const close = jest.fn().mockResolvedValue(undefined)
    await checkChromiumLaunch(async () => ({ close }))
    expect(close).toHaveBeenCalled()
  })

  it('uses the bundled playwright-core version', () => {
    expect(PLAYWRIGHT_VERSION).toBe(
      require('playwright-core/package.json').version,
    )
  })
})

describe('ensureChromium', () => {
  const base = { executablePath: '/browsers/chrome', log: jest.fn() }

  it('does nothing when Chromium is installed', () => {
    const install = jest.fn()
    ensureChromium({
      ...base,
      allowDownload: true,
      install,
      exists: () => true,
    })
    expect(install).not.toHaveBeenCalled()
  })

  it('downloads a missing Chromium and says so', () => {
    const install = jest.fn().mockReturnValue(0)
    const log = jest.fn()
    ensureChromium({
      ...base,
      log,
      allowDownload: true,
      install,
      exists: () => false,
    })
    expect(install).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      `Downloading Chromium for Playwright ${PLAYWRIGHT_VERSION} (one-time)…`,
    )
  })

  it('names avr install when downloads are disabled', () => {
    const install = jest.fn()
    expect(() =>
      ensureChromium({
        ...base,
        allowDownload: false,
        install,
        exists: () => false,
      }),
    ).toThrow('Run `avr install`')
    expect(install).not.toHaveBeenCalled()
  })

  it('fails when the download fails', () => {
    expect(() =>
      ensureChromium({
        ...base,
        allowDownload: true,
        install: () => 1,
        exists: () => false,
      }),
    ).toThrow('Chromium download failed (exit code 1)')
  })
})

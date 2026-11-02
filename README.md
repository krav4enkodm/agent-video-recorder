# agent-video-recorder

Records polished demo videos of web apps from Playwright scripts, with a smooth
cursor, click effects, element highlights, text narration and natural pacing.
It is built for AI coding agents to run without manual editing. Everything runs
locally, and the app you record never needs it as a dependency.

## Install

Install it once per machine, not per project:

```bash
git clone <this repo> ~/Projects/agent-video-recorder
cd ~/Projects/agent-video-recorder && pnpm install
npm install -g .     # puts `avr` on PATH (linked, so pulls take effect)
avr install          # downloads the Chromium build matching the bundled Playwright
avr doctor           # checks ffmpeg/libx264 and Chromium
```

Scenario files need no imports, so any project can be recorded without adding
this package to it.

## Quick start

### Scenario file + CLI

```ts
// checkout.scenario.ts
import { defineScenario } from 'agent-video-recorder'

export default defineScenario({
  baseURL: 'http://localhost:3000',
  // Not recorded: sign in, seed data, open the first page.
  setup: async ({ page }) => {
    await page.goto('/')
  },
  run: async ({ page, recorder }) => {
    await recorder.step('Pick a plan and check out.', async () => {
      await recorder.click(page.getByRole('link', { name: 'Pricing' }))
      await recorder.type(page.getByLabel('Email'), 'alex@example.com')
    })
    await recorder.click(page.getByRole('button', { name: 'Subscribe' }), {
      important: true,
    })
    await recorder.waitFor(page.getByRole('status'))
  },
})
```

```bash
avr record path/to/checkout.scenario.ts [--out video.mp4] \
  [--resolution 720p|1080p|1440p] [--scale 1|2] [--fps 30|60] [--pacing fast|normal|slow] [--base-url URL]
avr doctor   # checks ffmpeg/libx264 and Chromium
```

`record` runs headless Chromium and prints the result as one JSON line
(`path`, `width`, `height`, `fps`, `durationMs`, …). On failure it exits 1,
prints `error: <CODE>: <message>` to stderr and keeps the partial video.
`defineScenario` (from the package) is optional; it only adds type checking in
projects that depend on the package.

### API

```ts
import { Recorder } from 'agent-video-recorder'

const recorder = new Recorder(page, { resolution: '1080p', pacing: 'normal' })
await recorder.start()
await recorder.narrate('Creating a new project')
await recorder.click(page.getByRole('button', { name: 'Create project' }))
const { path } = await recorder.stop()
```

Actions: `click`, `hover`, `type`, `press`, `selectOption`, `goto`, plus
`narrate`, `clearNarration`, `step`, `highlight`, `waitFor`, `pause`.
Before `start()` they are plain Playwright calls without effects. Plain
`page.*` calls are recorded too, just without cursor, click or highlight.

### Sharper video (`scale: 2`)

`scale: 2` keeps the page layout of `resolution` but records twice the pixels,
for example a 1920×1080 layout as a 3840×2160 video that stays sharp full screen
on a 4K monitor. Chromium only renders screencast frames at that density when
the whole browser does, so the CLI's `--scale 2` launches it for you; with the
API, launch it yourself (otherwise `start()` fails with `INVALID_OPTIONS`):

```ts
const browser = await chromium.launch({ args: ['--force-device-scale-factor=2'] })
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
})
const recorder = new Recorder(page, { resolution: '1080p', scale: 2 })
```

### Playwright test fixture

```ts
import { expect, test } from 'agent-video-recorder/test'

test('checkout', async ({ page, recorder }) => {
  await page.goto('/')
  await recorder.start() // video lands in the test output dir as recording.mp4
  await recorder.click(page.getByRole('button', { name: 'Subscribe' }))
})
```

## Configuration

Every option, with defaults, the pacing timings, per-call options, CLI flags and
what is fixed, is in [docs/configuration.md](docs/configuration.md).

## Agent integration

`skills/record-video/SKILL.md` teaches a coding agent the whole loop:
storyboard, scenario file, `avr record`, checking the video, and handing it
over. It names no tools specific to one agent. For Claude Code, link it into
your user skills so every project has it:

```bash
ln -s ~/Projects/agent-video-recorder/skills/record-video ~/.claude/skills/record-video
```

## Requirements

- Node.js 22
- Chromium for the bundled `playwright-core` (pinned), installed with `avr install`
- Optional: `ffmpeg` with the `libx264` encoder on `PATH`, or set `AVR_FFMPEG_PATH`.
  Without one, avr downloads a static ffmpeg build (GPL, ~20–30 MB) to its cache
  on first record (Linux and macOS, x64 and arm64). `AVR_NO_DOWNLOAD=1` turns
  that off.

## Recording performance

Measured on 2026-10-31 (Arch Linux, 32 threads, Playwright 1.62.1, ffmpeg 9.0.2),
recording `test/fixtures/demo-app.html` (continuous CSS animation) for 5 s at
1920×1080:

| Browser mode | Target fps | Captured distinct frames/s | `stop()` latency |
|---|---|---|---|
| headless | 60 | 60.2 | ~40 ms |
| headless | 30 | 59.8 (≥ 30 needed) | ~200 ms |
| headed (Wayland session) | 60 / 30 | no frames within 5 s (`NO_FRAMES`) | — |

So the default is **60 fps** with headless Chromium. Chromium only sends a frame
when the page changes, so `captureFps` in a recording's result is lower whenever
the page is idle; that is expected, not dropped frames.

At higher resolutions (2026-11-01, 4 s of continuous animation, headless, 60 fps),
2560×1440 still captures 60.0 distinct frames/s, while 3840×2160 drops to 47.3,
so 4K motion repeats frames. A larger `resolution` lays the page out wider
rather than rendering it sharper; use `scale: 2` for sharpness. Its 3840×2160
frames have the same ~47 frames/s limit.

Recording is headless-only: headed Chromium delivered no screencast frames on a
Wayland session, and agent-run recordings don't need a window.

## Known limitations

- Effects are drawn inside the page, in a closed shadow root above the app.
  Elements in the browser's top layer (`<dialog>.showModal()`, popovers) render
  above them. Portal-based dialogs (Radix, Headless UI) are not affected.
- A native `<select>`'s option list never appears in the video: Chromium draws
  it as a separate popup outside the page, which the screencast does not
  capture, and `selectOption` sets the value without opening it. The video
  shows the cursor and click on the field, then the new value. Custom
  dropdowns built from page elements (React Select, Radix) record normally;
  open them with `click`.
- Inside iframes, actions still run and the cursor moves to the element's box,
  but no highlight is drawn.
- `scrollIntoViewIfNeeded` scrolls instantly, so off-screen targets cause a
  jump in the video.
- The runtime installs a non-enumerable `window.__agentVideoRecorder` in the
  recorded page while recording.

## Development

```bash
pnpm typecheck
pnpm test               # unit tests
pnpm test:integration   # launches Chromium and ffmpeg
```

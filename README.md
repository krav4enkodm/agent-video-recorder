# agent-video-recorder

Records polished demo videos of web apps from Playwright scripts, with a smooth
cursor, click effects, element highlights, text narration and natural pacing.
It is built for AI coding agents to run without manual editing. Everything runs
locally, and the app you record never needs it as a dependency.

## Install

Nothing is added to the project you record. Pick one:

1. **Claude Code plugin.** It adds the `record-video` skill (see
   [Agent integration](#agent-integration)), which runs the CLI through `npx`:

   ```
   /plugin marketplace add krav4enkodm/agent-video-recorder
   /plugin install agent-video-recorder@agent-video-recorder
   ```

2. **Any shell.** Run it through `npx`, or install the `avr` command globally:

   ```bash
   npx -y agent-video-recorder@0.1 record x.scenario.ts
   npm i -g agent-video-recorder   # then: avr record x.scenario.ts
   ```

The first `avr record` downloads the Chromium build that matches the bundled
Playwright (one-time, about 170 MB). `avr doctor` checks for ffmpeg with
libx264 and Chromium without downloading anything. To download it ahead of time, run
`avr install`. On Linux, `avr install --with-deps` also installs the system
libraries Chromium needs (it runs `sudo`). Set `AVR_NO_DOWNLOAD=1` to turn off
the automatic download.

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
avr contact-sheet video.mp4 --out sheet.png [--every 2] [--cols 3]   # PNG grid of frames
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
storyboard, scenario file, recording, checking the video with a contact sheet,
and handing it over. It runs the CLI with `npx -y agent-video-recorder@0.1`
and names no tools specific to one agent. Claude Code gets it from the plugin
(see [Install](#install)); other agents can load the file as is.

## Requirements

- Node.js 22
- Chromium for the bundled `playwright-core` (pinned). The first `avr record`
  downloads it; `avr install` is optional.
- On Linux, the system libraries Chromium needs. `avr doctor` prints the command
  that installs them, or run `avr install --with-deps`.
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

To use a local checkout as the global `avr`:

```bash
pnpm install && pnpm build
npm link    # `avr` now runs this checkout; `npm unlink -g agent-video-recorder` undoes it
```

To try the plugin from a checkout, run `/plugin marketplace add ./` in Claude
Code from the repo root, then install `agent-video-recorder@agent-video-recorder`.

```bash
pnpm typecheck
pnpm test               # unit tests
pnpm test:integration   # launches Chromium and ffmpeg
```

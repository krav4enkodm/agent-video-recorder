# Configuration reference

Every option `agent-video-recorder` accepts, where to set it, its default, and
what stays fixed. Types are exported from `agent-video-recorder`.

Options can be set in four places. Later ones win:

1. `RecorderOptions`, passed to `new Recorder(page, options)` or the `recorder`
   field of a scenario file.
2. CLI flags on `avr record`, which override the scenario's `recorder` field.
3. Per-call options on the action methods (`click`, `narrate`, …), which apply to
   that call only.
4. The `AVR_FFMPEG_PATH` environment variable is used only when `ffmpegPath` is
   not set.

## Recorder options

`new Recorder(page, options?: RecorderOptions)`. Invalid values throw
`RecorderError` with code `INVALID_OPTIONS` from the constructor.

| Option | Type | Default | Notes |
|---|---|---|---|
| `resolution` | `'720p' \| '1080p' \| '1440p' \| { width, height }` | `'1080p'` | Viewport size in CSS pixels, and the video size at scale 1. Presets are 1280×720, 1920×1080 and 2560×1440. Custom sizes must be positive even integers. `start()` resizes the page to this size. |
| `scale` | `1 \| 2` | `1` | Pixel density. `2` keeps the `resolution` layout and records twice the width and height, for sharp text on 4K screens. See [Scale 2](#scale-2). |
| `fps` | `30 \| 60` | `60` | Output frame rate. The video is constant frame rate. |
| `output` | `string` | `./recordings/recording-<YYYYMMDD-HHmmss>.mp4` | MP4 path, resolved against the current directory. Missing folders are created. |
| `quality` | integer 1–100 | `90` | JPEG quality of the frames Chromium sends before H.264 encoding. `100` removes most of that loss at the cost of throughput. |
| `ffmpegPath` | `string` | `$AVR_FFMPEG_PATH`, then `ffmpeg` | Must be an ffmpeg build with libx264. Playwright's bundled ffmpeg has only VP8. |
| `cursor` | `'smooth' \| false \| CursorStyle` | `'smooth'` | `false` hides the animated cursor. |
| `clickEffect` | `false \| ClickEffectStyle` | on | Ring shown on every click. `false` disables it. |
| `highlights` | `'subtle' \| 'strong' \| false \| HighlightStyle` | `'subtle'` | Frame drawn around each element the recorder acts on. |
| `narration` | `NarrationStyle` | see [Captions](#captions) | Default style for `narrate()` and `step()` captions. |
| `pacing` | `'fast' \| 'normal' \| 'slow' \| Partial<Timing> & { preset? }` | `'normal'` | Speed of cursor moves, pauses and typing. See [Pacing](#pacing). |

### Cursor

`CursorStyle`. Any field you leave out keeps its default.

| Field | Default | Notes |
|---|---|---|
| `size` | `24` | Arrow width in px |
| `color` | `'#111'` | Fill |
| `outline` | `'#fff'` | Outline, so the arrow stays visible on dark backgrounds |

The arrow shape and its motion (a slightly curved path with ease-in-out) are
fixed.

### Click effect

`ClickEffectStyle`. Any field you leave out keeps its default.

| Field | Default | Notes |
|---|---|---|
| `color` | `'rgb(37,99,235)'` | Ring colour. A white halo keeps it visible on buttons of the same colour. |
| `durationMs` | `500` | How long the ring grows and fades |
| `sizePx` | `56` | Final ring diameter |
| `intensity` | `0.9` | Starting opacity, 0–1 |

The effect is always a ring.

### Highlights

The two presets:

| Preset | Equivalent `HighlightStyle` |
|---|---|
| `'subtle'` | `{ kind: 'glow', color: 'rgba(59,130,246,.55)', widthPx: 8, opacity: 0.9 }` |
| `'strong'` | `{ kind: 'outline', color: '#3b82f6', widthPx: 3, opacity: 1 }` |

A custom `HighlightStyle` needs `kind`. Every other field defaults per kind:

| `kind` | `color` | `widthPx` | `opacity` | Looks like |
|---|---|---|---|---|
| `'glow'` | `'rgba(59,130,246,.55)'` | `8` (glow spread) | `0.9` | Soft halo |
| `'outline'` | `'#3b82f6'` | `3` (border width) | `1` | Solid border |
| `'background'` | `'rgba(59,130,246,.18)'` | `0` | `1` | Tinted fill over the element |

The frame is padded 4 px around the element, follows it while it moves, and
fades in and out. Elements inside iframes are not highlighted.

### Captions

`NarrationStyle`, used for the recorder-wide `narration` default and for
per-call options. Per-call values win over the recorder default, which wins over
the built-in defaults.

| Field | Default | Notes |
|---|---|---|
| `position` | `'bottom'` | `'top'`, `'bottom'`, `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` |
| `animation` | `'fade'` | `'fade'` or `'slide'` |
| `fontSizePx` | `36` at 1080p | By default it scales with the resolution's height (24 at 720p, 48 at 1440p) |
| `maxWidthPct` | `64` | Widest the caption gets, as a percentage of the viewport; longer text wraps |
| `color` | `'#fff'` | Text colour |
| `background` | `'rgba(17,17,17,.6)'` | Any CSS background |

The font family and 250 ms transition are fixed. Padding and rounded corners
scale with the font size.

### Pacing

A preset name, or an object that starts from a preset (`'normal'` unless
`preset` is given) and overrides individual timings:

```ts
pacing: { preset: 'slow', typingDelayMs: 40, endHoldMs: 3000 }
```

All values are in milliseconds, except `cursorMsPerPx`:

| `Timing` field | Meaning | `fast` | `normal` | `slow` |
|---|---|---|---|---|
| `cursorBaseMs` | Cursor travel time = base + distance × `cursorMsPerPx` … | 150 | 250 | 400 |
| `cursorMsPerPx` | … per pixel of distance … | 0.25 | 0.4 | 0.6 |
| `cursorMinMs` | … but never shorter than this … | 200 | 300 | 500 |
| `cursorMaxMs` | … nor longer than this | 500 | 900 | 1400 |
| `preClickMs` | Pause after the cursor arrives, before the click | 80 | 150 | 300 |
| `postClickMs` | Pause after the click | 150 | 300 | 600 |
| `typingDelayMs` | Delay between typed keys | 30 | 60 | 100 |
| `betweenActionsMs` | Gap after every action | 200 | 400 | 800 |
| `importantPauseMs` | Extra pause before an action marked `important` | 400 | 800 | 1500 |
| `settleTimeoutMs` | Longest wait for navigation and animations after an action | 2000 | 2000 | 3000 |
| `endHoldMs` | How long `stop()` keeps recording the final state | 800 | 1500 | 2500 |

The presets are exported as `PACING_PRESETS`.

After each action the recorder waits for any navigation to load, then for
running finite CSS animations and transitions, up to `settleTimeoutMs`. Hitting
the limit logs `UI still animating after … ms; continuing.` and recording goes
on.

### Scale 2

Chromium only sends higher-density screencast frames when the whole browser
renders at that density, so a page-level `deviceScaleFactor` alone is not
enough. The CLI's `--scale 2` launches the browser correctly. With the API,
launch it yourself:

```ts
const browser = await chromium.launch({
  args: ['--force-device-scale-factor=2'],
})
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
})
const recorder = new Recorder(page, { resolution: '1080p', scale: 2 })
```

`start()` checks the size of the first frame. If the browser was not launched
this way, it fails with `INVALID_OPTIONS` rather than recording at half size.
At 3840×2160 Chromium delivers about 47 new frames per second, so fast motion
occasionally repeats a frame.

## Per-call options

### Actions

`click`, `hover`, `type`, `press` and `selectOption` take `ActionOptions`:

| Field | Default | Notes |
|---|---|---|
| `pauseBefore` | `0` | Extra wait before the action starts |
| `pauseAfter` | pacing's `betweenActionsMs` | Gap after the action, replacing the default |
| `important` | `false` | Adds the pacing's `importantPauseMs` before the action so viewers can focus |

`goto(url)` takes no options. `waitFor(locator, options?)` takes Playwright's
`locator.waitFor` options (for example `timeout`), and its `state` defaults to
`'visible'`. After the element appears it also waits for the UI to settle.

Before `start()` the action methods are plain Playwright calls with no pauses or
effects. `page.*` calls made during a recording are captured too, but without
the cursor, click ring or highlight.

### Captions

| Call | Options | Behaviour |
|---|---|---|
| `narrate(text, options?)` | `NarrationStyle` plus `durationMs` | Without `durationMs` the caption stays until the next `narrate()`, `clearNarration()`, the end of the enclosing `step()`, or `stop()` |
| `step(text, fn, options?)` | `NarrationStyle` | Shows the caption, runs `fn`, keeps the caption up long enough to read (250 ms per word, 1.5–6 s), then hides it |
| `clearNarration()` | — | Hides the current caption |

### Other calls

| Call | Options | Default |
|---|---|---|
| `highlight(locator, options?)` | `durationMs`, `style` (`HighlightPreset \| HighlightStyle`) | 1500 ms. The style is the recorder's `highlights` setting, or `'subtle'` when that is `false` |
| `pause(ms)` | — | Holds the current frame |
| `stop(options?)` | `holdMs` | The pacing's `endHoldMs` |

## Scenario files

`defineScenario({...})`, default-exported from a `.ts` or `.js` file and run
with `avr record`:

| Field | Required | Notes |
|---|---|---|
| `run({ page, recorder })` | yes | The recorded part |
| `setup({ page })` | no | Runs before recording starts: sign in, seed data, open the first page |
| `name` | no | Used in the default output file name. Defaults to the scenario file name. |
| `baseURL` | no | Base URL for relative `page.goto()` and `recorder.goto()` paths |
| `recorder` | no | `RecorderOptions` for this scenario |

## CLI

```bash
avr record <scenario> [--out <file>] [--resolution 720p|1080p|1440p] [--scale 1|2]
                      [--fps 30|60] [--pacing fast|normal|slow] [--base-url <url>]
avr doctor
```

| Flag | Overrides | Default when neither is set |
|---|---|---|
| `--out` | `recorder.output` | `./recordings/<scenario name>-<timestamp>.mp4` |
| `--resolution` | `recorder.resolution` | `1080p` |
| `--scale` | `recorder.scale` | `1` |
| `--fps` | `recorder.fps` | `60` |
| `--pacing` | `recorder.pacing`, only by preset name | `normal` |
| `--base-url` | `baseURL` | none |

Custom resolutions, effect styles and pacing overrides can only be set in the
scenario's `recorder` field. On success the last stdout line is the
`RecordingResult` as JSON. On failure the CLI exits 1, prints
`error: <CODE>: <message>` and keeps a partial video.

The CLI always launches headless Chromium. The page uses `deviceScaleFactor`
equal to `scale`, and the context has no other options. Do sign-in, cookies and
seed data in `setup`. Use `avr doctor` to check for ffmpeg with libx264 and for
Chromium.

## Playwright test fixture

```ts
import { test, expect } from 'agent-video-recorder/test'
```

The `recorder` fixture writes `recording.mp4` to the test's output directory and
stops recording after the test if needed. It takes no other options. For custom
settings, create `new Recorder(page, { ... })` in the test.

## Environment

| Variable | Used for |
|---|---|
| `AVR_FFMPEG_PATH` | ffmpeg binary, when the `ffmpegPath` option is not set |

## Not configurable

- **Output format:** H.264 MP4 only, with libx264 preset `medium`, CRF 18,
  `yuv420p` and limited colour range, and `+faststart`.
- **Browser:** Chromium only; other engines throw `UNSUPPORTED_BROWSER`.
  Recording is headless-only, because headed Chromium on Wayland sends no
  frames.
- **First frame:** `start()` waits up to 5 s for it, then throws `NO_FRAMES`.
- **Effect shapes:** the arrow cursor and its path, the ring click effect, the
  highlight's 4 px padding, and the caption's font and transition.
- **Native `<select>` lists:** Chromium draws them outside the page, so they
  never appear in the video. See the README's known limitations.

## Example configurations

```ts
// Everything off: close to plain Playwright, with readable pauses.
{ cursor: false, clickEffect: false, highlights: false, pacing: 'fast' }

// Presentation: calm, big and easy to follow.
{
  pacing: 'slow',
  cursor: { size: 36 },
  clickEffect: { sizePx: 80, durationMs: 700 },
  highlights: { kind: 'background', color: 'rgba(250,204,21,.35)' },
  narration: { position: 'top', animation: 'slide', fontSizePx: 44 },
}

// Brand colours.
{
  cursor: { size: 30, color: '#7c3aed' },
  clickEffect: { color: '#f97316', sizePx: 90, durationMs: 650, intensity: 1 },
  highlights: { kind: 'glow', color: 'rgba(249,115,22,.65)', widthPx: 14 },
  narration: { position: 'top-right', animation: 'slide', background: '#7c3aed', maxWidthPct: 32 },
}

// Slow typing and a long pause before the key click.
{ pacing: { preset: 'normal', typingDelayMs: 140, importantPauseMs: 2000 } }

// Smallest files.
{ resolution: '720p', fps: 30 }

// Sharp on 4K screens (launch the browser as shown in Scale 2).
{ resolution: '1080p', scale: 2 }
```

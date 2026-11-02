---
name: record-video
description: Record a polished MP4 walkthrough of a web app with agent-video-recorder (smooth cursor, click effects, highlights, captions, natural pacing) by writing a scenario file and running the agent-video-recorder CLI through npx. Use when someone asks to record a video, screencast or MP4 demo of a web app or feature. Triggers: "/record-video", "record a video of X", "make an MP4 walkthrough", "screencast this flow".
argument-hint: "What to show, and the app URL if it isn't obvious"
user-invocable: true
---

# Record a video

You write a short scenario file, run it with the agent-video-recorder CLI in
headless Chromium, check the result yourself and hand over an MP4. The user
never touches the browser.

Every command runs the CLI through `npx -y agent-video-recorder@0.1`, so
nothing needs installing first. The first run downloads the CLI, the Chromium
build it needs (about 170 MB) and, if the machine has no ffmpeg with libx264,
a static ffmpeg (about 30 MB). Later runs reuse them.

**If the project has its own demo skill** (for example one that knows its test
accounts and personal-data rules), use that instead. `record-video` is the
generic recorder.

**Unattended mode.** When another agent runs this skill without a human
watching (for example a `work-work` worker whose brief says so), build the
storyboard from the ticket's "Done when" items, skip the approval in step 2,
and save the video where the caller asks. Step 5's checks still apply in
full: if one fails and can't be fixed, report that instead of the video.

## 1. Check prerequisites

- The app must be reachable (e.g. `curl -sI http://localhost:3000`). If it
  isn't, ask the user to start it rather than guessing how.
- Run `npx -y agent-video-recorder@0.1 doctor`. Lines starting with `ok`
  need nothing, including ones that say a download happens on the first
  record. For a `fail` line, show it to the user with the command it
  suggests (for missing Linux libraries that runs `sudo`) and wait for them
  to fix it.

## 2. Propose a storyboard

Before writing code, reply with 3–8 numbered steps: the actions, and the
caption shown during each (if any). Keep it under about 90 seconds of video.

```
Start: /projects (signed in as demo user, done before recording)
1. "Projects are grouped by team."      → click "Team A" in the sidebar
2. "Creating one takes a name and a template." → click New project, type name, pick "Kanban"
3. (no caption)                          → click Create, wait for the success toast
```

Wait for approval, unless the user said to go ahead.

## 3. Write the scenario

Write it in a scratch or temp folder, never in the project's source tree. It
needs **no imports**:

```ts
// <scratch>/<name>.scenario.ts
export default {
  name: 'create-project',              // used in the default file name
  baseURL: 'http://localhost:3000',
  recorder: { pacing: 'normal' },      // optional, see the cheat sheet
  // Not recorded: sign in, seed data, open the first page.
  setup: async ({ page }) => {
    await page.goto('/projects')
  },
  // Recorded.
  run: async ({ page, recorder }) => {
    await recorder.step('Projects are grouped by team.', async () => {
      await recorder.click(page.getByRole('link', { name: 'Team A' }))
    })
    await recorder.step('Creating one takes a name and a template.', async () => {
      await recorder.click(page.getByRole('button', { name: 'New project' }))
      await recorder.type(page.getByLabel('Name'), 'Apollo')
      await recorder.selectOption(page.getByLabel('Template'), 'kanban')
    })
    await recorder.click(page.getByRole('button', { name: 'Create' }), { important: true })
    await recorder.waitFor(page.getByText('Project created'))
  },
}
```

(Inside a project that depends on `agent-video-recorder`, you can wrap the
object in `defineScenario(...)` from the package for type checking.)

Rules:

- Do all sign-in and data setup in `setup`. Captions and typed text are in the
  video, so **never type a password, token or other secret inside `run`**.
- Act through `recorder.*` so the cursor, click ring and highlight appear.
  Plain `page.click()` still works but shows no effects.
- Use role and label locators (`getByRole`, `getByLabel`, `getByText`).
- After an action that loads something, wait for the result with
  `recorder.waitFor(locator)`. Never use fixed sleeps to synchronise;
  `recorder.pause(ms)` is only for letting viewers read.
- Don't call `recorder.start()` or `recorder.stop()`; the CLI does that.
- Captions explain what the screen can't show by itself: why a step matters.
  Keep them under about 20 words, and use 2–4 per video.
- Don't show other people's personal data. Filter lists to test data in
  `setup` before recording starts.

## 4. Record

```bash
npx -y agent-video-recorder@0.1 record <scratch>/<name>.scenario.ts --out <scratch>/<name>.mp4
```

Options: `--resolution 720p|1080p|1440p` (default 1080p), `--scale 2` (same
layout, twice the pixels; sharper on 4K screens), `--fps 30|60` (default
60), `--pacing fast|normal|slow`, `--base-url URL`. On success, the last
JSON line on stdout is the result (`path`, `durationMs`, …). On failure, the
CLI exits 1, prints `error: <CODE>: <message>` and keeps a partial video.
Fix the scenario using the table below and record again.

| Code | Meaning and fix |
|---|---|
| `SCENARIO_INVALID` | File missing, or no default export with a `run` function |
| `SCENARIO_FAILED` | `setup` or `run` threw: read the message (usually a locator that matched nothing or a timeout), check the partial video, fix the step |
| `INVALID_OPTIONS` | Bad flag or `recorder` option value; the message names it |
| `CHROMIUM_NOT_FOUND` | Chromium couldn't be downloaded or started; the message says why (often missing Linux libraries, as in step 1) |
| `FFMPEG_NOT_FOUND` / `FFMPEG_NO_H264` / `FFMPEG_DOWNLOAD_FAILED` | No usable ffmpeg and the download failed or is off (`AVR_NO_DOWNLOAD=1`). Install ffmpeg with libx264, or set `AVR_FFMPEG_PATH` |
| `FFMPEG_FAILED` | Encoder crashed; the message includes ffmpeg's output |
| `NO_FRAMES` | Chromium sent no frames: the page never rendered. Check the URL and that the app is up |
| `ALREADY_STARTED` / `NOT_STARTED` | The scenario called `start()`/`stop()`; remove those calls |

## 5. Check the video yourself

Check `durationMs`, `width` and `height` in the result JSON from step 4
against what you planned. Then make a contact sheet, one frame every 2
seconds on a 3-column grid:

```bash
npx -y agent-video-recorder@0.1 contact-sheet <scratch>/<name>.mp4 --out <scratch>/sheet.png
```

It prints the PNG path. `--every <seconds>` and `--cols <n>` change the grid;
it holds at most 5 rows, so for a video longer than about 30 seconds raise
`--every` to cover all of it. Look at the image and check that:

- each caption matches what happens beneath it;
- results the captions mention (dialogs, toasts, new rows) are visible;
- no password, token or other personal data is on screen.

Re-record if anything is off.

## 6. Hand over

Give the video path, size and duration. Mention any step you had to change
from the storyboard. Delete the scenario file unless the user wants to keep it.

## Cheat sheet

| Call | What it does |
|---|---|
| `recorder.click(locator, opts?)` | Highlight, glide cursor, click ring, click |
| `recorder.type(locator, text, opts?)` | Click the field, type key by key |
| `recorder.selectOption(locator, value, opts?)` | Choose in a native `<select>`; its option list is not visible in videos, only the new value |
| `recorder.hover(locator, opts?)` / `recorder.press(key, opts?)` | Hover / keyboard key |
| `recorder.goto(url)` | Navigate during the recording |
| `recorder.narrate(text, { position?, animation?, durationMs? })` | Caption until the next one; `position`: `top`, `bottom`, `top-left`, … |
| `recorder.step(text, async () => { ... })` | Caption a group of actions, hide it afterwards |
| `recorder.highlight(locator, { durationMs? })` | Point at an element without acting |
| `recorder.waitFor(locator)` | Wait for a result and for the UI to settle |
| `recorder.pause(ms)` | Hold the frame so viewers can read |

`opts` for actions: `{ important: true }` adds a pause before the action;
`pauseBefore` / `pauseAfter` in ms. Scenario `recorder` options: `pacing`
(`fast` / `normal` / `slow`), `highlights` (`subtle` / `strong` / `false`),
`cursor: false`, `clickEffect: false`, `narration: { position, fontSizePx }`.
Every option with its default (styles, all pacing timings, per-call options,
CLI flags) is in the package's `docs/configuration.md`.

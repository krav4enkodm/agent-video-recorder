# 03 — ffmpeg fallback when there's no system ffmpeg with libx264

Stack 3/6 (parallel with 04). A machine without a suitable ffmpeg can still
record: avr uses a prebuilt static ffmpeg instead of failing with
`FFMPEG_NOT_FOUND`.

## Scope

- New `src/lib/encoder/resolve-ffmpeg.ts`:
  `resolveFfmpeg({ explicit?, env, allowDownload }): Promise<{ path, source: 'option' | 'env' | 'path' | 'bundled' }>`.
  Order:
  1. `ffmpegPath` option, then `$AVR_FFMPEG_PATH`: used as given; if it fails
     `checkFfmpeg`, throw as today (no silent fallback when the user chose a binary).
  2. `ffmpeg` on PATH, if `checkFfmpeg` passes.
  3. Static build downloaded by avr itself (decided: lazy download, not the
     `ffmpeg-static` package, whose install script pnpm 10 and `--ignore-scripts` skip), cached at
     `${XDG_CACHE_HOME:-~/.cache}/agent-video-recorder/ffmpeg-<tag>-<platform>-<arch>`
     on Linux and `~/Library/Caches/agent-video-recorder/…` on macOS. Pinned to
     release tag `b6.1.1` of `eugeneware/ffmpeg-static`
     (`https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-<platform>-<arch>.gz`;
     all four of `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`
     return 200, checked 2026-11-02). Download to a temp file, gunzip, verify a
     SHA-256 pinned in the source (the implementer computes the four hashes once from the release assets), `chmod 755`, rename into place (atomic, so
     two concurrent runs don't corrupt it), then run `checkFfmpeg` on it.
     Progress and "Downloading ffmpeg (one-time, ~N MB)…" go to **stderr**
     (stdout is reserved for the result JSON).
  4. Otherwise throw `FFMPEG_NOT_FOUND` with the current install hint.
- `src/lib/options.ts:174`: `ffmpegPath` no longer defaults to `'ffmpeg'`;
  leave it `undefined` when not set. `ResolvedOptions.ffmpegPath` becomes optional.
- `src/lib/recorder.ts:79-80`: replace `checkFfmpeg(ffmpegPath)` with
  `resolveFfmpeg(...)` and pass the resolved path to capture.
- `RecorderOptions.ffmpegDownload?: boolean` (default `true`); env
  `AVR_NO_DOWNLOAD=1` disables both this and 04's Chromium download.
- `avr doctor` (`src/cli/main.ts:150`): print which source is used,
  e.g. `ok    ffmpeg with libx264 (bundled, ~/.cache/…)`. Doctor never
  downloads; if only the fallback is possible, print `ok` with
  "will download on first record".
- `avr install`: also fetches the fallback ffmpeg when no system one passes.
- `docs/configuration.md`: update the `ffmpegPath` row (line 28) and the env table (line 244).
- README "Requirements": ffmpeg becomes optional.

## Out of scope

- Chromium download: 04. Skill and contact-sheet command: 05.

## Decisions

- An explicitly chosen binary that fails is an error, not a fallback, so a
  misconfiguration never goes unnoticed.
- The pinned release is GPL-licensed ffmpeg with libx264; it is downloaded to
  the user's cache, not shipped in our tarball, so our package license is unaffected.

## Done when

- Tests (unit, `resolve-ffmpeg.spec.ts`): order of sources; explicit bad path
  throws; checksum mismatch throws and leaves no cache file; download skipped
  when `AVR_NO_DOWNLOAD=1`. Use a local HTTP server or injected fetcher, no network.
- Tests (integration): with `PATH` stripped of ffmpeg and a temp cache dir,
  `avr record test/fixtures/demo.scenario.ts` produces an MP4 (runs on both
  CI OSes, which also proves libx264 in the darwin-arm64 build).
- This machine: `PATH=/usr/bin/false-dir avr doctor` reports the fallback.

# 04 — Install Chromium on first record; doctor checks Linux libraries

Stack 4/6 (parallel with 03). `avr record` works on a fresh machine without a
separate `avr install`, and `avr doctor` explains missing Linux system
libraries instead of a raw Playwright error.

## Scope

- `src/cli/main.ts` `record()`: before `chromium.launch` (line 89), if
  `!fs.existsSync(chromium.executablePath())` and downloads are allowed
  (`process.env.AVR_NO_DOWNLOAD !== '1'`; read directly so this ticket doesn't
  depend on 03, which documents the variable in `docs/configuration.md`), print
  `Downloading Chromium for Playwright <version> (one-time)…` to stderr and run
  the existing `install()`.
- `install()` (line 136): spawn with `stdio: ['ignore', process.stderr, process.stderr]`
  instead of `'inherit'`, so installer output never lands on stdout (the result
  JSON must be the only stdout line). Add `avr install --with-deps`, which
  passes `--with-deps` through (Linux; needs sudo; prints that it will).
- `doctor()` Chromium check: after the existence check, launch headless and
  close. If the error message contains `Host system is missing dependencies`,
  fail with: `Missing system libraries. Run: sudo npx playwright-core@<bundled version> install-deps chromium`
  (version from `playwright-core/package.json`). Other launch errors: print the
  first line of the message.
- README "Install" + "Requirements": `avr install` becomes optional.

## Out of scope

- ffmpeg: 03. Skill wording: 05.

## Done when

- Tests (integration, `cli.int.spec.ts`): with `PLAYWRIGHT_BROWSERS_PATH`
  pointed at an empty temp dir, `avr record` downloads Chromium, records, and
  stdout is exactly one JSON line. With `AVR_NO_DOWNLOAD=1`, it fails with an
  error naming `avr install`.
- Tests (unit): doctor maps the missing-deps message to the hint (launch
  injected/mocked).
- CI (02): green on both OSes.
- Manual, on a Debian/Ubuntu container without browser libs (`docker run node:22`):
  `avr doctor` prints the `install-deps` hint.

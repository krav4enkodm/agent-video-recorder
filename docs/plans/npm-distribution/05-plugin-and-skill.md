# 05 — Claude Code plugin, npx-based skill, README install

Stack 5/6. Installing one Claude Code plugin gives any project the
`record-video` skill, and the skill runs the published CLI through `npx`, so
the user installs nothing else.

## Scope

- `.claude-plugin/marketplace.json` (repo root is the marketplace) with one
  plugin, `"source": "./"`; `.claude-plugin/plugin.json` with name
  `agent-video-recorder`, version matching `package.json`, description,
  author, repository, license. Format copied from an installed marketplace
  (`~/.claude/plugins/marketplaces/cloudflare/.claude-plugin/`).
  `skills/record-video/` is picked up from the default `skills/` folder.
- `skills/record-video/SKILL.md`:
  - Every `avr …` becomes `npx -y agent-video-recorder@0.1 …` (decided:
    first release 0.1.0; a breaking change ships as 0.2 with a skill update). State once at the top that the first
    run downloads the CLI, Chromium and possibly ffmpeg.
  - Step 1: drop "if `avr` isn't on PATH, tell the user to install it";
    `doctor` fails only on missing Linux libraries now (04), show its hint.
  - Step 5 uses `ffprobe` and `ffmpeg` directly, which a machine relying on
    03's fallback doesn't have. Replace with a new CLI command (below) and the
    result JSON (`durationMs`, `width`, `height`).
  - Keep the skill agent-neutral apart from install instructions.
- New CLI command `avr contact-sheet <video> --out <png> [--every 2] [--cols 3]`
  in `src/cli/main.ts`, running the resolved ffmpeg (03) with today's filter
  `fps=1/<every>,scale=640:-1,tile=<cols>x5`. Prints the PNG path.
- `README.md` "Install": two paths —
  1. Claude Code: `/plugin marketplace add krav4enkodm/agent-video-recorder`,
     `/plugin install agent-video-recorder@agent-video-recorder`.
  2. Any shell: `npx -y agent-video-recorder@0.1 record x.scenario.ts`, or
     `npm i -g agent-video-recorder`.
  Remove the clone/`npm install -g .`/symlink instructions; keep a short
  "Development" note on linking a local checkout.
- `version.spec.ts`: also assert `plugin.json` version equals `package.json`.

## Out of scope

- Publishing the npm package and tagging: 06. The skill's npx commands
  only work once 06 has published; until then the plugin is installable but
  not announced in the README's first lines.

## Done when

- Tests: `pnpm test` (version sync); integration test for `contact-sheet`
  producing a PNG.
- This machine, Claude Code: `/plugin marketplace add ./` from the repo,
  install the plugin, `/record-video` is listed; with the symlink in
  `~/.claude/skills/record-video` removed, a recording of
  `test/fixtures/demo-app.html` succeeds using `npm link`-ed `avr` in place of
  npx (npx path verified in 06).

# Distribute agent-video-recorder via npm and a Claude Code plugin

Goal: anyone on macOS or Linux with Node 22 can record a video of any project
by installing a Claude Code plugin (for the skill) and running
`npx -y agent-video-recorder@0.1 record …`. The tool fetches Chromium and,
if needed, ffmpeg on first use. Nothing is installed into the recorded project.

Size: project (6 tickets). No tracker; one Markdown file per ticket.

## Decisions (2026-11-02)

- **A + E**: public npm package (built JS) + Claude Code plugin for the skill.
  Docker and single-binary distribution were rejected.
- **Platforms**: macOS (arm64, x64) and Linux (x64, arm64). Windows is out of scope.
- npm name `agent-video-recorder` is free (`npm view` → 404 on 2026-11-02).
- MIT license. First release `0.1.0`; the skill pins `npx -y agent-video-recorder@0.1`.
- ffmpeg fallback is a lazy download of a pinned static build into the user cache, not the `ffmpeg-static` package.
- Public repo on the personal GitHub account: `krav4enkodm/agent-video-recorder` (created 2026-11-02).
- Same repo is the plugin marketplace: `.claude-plugin/marketplace.json` +
  `.claude-plugin/plugin.json` at the root, existing `skills/` is picked up.

## Stack

| # | Ticket | Blocked by |
|---|---|---|
| 01 | [Build to JS and make the package publishable](01-build-and-pack.md) | — |
| 02 | [CI on Ubuntu and macOS](02-ci.md) | 01 |
| 03 | [ffmpeg fallback when no system ffmpeg with libx264](03-ffmpeg-fallback.md) | 01 |
| 04 | [Install Chromium on first record; doctor checks Linux libraries](04-chromium-first-run.md) | 01 |
| 05 | [Claude Code plugin, npx-based skill, README install](05-plugin-and-skill.md) | 03, 04 |
| 06 | [Release workflow and first npm publish](06-release.md) | 02, 05 |

03 and 04 are independent and can run in parallel. 02 can merge as soon as 01
is in; later tickets get macOS coverage from it.

## Deferred

- Windows support.
- Docker image for identical font rendering across machines.
- Shipping the skill to agents other than Claude Code (`avr skill install`).
- Homebrew formula.

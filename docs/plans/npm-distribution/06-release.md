# 06 — Release workflow and first npm publish

Stack 6/6. Pushing a `v*` tag publishes the package to npm with provenance,
and the first version is live so the plugin's `npx` commands work.

## Scope

- `.github/workflows/release.yml`, on `push` tags `v*`:
  - Re-run 02's checks on `ubuntu-latest` (reuse via `workflow_call`, or
    `needs:` on a copy of the CI job).
  - Fail if the tag doesn't equal `v` + `package.json` version, or
    `plugin.json` version differs.
  - `npm publish --access public --provenance`, `permissions: id-token: write`,
    using npm trusted publishing (OIDC), no long-lived token in secrets.
  - Create a GitHub Release with generated notes.
- `docs/releasing.md`: bump version in `package.json`, `src/lib/version.ts`,
  `.claude-plugin/plugin.json` → commit → `git tag vX.Y.Z` → push tag.

## Out of scope

- Everything that changes the package's behaviour: 01–05.

## Done when

- npm: `npm view agent-video-recorder version` returns `0.1.0`, with a
  provenance badge on npmjs.com.
- Clean macOS machine (or the `macos-latest` runner via a `workflow_dispatch`
  smoke job) and this Linux machine, in an empty directory with no global avr:
  `npx -y agent-video-recorder@0.1 record <demo scenario>` produces an MP4.
- Claude Code on a second machine: add the marketplace from GitHub, install
  the plugin, `/record-video` records a local app end to end.

## Setup (outside the diff)

- [ ] npm account with 2FA, logged in locally — owner: you.
- [ ] First publish of `0.1.0` by hand (`npm publish --access public` from a
      clean checkout of the tagged commit), if npm requires the package to
      exist before a trusted publisher can be added — owner: you.
- [ ] On npmjs.com → package → Settings → Trusted publishing: add the GitHub
      repo and `release.yml` — owner: you.
- [ ] GitHub repo is public (provenance and the plugin marketplace need it) — owner: you.

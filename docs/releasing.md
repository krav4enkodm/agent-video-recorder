# Releasing

Pushing a `v*` tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml).
It:

1. checks that the tag is `v` + the `package.json` version, and that
   `.claude-plugin/plugin.json` and `src/lib/version.ts` state the same version
   (`scripts/check-release-version.mjs`);
2. re-runs the CI checks (`ci.yml`) on `ubuntu-latest`;
3. publishes to npm with `npm publish --access public --provenance` through npm
   trusted publishing (OIDC). There is no npm token in the repository secrets;
4. creates a GitHub Release with generated notes;
5. runs `npx -y agent-video-recorder@<version> record` on Linux and macOS from
   an empty folder.

## Cut a release

1. Bump the version in all three places:
   - `package.json` → `"version"`
   - `src/lib/version.ts` → `VERSION`
   - `.claude-plugin/plugin.json` → `"version"`

   Check them with `node scripts/check-release-version.mjs vX.Y.Z`.
2. Commit on `main`: `git commit -am "chore: release vX.Y.Z"` and push it.
3. Tag that commit and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

4. Watch the **Release** workflow in the Actions tab. If the version check
   fails, delete the tag (`git push origin :vX.Y.Z && git tag -d vX.Y.Z`), fix
   the versions and tag again. npm never accepts the same version twice, so a
   failure after `npm publish` needs a new patch version.

The record-video skill pins `agent-video-recorder@0.1`, so any `0.1.x` reaches
plugin users on their next `npx` run. A breaking change ships as `0.2.0`
together with a skill update.

## Test the pipeline without publishing

Actions → **Release** → **Run workflow** on `main`, with **dry_run** ticked (the
default). It runs the version check and CI, then stops at
`npm publish --dry-run`. A real publish from this form needs a `v*` tag picked
as the ref and **dry_run** unticked; from a branch the run fails.

To re-run only the npx smoke test against a version that is already on npm,
fill in **smoke_version** (for example `0.1.0`).

## One-time setup

- The GitHub repository is public (provenance and the plugin marketplace need it).
- The npm package exists. If npm does not let you add a trusted publisher to a
  package that does not exist yet, publish the first version by hand from a
  clean checkout of the tagged commit: `npm publish --access public`.
- npmjs.com → package → **Settings** → **Trusted publishing**: add GitHub
  Actions with owner `krav4enkodm`, repository `agent-video-recorder` and
  workflow `release.yml`. A new configuration expires if nothing publishes
  through it within two days.
- `repository.url` in `package.json` must match the GitHub repository exactly.

Trusted publishing needs npm 11.5.1 or later; the workflow installs a pinned
npm (`NPM_VERSION` in `release.yml`) because Node 22 ships with npm 10.

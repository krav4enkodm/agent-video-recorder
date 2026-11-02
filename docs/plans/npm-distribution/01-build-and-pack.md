# 01 — Build to JS and make the package publishable

Stack 1/6. The package ships compiled JavaScript instead of TypeScript sources,
and `npm pack` produces a tarball that works when installed on its own.

## Scope

- **Build** (`package.json` script `build`):
  - Transpile `src/**/*.ts` (not specs) to CommonJS in `dist/` with esbuild
    (already a devDependency), `platform: node`, `format: cjs`,
    `target: node22`, one output file per input (no bundling), so
    `__dirname` in `src/lib/overlay/overlay.ts:15` still resolves next to the file.
  - Copy `src/lib/overlay/runtime.browser.js` to `dist/lib/overlay/`.
  - Keep declarations from `tsc -b tsconfig.lib.json` (already writes `.d.ts`
    to `dist/`). `build` = clean `dist/`, then tsc, then esbuild, then copy.
- **`package.json`**:
  - Remove `"private": true`. Version `0.1.0` (and `src/lib/version.ts`; the
    existing `version.spec.ts` keeps them in sync).
  - `main`/`types`/`exports` point to `dist/*.js` and `dist/*.d.ts` (`.` and
    `./test`, both `require` and `default`, plus `./package.json`).
  - `files`: `dist`, `bin`, `README.md`, `LICENSE`, `docs/configuration.md`.
    Not `skills/`, `src/`, `test/`, `tasks/`, `.claude-plugin/`.
  - `engines.node`: `>=22.12`. `commander@15` is ESM-only
    (`"type": "module"`); the CJS build `require`s it, which needs
    unflagged `require(esm)` (Node 22.12+).
  - `prepack`: `pnpm build`. Add `repository`, `homepage`, `bugs`, `keywords`,
    `license` (value from decision below), `author`.
  - `tsx` stays in `dependencies` (scenario files).
- **`bin/avr.cjs`**: require `../dist/cli/main.js`; no tsx registration here.
- **`src/cli/main.ts` `loadScenario`**: call `require('tsx/cjs/api').register()`
  once, just before `createRequire(__filename)(file)`, so only scenario files go
  through tsx. Update the comment at `main.ts:126`.
- **`LICENSE`** file at the root.
- **Pack smoke test**: `scripts/smoke-pack.sh` — `npm pack` into a temp dir,
  `npm install <tarball>` into an empty temp project, run
  `npx avr --version` and `npx avr record <tmp>/smoke.scenario.ts --out <tmp>/out.mp4`,
  assert exit 0 and the JSON line has `path`. Script `test:pack` runs it.
  `test/fixtures/demo.scenario.ts` can't be used: it imports `../../src`.
  Add `test/fixtures/smoke.scenario.ts` with **no imports** (the form the
  skill documents) that opens a copy of `demo-app.html` via a `file://` URL
  built from `__dirname`, and clicks one link.
- `.gitignore` already ignores `dist/`; nothing to change.

## Out of scope

- CI that runs the smoke test: 02.
- ffmpeg fallback: 03. Chromium auto-install: 04.
- Publishing: 06.

## Decisions

- Per-file transpile rather than a bundle: keeps `__dirname` paths and
  stack traces readable, and `playwright-core` must stay external anyway.
- License: MIT (decided 2026-11-02). `LICENSE` holds the MIT text, `"license": "MIT"`.

## Done when

- Tests: `pnpm typecheck`, `pnpm test` and `pnpm test:integration` pass
  (`cli.int.spec.ts` runs `bin/avr.cjs`, which now needs `pnpm build` first —
  add a `pretest:integration` that builds).
- `pnpm test:pack` passes on this machine (Arch Linux).
- `npm pack --dry-run` lists no `src/`, `test/`, `tasks/` or `skills/` files.
